/**
 * Reset weekly/monthly leaderboards and issue rewards.
 * Usage: node scripts/reset-leaderboards.js --period=week|month
 */
import { connectMongo, closeMongo, getCollection } from "../src/db/mongo.js";
import { logger } from "../src/util/logger.js";

const period = process.argv.includes("--month") ? "month" : "week";

async function reset() {
  await connectMongo();
  const col = getCollection("inventory");
  const lbCol = getCollection("leaderboard_history");

  // Pull top users by points
  const leaders = await col
    .find({})
    .project({ userId: 1, username: 1, points: 1, totalPulls: 1 })
    .sort({ points: -1, totalPulls: -1 })
    .limit(20)
    .toArray();

  // Store history
  await lbCol.insertOne({
    period,
    timestamp: new Date(),
    leaders,
  });

  // Issue simple rewards (e.g., +bonus points)
  const bonus = period === "month" ? 50 : 20;
  const topUserIds = leaders.slice(0, 5).map((u) => u.userId);
  await col.updateMany(
    { userId: { $in: topUserIds } },
    { $inc: { points: bonus } }
  );

  // Reset points (optional) or decay
  await col.updateMany({}, { $set: { points: 0 } });

  logger.info(`[LB RESET] Completed ${period} reset`, { leaders: leaders.length, bonus });
  await closeMongo();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
