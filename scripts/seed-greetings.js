/**
 * scripts/seed-greetings.js
 * Seed greetings from data/greetings.json using greetings service upsertMany.
 */

import fs from "node:fs";
import path from "node:path";
import { connectMongo, closeMongo } from "../src/db/mongo.js";
import { upsertMany } from "../src/services/greetings.js";

async function main() {
  try {
    console.log("[INT] Seeding greetings...");

    // Connect to MongoDB
    await connectMongo();

    // Read greetings data file
    const file = path.resolve("data/greetings.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const docs = Array.isArray(raw.greetings) ? raw.greetings : [];

    if (docs.length === 0) {
      console.log("[WARN] No greetings found in data file");
      return;
    }

    // Upsert greetings using service
    const res = await upsertMany(docs);

    if (res.ok) {
      console.log(`[INT] Greetings seeded successfully:`);
      console.log(`      Upserted: ${res.data.upserted}`);
      console.log(`      Modified: ${res.data.modified}`);
      process.exit(0);
    } else {
      console.error("[ERR] Failed to seed greetings:", res.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("[ERR] Seeding greetings failed:", error.message);
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
