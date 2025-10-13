// scripts/seed-scenarios.js
/**
 * Seed scenario dataset into "scenarios" collection.
 * Expects data/scenarios.json like:
 * {
 *   "scenarios": [
 *     { "prompt":"...", "options":["A","B","C","D"], "correctIndex":1, "tags":["..."], "enabled":true, "weight":1 },
 *     ...
 *   ],
 *   "defaults": { "revealMode":"instant", "pointsOnCorrect":10 } // optional, not stored here
 * }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectMongo, closeMongo, getDb, collections } from "../src/db/mongo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  await connectMongo();
  const { scenarios } = collections();

  // Locate data/scenarios.json regardless of CWD
  const dataPath = path.resolve(__dirname, "../data/scenarios.json");
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found: ${dataPath}`);
  }
  const raw = fs.readFileSync(dataPath, "utf8");
  const json = JSON.parse(raw);

  const list = Array.isArray(json) ? json : (Array.isArray(json.scenarios) ? json.scenarios : []);
  if (!list.length) throw new Error("No scenarios found in data/scenarios.json");


  // Minimal normalize
  const docs = list.map((s) => ({
    prompt: s.prompt,
    options: s.options,
    correctIndex: Number.isInteger(s.correctIndex) ? s.correctIndex : (Number.isInteger(s.answer) ? s.answer : 0),
    host: s.host || s.persona || "Elio",
    tags: s.tags || [],
    enabled: s.enabled ?? true,
    createdAt: new Date(),
  }));

  await scenarios.deleteMany({});
  const { insertedCount } = await scenarios.insertMany(docs);
  console.log(`[INT] scenarios inserted: ${insertedCount}`);
}

main()
  .catch((e) => {
    console.error("[ERR] seed-scenarios failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await closeMongo();
  });