/**
 * scripts/seed-personas.js
 * Seed database with Elio characters from data/personas.json and data/scenarios.json
 */

import { connectDB, closeDB } from "../src/db/mongo.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load personas from data/personas.json
const personasData = JSON.parse(
  readFileSync(join(__dirname, "../data/personas.json"), "utf-8")
);
const personas = personasData.personas;

// Load scenarios from data/scenarios.json (if exists)
let scenarios = [];
try {
  const scenariosData = JSON.parse(
    readFileSync(join(__dirname, "../data/scenarios.json"), "utf-8")
  );
  scenarios = scenariosData.scenarios || [];
} catch (error) {
  console.log("⚠️  No scenarios.json found, skipping scenarios");
}

async function seed() {
  try {
    console.log("🌱 Seeding personas and scenarios...");

    const db = await connectDB();

    // Seed personas (upsert to update existing ones)
    console.log("\n📝 Seeding personas...");
    let personaCount = 0;
    for (const persona of personas) {
      const result = await db
        .collection("personas")
        .updateOne(
          { name: persona.name },
          { $set: persona },
          { upsert: true }
        );
      if (result.upsertedCount > 0) {
        console.log(`✅ Added persona: ${persona.name}`);
        personaCount++;
      } else {
        console.log(`🔄 Updated persona: ${persona.name}`);
      }
    }

    // Seed scenarios
    console.log("\n📝 Seeding scenarios...");
    let scenarioCount = 0;
    for (const scenario of scenarios) {
      const existing = await db
        .collection("scenarios")
        .findOne({ prompt: scenario.prompt });
      if (existing) {
        console.log(
          `⚠️  Scenario "${scenario.prompt.slice(
            0,
            30
          )}..." already exists, skipping`
        );
      } else {
        await db.collection("scenarios").insertOne(scenario);
        console.log(`✅ Added scenario: "${scenario.prompt.slice(0, 40)}..."`);
        scenarioCount++;
      }
    }

    console.log(`\n🎉 Seeding complete!`);
    console.log(`   Personas added: ${personaCount}/${personas.length}`);
    console.log(`   Scenarios added: ${scenarioCount}/${scenarios.length}`);

    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
}

seed();
