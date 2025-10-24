/**
 * scripts/seed-scenarios.js
 * Seed scenarios from data/scenarios.json into MongoDB.
 */

import fs from "node:fs";
import path from "node:path";
import { connectMongo, closeMongo, getDb } from "../src/db/mongo.js";

async function main() {
  try {
    console.log("[INT] Seeding scenarios...");

    // Connect to MongoDB
    const db = await connectMongo();
    const col = db.collection("scenarios");

    // Read scenarios data file
    const file = path.resolve("data/scenarios.json");
    const { scenarios } = JSON.parse(fs.readFileSync(file, "utf-8"));

    if (!scenarios || scenarios.length === 0) {
      console.log("[WARN] No scenarios found in data file");
      return;
    }

    // Build bulk upsert operations
    const ops = scenarios.map((s) => ({
      updateOne: {
        filter: { prompt: s.prompt },
        update: {
          $set: {
            prompt: s.prompt,
            options: s.options,
            correctIndex: s.correctIndex,
            tags: s.tags || [],
            enabled: s.enabled !== false,
            weight: typeof s.weight === "number" ? s.weight : 1,
            hostPersonaName: s.hostPersonaName || null,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    }));

    // Execute bulk write
    const res = await col.bulkWrite(ops, { ordered: false });
    const after = await col.countDocuments({});

    console.log(`[INT] Scenarios seeded successfully:`);
    console.log(`      Upserted: ${res.upsertedCount || 0}`);
    console.log(`      Modified: ${res.modifiedCount || 0}`);
    console.log(`      Matched: ${res.matchedCount || 0}`);
    console.log(`      Total in DB: ${after}`);

    process.exit(0);
  } catch (error) {
    console.error("[ERR] Seeding scenarios failed:", error.message);
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
