/**
 * Refresh achievements based on inventory and event counts.
 * Usage: node scripts/reset-achievements.js
 */
import { connectMongo, closeMongo, getCollection } from "../src/db/mongo.js";
import { logger } from "../src/util/logger.js";

const ACHIEVEMENTS = {
  pulls: [10, 25, 50, 100, 200],
  wins: [3, 10, 25],
  rareDrops: { Epic: 5, Legendary: 2 },
};

async function refresh() {
  await connectMongo();
  const invCol = getCollection("inventory");
  const eventsCol = getCollection("events");

  const users = await invCol.find({}).toArray();
  for (const user of users) {
    const achievements = new Set(user.achievements || []);
    // Pulls
    for (const t of ACHIEVEMENTS.pulls) {
      if ((user.totalPulls || 0) >= t) achievements.add(`Pulls_${t}`);
    }
    // Rare drops
    for (const [rarity, needed] of Object.entries(ACHIEVEMENTS.rareDrops)) {
      const count = user.rarityCounts?.[rarity] || 0;
      if (count >= needed) achievements.add(`${rarity}_${needed}`);
    }
    // Wins (from events)
    const wins = await eventsCol.countDocuments({
      action: "end",
      "meta.winnerId": user.userId,
    });
    for (const t of ACHIEVEMENTS.wins) {
      if (wins >= t) achievements.add(`Wins_${t}`);
    }

    await invCol.updateOne(
      { _id: user._id },
      { $set: { achievements: Array.from(achievements) } }
    );
  }

  logger.info("[ACHIEVEMENTS] refreshed", { users: users.length });
  await closeMongo();
}

refresh().catch((err) => {
  console.error(err);
  process.exit(1);
});
