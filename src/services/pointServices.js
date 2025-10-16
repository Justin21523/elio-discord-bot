/**
 * services/pointsService.js
 * Points and leveling system with guild-scoped profiles.
 * Handles point awards, level calculations, and leaderboards.
 */

import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";

/**
 * Level thresholds configuration
 * Level N requires reaching this many points
 */
const LEVEL_THRESHOLDS = [
  0, // Level 0
  10, // Level 1
  30, // Level 2
  60, // Level 3
  100, // Level 4
  150, // Level 5
  210, // Level 6
  280, // Level 7
  360, // Level 8
  450, // Level 9
  550, // Level 10
  700, // Level 11
  900, // Level 12
  1150, // Level 13
  1450, // Level 14
  1800, // Level 15
  // Add more levels as needed
];

/**
 * Calculate level from points
 * @param {number} points - Total points
 * @returns {number} Current level
 */
function calculateLevel(points) {
  let level = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= LEVEL_THRESHOLDS[i]) {
      level = i;
      break;
    }
  }
  return level;
}

/**
 * Get points needed for next level
 * @param {number} currentLevel - Current level
 * @returns {number|null} Points needed, or null if max level
 */
function getNextLevelThreshold(currentLevel) {
  if (currentLevel >= LEVEL_THRESHOLDS.length - 1) {
    return null; // Max level reached
  }
  return LEVEL_THRESHOLDS[currentLevel + 1];
}

/**
 * Award points to a user
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId
 * @param {number} params.points - Points to award (can be negative for penalties)
 * @param {string} [params.source] - Source of points (e.g., "game_win", "daily_bonus")
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function award({ guildId, userId, points, source = "manual" }) {
  try {
    if (!guildId || !userId) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "guildId and userId are required",
        },
      };
    }

    if (typeof points !== "number" || isNaN(points)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "points must be a valid number",
        },
      };
    }

    const db = getDB();
    const now = new Date();

    // Upsert profile with atomic point addition
    const result = await db.collection("profiles").findOneAndUpdate(
      { guildId, userId },
      {
        $inc: { points },
        $set: { updatedAt: now },
        $setOnInsert: { createdAt: now, lastWinAt: null, streak: 0 },
      },
      { upsert: true, returnDocument: "after" }
    );

    const profile = result.value;

    // Recalculate level
    const newLevel = calculateLevel(profile.points);
    const oldLevel = profile.level || 0;
    const leveledUp = newLevel > oldLevel;

    // Update level if changed
    if (leveledUp) {
      await db
        .collection("profiles")
        .updateOne({ _id: profile._id }, { $set: { level: newLevel } });
      profile.level = newLevel;
    }

    logger.info("[Points] Points awarded", {
      guildId,
      userId,
      points,
      source,
      newTotal: profile.points,
      newLevel,
      leveledUp,
    });

    return {
      ok: true,
      data: {
        points: profile.points,
        awarded: points,
        level: newLevel,
        leveledUp,
        nextLevelAt: getNextLevelThreshold(newLevel),
      },
    };
  } catch (error) {
    logger.error("[Points] award failed", {
      guildId,
      userId,
      points,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to award points",
        cause: error,
      },
    };
  }
}

/**
 * Get user profile
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getProfile({ guildId, userId }) {
  try {
    const db = getDB();
    const profile = await db
      .collection("profiles")
      .findOne({ guildId, userId });

    if (!profile) {
      return {
        ok: true,
        data: {
          points: 0,
          level: 0,
          streak: 0,
          lastWinAt: null,
          rank: null,
          nextLevelAt: LEVEL_THRESHOLDS[1],
        },
      };
    }

    // Calculate rank
    const rank =
      (await db.collection("profiles").countDocuments({
        guildId,
        points: { $gt: profile.points },
      })) + 1;

    const level = profile.level || calculateLevel(profile.points);

    return {
      ok: true,
      data: {
        points: profile.points,
        level,
        streak: profile.streak || 0,
        lastWinAt: profile.lastWinAt,
        rank,
        nextLevelAt: getNextLevelThreshold(level),
      },
    };
  } catch (error) {
    logger.error("[Points] getProfile failed", {
      guildId,
      userId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get profile",
        cause: error,
      },
    };
  }
}

/**
 * Get leaderboard for a guild
 * @param {Object} params
 * @param {string} params.guildId
 * @param {number} [params.limit=10] - Number of top users to return
 * @param {number} [params.skip=0] - Skip for pagination
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function leaderboard({ guildId, limit = 10, skip = 0 }) {
  try {
    const db = getDB();

    const profiles = await db
      .collection("profiles")
      .find({ guildId })
      .sort({ points: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await db.collection("profiles").countDocuments({ guildId });

    const entries = profiles.map((p, index) => ({
      userId: p.userId,
      points: p.points,
      level: p.level || calculateLevel(p.points),
      rank: skip + index + 1,
      streak: p.streak || 0,
    }));

    return {
      ok: true,
      data: {
        entries,
        total,
      },
    };
  } catch (error) {
    logger.error("[Points] leaderboard failed", {
      guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get leaderboard",
        cause: error,
      },
    };
  }
}

/**
 * Update last win timestamp and streak
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function updateWinStreak({ guildId, userId }) {
  try {
    const db = getDB();
    const now = new Date();

    const profile = await db
      .collection("profiles")
      .findOne({ guildId, userId });

    let newStreak = 1;
    if (profile && profile.lastWinAt) {
      const lastWin = new Date(profile.lastWinAt);
      const hoursSinceLastWin = (now - lastWin) / (1000 * 60 * 60);

      // If last win was within 24 hours, increment streak
      if (hoursSinceLastWin < 24) {
        newStreak = (profile.streak || 0) + 1;
      }
    }

    await db.collection("profiles").updateOne(
      { guildId, userId },
      {
        $set: {
          lastWinAt: now,
          streak: newStreak,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    return {
      ok: true,
      data: { streak: newStreak },
    };
  } catch (error) {
    logger.error("[Points] updateWinStreak failed", {
      guildId,
      userId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to update win streak",
        cause: error,
      },
    };
  }
}

/**
 * Get current level from points
 * @param {number} points
 * @returns {number}
 */
export function currentLevel(points) {
  return calculateLevel(points);
}

/**
 * Get level thresholds (for display purposes)
 * @returns {number[]}
 */
export function getLevelThresholds() {
  return [...LEVEL_THRESHOLDS];
}
