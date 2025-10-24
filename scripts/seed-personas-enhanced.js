/**
 * seed-personas-enhanced.js
 * Update personas in MongoDB with enhanced personality definitions
 */

import { connectDB, closeDB, getCollection } from "../src/db/mongo.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedPersonasEnhanced() {
  console.log("[SEED] Starting enhanced persona seeding...");

  await connectDB();

  const personasCol = getCollection("personas");

  // Load enhanced personas
  const filePath = resolve(__dirname, "../data/personas-enhanced.json");
  const data = JSON.parse(readFileSync(filePath, "utf-8"));

  console.log(`[SEED] Found ${data.personas.length} enhanced personas`);

  for (const persona of data.personas) {
    try {
      await personasCol.updateOne(
        { name: persona.name },
        {
          $set: {
            ...persona,
            avatarUrl: persona.avatar,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      console.log(`[SEED] ✓ ${persona.name} - Enhanced personality loaded`);
    } catch (error) {
      console.error(`[SEED] ✗ ${persona.name} -`, error.message);
    }
  }

  console.log("[SEED] Enhanced persona seeding complete!");

  await closeDB();
}

seedPersonasEnhanced().catch((err) => {
  console.error("[SEED] Fatal error:", err);
  process.exit(1);
});
