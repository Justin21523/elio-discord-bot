import { getCollection } from "../../db/mongo.js";

const RECENCY_DECAY_MS = 60 * 60 * 1000; // 1 hour
const MIN_EVENTS = 3;

export async function recommendGames(userId, guildId) {
  const metricsCol = getCollection("user_metrics");
  const userMetrics = await metricsCol.findOne({ userId, guildId: guildId || null });
  const globalMetrics = await metricsCol
    .aggregate([
      {
        $group: {
          _id: "$gameCounts",
          counts: { $push: "$gameCounts" },
        },
      },
    ])
    .toArray();

  const popularity = aggregateGlobal(globalMetrics);

  if (!userMetrics || Object.keys(userMetrics.gameCounts || {}).length < MIN_EVENTS) {
    return topN(popularity, 3);
  }

  const scores = {};
  for (const [game, count] of Object.entries(userMetrics.gameCounts || {})) {
    const last = userMetrics.lastPlayed?.[game];
    const recencyFactor = last ? recencyWeight(Date.parse(last)) : 1;
    const win = userMetrics.winRates?.[game] || 0;
    scores[game] = (count + 1) * (0.7 + 0.3 * win) * recencyFactor;
  }

  // Include popular games user hasn't tried
  for (const [game, count] of Object.entries(popularity)) {
    if (scores[game]) continue;
    scores[game] = count * 0.5; // lower weight for unseen
  }

  return topN(scores, 3);
}

function recencyWeight(ts) {
  if (!ts) return 1;
  const age = Date.now() - ts;
  if (age < RECENCY_DECAY_MS) return 0.4; // discourage repeating immediately
  if (age < RECENCY_DECAY_MS * 3) return 0.7;
  return 1.0;
}

function aggregateGlobal(globalMetrics) {
  const totals = {};
  for (const doc of globalMetrics) {
    for (const [game, count] of Object.entries(doc._id || {})) {
      totals[game] = (totals[game] || 0) + count;
    }
  }
  return totals;
}

function topN(scores, n) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([game, score]) => ({ game, score }));
}

export default { recommendGames };
