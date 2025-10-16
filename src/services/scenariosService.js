/**
 * services/scenariosService.js
 * Scenario quiz session management.
 * Handles scenario sessions, answer recording, and result revelation.
 */

import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { award } from "./pointsService.js";

/**
 * Pick random scenario
 * @param {Object} options
 * @param {string[]} [options.tags] - Filter by tags
 * @param {string} [options.host] - Filter by host persona
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
async function pickRandomScenario({ tags = null, host = null } = {}) {
  try {
    const db = getDB();

    const query = { enabled: true };
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    if (host) {
      query.host = host;
    }

    const count = await db.collection("scenarios").countDocuments(query);

    if (count === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "No scenarios available",
        },
      };
    }

    const scenarios = await db
      .collection("scenarios")
      .aggregate([{ $match: query }, { $sample: { size: 1 } }])
      .toArray();

    return { ok: true, data: scenarios[0] };
  } catch (error) {
    logger.error("[Scenarios] pickRandomScenario failed", {
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to pick scenario",
        cause: error,
      },
    };
  }
}

/**
 * Start a new scenario session
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.channelId
 * @param {string} [params.messageId] - Message containing the scenario
 * @param {string} [params.scenarioId] - Specific scenario (if not provided, picks random)
 * @param {number} [params.revealAfterMinutes=5] - Auto-reveal after N minutes
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function startSession({
  guildId,
  channelId,
  messageId = null,
  scenarioId = null,
  revealAfterMinutes = 5,
}) {
  try {
    const db = getDB();
    const { ObjectId } = await import("mongodb");

    let scenario;
    if (scenarioId) {
      scenario = await db.collection("scenarios").findOne({
        _id: new ObjectId(scenarioId),
        enabled: true,
      });
      if (!scenario) {
        return {
          ok: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: "Scenario not found",
          },
        };
      }
    } else {
      const pickResult = await pickRandomScenario();
      if (!pickResult.ok) return pickResult;
      scenario = pickResult.data;
    }

    // Generate unique session ID
    const sessionId = `SCN-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const revealAt = new Date(Date.now() + revealAfterMinutes * 60 * 1000);

    const sessionDoc = {
      sessionId,
      guildId,
      channelId,
      scenarioId: scenario._id,
      messageId,
      revealAt,
      revealed: false,
      createdAt: new Date(),
    };

    await db.collection("scenario_sessions").insertOne(sessionDoc);

    logger.info("[Scenarios] Session started", {
      sessionId,
      guildId,
      channelId,
      scenarioId: scenario._id.toString(),
      revealAt,
    });

    return {
      ok: true,
      data: {
        sessionId,
        scenario,
        revealAt,
      },
    };
  } catch (error) {
    logger.error("[Scenarios] startSession failed", {
      guildId,
      channelId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to start scenario session",
        cause: error,
      },
    };
  }
}

/**
 * Record user's answer
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.userId
 * @param {number} params.answerIndex - 0-3
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function answer({ sessionId, userId, answerIndex }) {
  try {
    const db = getDB();

    // Validate answer index
    if (![0, 1, 2, 3].includes(answerIndex)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Answer index must be 0, 1, 2, or 3",
        },
      };
    }

    // Get session
    const session = await db
      .collection("scenario_sessions")
      .findOne({ sessionId });
    if (!session) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Session not found",
        },
      };
    }

    // Check if already answered
    const existing = await db.collection("scenario_answers").findOne({
      sessionId,
      userId,
    });

    if (existing) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "You have already answered this scenario",
        },
      };
    }

    // Get scenario to check correct answer
    const scenario = await db
      .collection("scenarios")
      .findOne({ _id: session.scenarioId });
    if (!scenario) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Scenario not found",
        },
      };
    }

    const correct = answerIndex === scenario.correctIndex;

    // Record answer
    const answerDoc = {
      sessionId,
      userId,
      answerIndex,
      correct,
      createdAt: new Date(),
    };

    await db.collection("scenario_answers").insertOne(answerDoc);

    logger.info("[Scenarios] Answer recorded", {
      sessionId,
      userId,
      answerIndex,
      correct,
    });

    return {
      ok: true,
      data: {
        correct,
        recorded: true,
      },
    };
  } catch (error) {
    // Check for duplicate key error (race condition)
    if (error.code === 11000) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "You have already answered this scenario",
        },
      };
    }

    logger.error("[Scenarios] answer failed", {
      sessionId,
      userId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to record answer",
        cause: error,
      },
    };
  }
}

/**
 * Reveal scenario results and award points
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.guildId
 * @param {number} [params.correctPoints=15] - Points for correct answer
 * @param {number} [params.participationPoints=3] - Points for participation
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function reveal({
  sessionId,
  guildId,
  correctPoints = 15,
  participationPoints = 3,
}) {
  try {
    const db = getDB();

    // Get session
    const session = await db
      .collection("scenario_sessions")
      .findOne({ sessionId });
    if (!session) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Session not found",
        },
      };
    }

    if (session.revealed) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Session already revealed",
        },
      };
    }

    // Get scenario
    const scenario = await db
      .collection("scenarios")
      .findOne({ _id: session.scenarioId });
    if (!scenario) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Scenario not found",
        },
      };
    }

    // Get all answers
    const answers = await db
      .collection("scenario_answers")
      .find({ sessionId })
      .toArray();

    // Award points
    const awarded = [];
    for (const ans of answers) {
      const points = ans.correct ? correctPoints : participationPoints;
      const awardResult = await award({
        guildId,
        userId: ans.userId,
        points,
        source: "scenario_quiz",
      });

      if (awardResult.ok) {
        awarded.push({
          userId: ans.userId,
          correct: ans.correct,
          points,
          newTotal: awardResult.data.points,
        });
      }
    }

    // Mark session as revealed
    await db
      .collection("scenario_sessions")
      .updateOne(
        { sessionId },
        { $set: { revealed: true, revealedAt: new Date() } }
      );

    logger.info("[Scenarios] Session revealed", {
      sessionId,
      guildId,
      totalAnswers: answers.length,
      correctCount: answers.filter((a) => a.correct).length,
      awarded: awarded.length,
    });

    return {
      ok: true,
      data: {
        scenario,
        correctIndex: scenario.correctIndex,
        correctOption: scenario.options[scenario.correctIndex],
        totalAnswers: answers.length,
        correctCount: answers.filter((a) => a.correct).length,
        awarded,
      },
    };
  } catch (error) {
    logger.error("[Scenarios] reveal failed", {
      sessionId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to reveal scenario",
        cause: error,
      },
    };
  }
}

/**
 * Get session statistics
 * @param {string} sessionId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getSessionStats(sessionId) {
  try {
    const db = getDB();

    const session = await db
      .collection("scenario_sessions")
      .findOne({ sessionId });
    if (!session) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Session not found",
        },
      };
    }

    const answers = await db
      .collection("scenario_answers")
      .find({ sessionId })
      .toArray();

    const stats = {
      sessionId,
      totalAnswers: answers.length,
      correctCount: answers.filter((a) => a.correct).length,
      incorrectCount: answers.filter((a) => !a.correct).length,
      revealed: session.revealed,
      revealAt: session.revealAt,
    };

    if (session.revealed) {
      // Count answers per option
      stats.answerDistribution = [0, 0, 0, 0];
      for (const ans of answers) {
        stats.answerDistribution[ans.answerIndex]++;
      }
    }

    return { ok: true, data: stats };
  } catch (error) {
    logger.error("[Scenarios] getSessionStats failed", {
      sessionId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get session stats",
        cause: error,
      },
    };
  }
}
