import { collections } from '../db/mongo.js';
import { CONFIG } from '../config.js';

/** Trivial level curve: level = floor(points / 50) + 1 */
function computeLevel(points) {
  return Math.floor(points / 50) + 1;
}

export async function awardWin({ guildId, userId, points = CONFIG.GAME_WIN_POINTS }) {
  const { profiles } = collections();
  const now = new Date();
  const res = await profiles.findOneAndUpdate(
    { guildId, userId },
    { $inc: { points }, $setOnInsert: { level: 1, streak: 0 }, $set: { lastWinAt: now } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = res.value;
  const level = computeLevel(doc.points);
  if (level !== (doc.level || 1)) {
    await profiles.updateOne({ _id: doc._id }, { $set: { level } });
    doc.level = level;
  }
  return doc;
}

export async function getLeaderboard(guildId, limit = 10) {
  const { profiles } = collections();
  return profiles.find({ guildId }).sort({ points: -1 }).limit(limit).toArray();
}
