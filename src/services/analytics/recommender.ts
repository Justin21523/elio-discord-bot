import { getCollection } from "../../db/mongo.js";

const RECENCY_DECAY_MS = 60 * 60 * 1000; // 1 hour
const MIN_EVENTS = 3;

type UserMetricsDoc = {
  userId: string;
  guildId: string | null;
  gameCounts?: Record<string, number>;
  lastPlayed?: Record<string, string>;
  winRates?: Record<string, number>;
};

export async function recommendGames(
  userId: string,
  guildId?: string | null
): Promise<Array<{ game: string; score: number }>> {
  const metricsCol = getCollection<UserMetricsDoc>("user_metrics");
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

  const popularity = aggregateGlobal(globalMetrics as any[]);

  if (!userMetrics || Object.keys(userMetrics.gameCounts || {}).length < MIN_EVENTS) {
    return topN(popularity, 3);
  }

  const scores: Record<string, number> = {};
  for (const [game, rawCount] of Object.entries(userMetrics.gameCounts || {})) {
    const count = typeof rawCount === "number" ? rawCount : Number(rawCount) || 0;
    const last = userMetrics.lastPlayed?.[game];
    const recencyFactor = last ? recencyWeight(Date.parse(last)) : 1;
    const win = userMetrics.winRates?.[game] || 0;
    scores[game] = (count + 1) * (0.7 + 0.3 * win) * recencyFactor;
  }

  // Include popular games user hasn't tried
  for (const [game, rawCount] of Object.entries(popularity)) {
    if (scores[game] != null) continue;
    const count = typeof rawCount === "number" ? rawCount : Number(rawCount) || 0;
    scores[game] = count * 0.5; // lower weight for unseen
  }

  return topN(scores, 3);
}

function recencyWeight(ts?: number): number {
  if (!ts) return 1;
  const age = Date.now() - ts;
  if (age < RECENCY_DECAY_MS) return 0.4; // discourage repeating immediately
  if (age < RECENCY_DECAY_MS * 3) return 0.7;
  return 1.0;
}

function aggregateGlobal(globalMetrics: any[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const doc of globalMetrics) {
    const counts = (doc?._id || {}) as Record<string, unknown>;
    for (const [game, rawCount] of Object.entries(counts)) {
      const count = typeof rawCount === "number" ? rawCount : Number(rawCount) || 0;
      totals[game] = (totals[game] || 0) + count;
    }
  }
  return totals;
}

function topN(scores: Record<string, number>, n: number) {
  return Object.entries(scores)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, n)
    .map(([game, score]) => ({ game, score }));
}

export default { recommendGames };

