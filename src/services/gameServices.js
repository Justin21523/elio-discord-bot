/**
 * services/gameService.js
 * Quick-react game orchestration with race condition protection.
 * Uses atomic database operations to ensure only one winner.
 */

import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { award, updateWinStreak } from "./pointsService.js";
import { incCounter } from "../util/metrics.js";

/**
 * Game configuration
 */
const GAME_CONFIG = {
  winPoints: 10, // Points awarded to winner
  lateClickPoints: 1, // Points for participation (optional)
  cooldownSeconds: 30, // Cooldown per user between games
  maxDailyWins: 50, // Max wins per user per day (anti-spam)
};

/**
 * Start a new game
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.channelId
 * @param {string} params.messageId - Message ID containing the game button
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function startGame({ guildId, channelId, messageId }) {
  try {
    const db = getDB();
    const now = new Date();

    const gameDoc = {
      guildId,
      channelId,
      messageId,
      type: "first_click",
      status: "open",
      startedAt: now,
      winnerUserId: null,
    };

    const result = await db.collection("games").insertOne(gameDoc);

    logger.info("[Game] Started", {
      guildId,
      channelId,
      gameId: result.insertedId.toString(),
    });

    incCounter("games_total", { type: "first_click" }, 1);

    return {
      ok: true,
      data: {
        gameId: result.insertedId.toString(),
        status: "open",
      },
    };
  } catch (error) {
    logger.error("[Game] startGame failed", {
      guildId,
      channelId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to start game",
        cause: error,
      },
    };
  }
}

/**
 * Handle button click with race condition protection
 * Uses findOneAndUpdate with atomic status check to ensure only one winner
 * @param {Object} params
 * @param {string} params.gameId
 * @param {string} params.userId
 * @param {string} params.guildId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function handleClick({ gameId, userId, guildId }) {
  try {
    const db = getDB();
    const { ObjectId } = await import("mongodb");

    // Check cooldown
    const cooldownCheck = await checkCooldown({ guildId, userId });
    if (!cooldownCheck.ok) {
      return cooldownCheck;
    }

    // Atomic operation: only succeeds if game is still open
    const result = await db.collection("games").findOneAndUpdate(
      {
        _id: new ObjectId(gameId),
        status: "open", // Critical: only update if still open
      },
      {
        $set: {
          status: "closed",
          winnerUserId: userId,
          closedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    // Check if this user won the race
    if (!result.value) {
      // Game was already closed by another player
      logger.info("[Game] Late click", {
        gameId,
        userId,
        guildId,
      });

      return {
        ok: false,
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: "Too late! Someone else clicked first.",
        },
      };
    }

    // This user won!
    logger.info("[Game] Winner", {
      gameId,
      userId,
      guildId,
    });

    // Award points
    const awardResult = await award({
      guildId,
      userId,
      points: GAME_CONFIG.winPoints,
      source: "game_win",
    });

    if (!awardResult.ok) {
      logger.warn("[Game] Failed to award points", {
        gameId,
        userId,
        error: awardResult.error,
      });
    }

    // Update streak
    await updateWinStreak({ guildId, userId });

    // Record win timestamp for cooldown
    await db
      .collection("profiles")
      .updateOne({ guildId, userId }, { $set: { lastGameWinAt: new Date() } });

    incCounter("game_wins_total", { type: "first_click" }, 1);

    return {
      ok: true,
      data: {
        winner: true,
        points: awardResult.ok ? awardResult.data : null,
      },
    };
  } catch (error) {
    logger.error("[Game] handleClick failed", {
      gameId,
      userId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to process click",
        cause: error,
      },
    };
  }
}

/**
 * Check if user is on cooldown
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId
 * @returns {Promise<{ok: boolean, error?: AppError}>}
 */
async function checkCooldown({ guildId, userId }) {
  try {
    const db = getDB();
    const profile = await db
      .collection("profiles")
      .findOne({ guildId, userId });

    if (!profile || !profile.lastGameWinAt) {
      return { ok: true };
    }

    const lastWin = new Date(profile.lastGameWinAt);
    const now = new Date();
    const secondsSinceLastWin = (now - lastWin) / 1000;

    if (secondsSinceLastWin < GAME_CONFIG.cooldownSeconds) {
      const remainingSeconds = Math.ceil(
        GAME_CONFIG.cooldownSeconds - secondsSinceLastWin
      );

      return {
        ok: false,
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: `Please wait ${remainingSeconds} more seconds before playing again.`,
          details: { remainingSeconds },
        },
      };
    }

    return { ok: true };
  } catch (error) {
    logger.error("[Game] checkCooldown failed", {
      guildId,
      userId,
      error: error.message,
    });
    // On error, allow the click (fail open)
    return { ok: true };
  }
}

/**
 * Get game statistics
 * @param {string} guildId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getStats(guildId) {
  try {
    const db = getDB();

    const stats = await db
      .collection("games")
      .aggregate([
        { $match: { guildId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: {
              $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] },
            },
            closed: {
              $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();

    const result = stats[0] || { total: 0, open: 0, closed: 0 };

    return { ok: true, data: result };
  } catch (error) {
    logger.error("[Game] getStats failed", {
      guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get game statistics",
        cause: error,
      },
    };
  }
}

/**
 * Get game configuration (for display)
 * @returns {Object}
 */
export function getConfig() {
  return { ...GAME_CONFIG };
}
