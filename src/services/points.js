// English-only code & comments.
// Domain service: Points & Levels
// - Storage: profiles collection (see DATABASE_SCHEMA.md)
// - Public API returns Result<T> (never throws across boundary)

import { collections, getDb } from '../db/mongo.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';
import { logger as baseLogger } from '../util/logger.js';

const log = baseLogger.child({ svc: 'points' });

/**
 * Result helpers
 */
function ok(data) { return Promise.resolve({ ok: true, data }); }
function err(code, message, details) {
  return Promise.resolve({ ok: false, error: { code, message, details } });
}

/**
 * Default level thresholds (cumulative points required for each level).
 * Example: level = thresholds.findIndex(t > points) - 1
 * You can override per guild via setLevelThresholds() if you later add a config collection.
 */
const DEFAULT_THRESHOLDS = [0, 10, 30, 60, 100, 160, 230, 320, 430, 560, 700];

/**
 * Internal: compute level from points and thresholds.
 */
function computeLevel(points, thresholds = DEFAULT_THRESHOLDS) {
  let lvl = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (points >= thresholds[i]) lvl = i;
    else break;
  }
  return lvl;
}

/**
 * Optionally load per-guild thresholds.
 * For now, return default. Designed for future extension (points_config collection).
 */
async function loadThresholdsForGuild(_guildId) {
  // Future: read from db.collection('points_config') if exists.
  return DEFAULT_THRESHOLDS;
}

/**
 * Ensure a profile exists, returns the profile document.
 */
async function _ensureProfile(guildId, userId) {
  const col = collections('profiles');
  const now = new Date();
  await col.updateOne(
    { guildId, userId },
    { $setOnInsert: { points: 0, level: 0, streak: 0, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true }
  );
  return await col.findOne({ guildId, userId });
}

/**
 * Public: award points to a user and recompute level.
 */
export async function award(guildId, userId, delta) {
  const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'points.award' });
  try {
    if (!guildId || !userId) return err('BAD_REQUEST', 'guildId/userId is required');
    const n = Number(delta);
    if (!Number.isFinite(n)) return err('BAD_REQUEST', 'delta must be a number');

    const col = collections('profiles');
    const thresholds = await loadThresholdsForGuild(guildId);

    // Upsert points first
    const res = await col.findOneAndUpdate(
      { guildId, userId },
      { $inc: { points: n }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after', upsert: true }
    );
    const after = res.value || await _ensureProfile(guildId, userId);
    const newLevel = computeLevel(after.points, thresholds);

    // If level changed, persist
    if (after.level !== newLevel) {
      await col.updateOne({ guildId, userId }, { $set: { level: newLevel, updatedAt: new Date() } });
      after.level = newLevel;
    }

    incCounter(METRIC_NAMES.jobs_total, { kind: 'points_award' }, 1);
    stop({ tool: 'points.award' });
    return ok({ points: after.points, level: after.level });
  } catch (e) {
    log.error('award failed', { e: String(e), guildId, userId, delta });
    stop({ tool: 'points.award' });
    return err('DB_ERROR', 'Failed to award points');
  }
}

/**
 * Public: get (or create) the profile.
 */
export async function getProfile(guildId, userId) {
  const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'points.getProfile' });
  try {
    const prof = await _ensureProfile(guildId, userId);
    stop();
    return ok(prof);
  } catch (e) {
    log.error('getProfile failed', { e: String(e), guildId, userId });
    stop();
    return err('DB_ERROR', 'Failed to get profile');
  }
}

/**
 * Public: leaderboard by points (desc).
 */
export async function leaderboard({ guildId, limit = 10 }) {
  const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'points.leaderboard' });
  try {
    const col = collections('profiles');
    const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const cur = col.find({ guildId }).sort({ points: -1, updatedAt: -1 }).limit(n);
    const docs = await cur.toArray();

    // Get total count
    const total = await col.countDocuments({ guildId });

    // Add rank to each entry
    const entries = docs.map((d, index) => ({
      rank: index + 1,
      userId: d.userId,
      points: d.points || 0,
      level: d.level || 0,
      streak: d.streak || 0
    }));

    stop();
    return ok({ entries, total });
  } catch (e) {
    log.error('leaderboard failed', { e: String(e), guildId, limit });
    stop();
    return err('DB_ERROR', 'Failed to get leaderboard');
  }
}

/**
 * Public: returns computed level for a raw points number (utility).
 */
export async function currentLevel(points) {
  try {
    return ok(computeLevel(Number(points) || 0));
  } catch {
    return err('VALIDATION_FAILED', 'invalid points');
  }
}

/**
 * Optional admin: set points directly (without delta).
 */
export async function setPoints(guildId, userId, points) {
  const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'points.setPoints' });
  try {
    const col = collections('profiles');
    const p = Math.max(0, Math.floor(Number(points) || 0));
    const thresholds = await loadThresholdsForGuild(guildId);
    const level = computeLevel(p, thresholds);
    await col.updateOne(
      { guildId, userId },
      { $set: { points: p, level, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    stop();
    return ok({ points: p, level });
  } catch (e) {
    log.error('setPoints failed', { e: String(e), guildId, userId, points });
    stop();
    return err('DB_ERROR', 'Failed to set points');
  }
}

/**
 * Seasonal reset (keep document; zero points/streak).
 */
export async function seasonalReset(guildId) {
  const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'points.seasonalReset' });
  try {
    const col = collections('profiles');
    const now = new Date();
    const res = await col.updateMany(
      { guildId },
      { $set: { points: 0, level: 0, streak: 0, updatedAt: now } }
    );
    stop();
    return ok({ matched: res.matchedCount, modified: res.modifiedCount });
  } catch (e) {
    log.error('seasonalReset failed', { e: String(e), guildId });
    stop();
    return err('DB_ERROR', 'Failed to reset season');
  }
}

export default {
  award,
  getProfile,
  leaderboard,
  currentLevel,
  setPoints,
  seasonalReset,
};
