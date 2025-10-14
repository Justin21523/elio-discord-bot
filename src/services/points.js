// Domain Service: Points / Levels
// English-only. In-memory store.
import { withCollection } from "../db/mongo.js";
import { incCounter } from "../util/metrics.js";

const LEVEL_THRESHOLDS = [0, 50, 120, 250, 500, 900, 1500]; // simple defaults

const _users = new Map(); // key: `${guildId}:${userId}` -> { points, lastAwardAt }

function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

export async function award({ guildId, userId, amount, reason = "", sourceRef = null, seasonId = null }) {
  try {
    if (!guildId || !userId || !Number.isFinite(amount)) {
      return err("VALIDATION_FAILED", "Invalid award payload");
    }
    const now = new Date();
    const res = await withCollection("profiles", async (col) => {
      const update = {
        $inc: { points: amount },
        $setOnInsert: { createdAt: now },
        $set: { updatedAt: now, seasonId: seasonId || null },
        $push: { history: { t: now, amount, reason, sourceRef } },
      };
      const { value } = await col.findOneAndUpdate(
        { guildId, userId },
        update,
        { upsert: true, returnDocument: "after" }
      );
      return value;
    });

    incCounter("commands_total", { command: "points.award" });
    return ok({ profile: decorateLevel(res) });
  } catch (cause) {
    return err("DB_ERROR", "Award points failed", cause);
  }
}

export async function leaderboard({ guildId, seasonId = null, limit = 10 }) {
  try {
    const rows = await withCollection("profiles", async (col) => {
      const q = { guildId };
      if (seasonId !== null) q.seasonId = seasonId;
      return col.find(q).sort({ points: -1 }).limit(limit).toArray();
    });

    incCounter("commands_total", { command: "points.leaderboard" });
    return ok({ entries: rows.map(decorateLevel) });
  } catch (cause) {
    return err("DB_ERROR", "Leaderboard query failed", cause);
  }
}

export async function getProfile({ guildId, userId }) {
  try {
    const doc = await withCollection("profiles", (col) => col.findOne({ guildId, userId }));
    if (!doc) return err("NOT_FOUND", "Profile not found");
    return ok({ profile: decorateLevel(doc) });
  } catch (cause) {
    return err("DB_ERROR", "Get profile failed", cause);
  }
}

export function currentLevel(points) {
  let lvl = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) lvl = i;
  }
  return { level: lvl, nextAt: LEVEL_THRESHOLDS[lvl + 1] ?? null };
}

function decorateLevel(profile) {
  const { level, nextAt } = currentLevel(profile.points || 0);
  return { ...profile, level, nextLevelAt: nextAt };
}