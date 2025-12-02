/**
 * Compute user-level gameplay metrics from events (CPU-only).
 * Usage: node scripts/compute-user-metrics.js
 */
import { fileURLToPath } from "url";
import path from "path";
import { connectMongo, closeMongo, getCollection } from "../src/db/mongo.js";
import { logger } from "../src/util/logger.js";

const DAYS = 30;

function startDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function computeMetrics() {
  const eventsCol = getCollection("events");
  const metricsCol = getCollection("user_metrics");
  const since = startDate(DAYS);

  const cursor = eventsCol.find({ ts: { $gte: since } });
  const data = await cursor.toArray();

  const perUser = new Map(); // key: userId|guildId

  for (const ev of data) {
    const key = `${ev.userId}|${ev.guildId || "global"}`;
    if (!perUser.has(key)) {
      perUser.set(key, {
        userId: ev.userId,
        username: ev.username,
        guildId: ev.guildId || null,
        gameCounts: {},
        lastPlayed: {},
        wins: {},
        ends: {},
        totalEvents: 0,
      });
    }
    const entry = perUser.get(key);
    entry.totalEvents += 1;

    if (ev.action === "start" && ev.gameType) {
      entry.gameCounts[ev.gameType] = (entry.gameCounts[ev.gameType] || 0) + 1;
      entry.lastPlayed[ev.gameType] = ev.ts;
    }
    if (ev.action === "end" && ev.gameType) {
      entry.ends[ev.gameType] = (entry.ends[ev.gameType] || 0) + 1;
      if (ev.meta?.winnerId === ev.userId) {
        entry.wins[ev.gameType] = (entry.wins[ev.gameType] || 0) + 1;
      }
    }
  }

  const bulk = [];
  for (const m of perUser.values()) {
    const winRates = {};
    for (const [g, wins] of Object.entries(m.wins)) {
      const total = m.ends[g] || 1;
      winRates[g] = wins / total;
    }

    bulk.push({
      updateOne: {
        filter: { userId: m.userId, guildId: m.guildId },
        update: {
          $set: {
            username: m.username,
            gameCounts: m.gameCounts,
            lastPlayed: m.lastPlayed,
            winRates,
            totalEvents: m.totalEvents,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (bulk.length > 0) {
    await metricsCol.bulkWrite(bulk);
  }

  logger.info("[METRICS] Updated user_metrics docs", { count: bulk.length });
}

async function main() {
  await connectMongo();
  await computeMetrics();
  await closeMongo();
}

main().catch((err) => {
  logger.error("[METRICS] Failed", { error: err.message });
  process.exit(1);
});
