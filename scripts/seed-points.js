/**
 * scripts/seed-points.js
 * Seed initial points totals and create indexes.
 */

import { connectMongo, closeMongo, withCollection } from "../src/db/mongo.js";

// Default test accounts with initial points
const TOTALS = [
  { guildId: "dev", userId: "u1", total: 100 },
  { guildId: "dev", userId: "u2", total: 50 },
];

async function main() {
  try {
    console.log("[INT] Seeding points...");

    // Connect to MongoDB
    await connectMongo();

    // Seed points_totals collection
    await withCollection("points_totals", async (col) => {
      // Create unique index
      await col.createIndex({ guildId: 1, userId: 1 }, { unique: true });

      // Upsert test accounts
      for (const t of TOTALS) {
        await col.findOneAndUpdate(
          { guildId: t.guildId, userId: t.userId },
          {
            $set: { ...t, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );
      }

      const count = await col.countDocuments({});
      console.log(`[INT] Points totals seeded: ${TOTALS.length} accounts, ${count} total in DB`);
    });

    // Create index for points_ledger collection
    await withCollection("points_ledger", async (col) => {
      await col.createIndex({ guildId: 1, userId: 1, createdAt: -1 });
      console.log(`[INT] Points ledger indexes created`);
    });

    console.log("[INT] Points seeding complete");
    process.exit(0);
  } catch (error) {
    console.error("[ERR] Seeding points failed:", error.message);
    process.exit(1);
  } finally {
    await closeMongo();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;
