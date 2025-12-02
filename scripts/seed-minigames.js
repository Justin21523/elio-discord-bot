/**
 * Seed mini-game content (trivia + adventure stories) into MongoDB.
 * Usage: node scripts/seed-minigames.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectMongo, closeMongo, getCollection } from "../src/db/mongo.js";
import { logger } from "../src/util/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadJson(relativePath) {
  const full = path.join(__dirname, "..", relativePath);
  return JSON.parse(fs.readFileSync(full, "utf-8"));
}

async function seedTrivia() {
  const base = loadJson("data/minigames/trivia.json");
  const expanded = loadJson("data/minigames/trivia-expanded.json");
  const topics = { ...(base.topics || {}), ...(expanded.topics || {}) };
  const docs = [];

  for (const [topic, questions] of Object.entries(topics)) {
    questions.forEach((q, idx) => {
      docs.push({
        topic,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        difficulty: q.difficulty || "normal",
        source: q.source || (relativePath(q) || "seed"),
        order: idx,
      });
    });
  }

  const col = getCollection("trivia_questions");
  await col.deleteMany({});
  if (docs.length) await col.insertMany(docs);
  logger.info(`[SEED] Trivia questions inserted: ${docs.length}`);
}

async function seedAdventure() {
  const story = loadJson("data/minigames/adventure.json");
  const col = getCollection("adventure_stories");
  await col.deleteMany({});
  await col.insertOne({
    name: "Embassy Escape",
    story: story.story,
    createdAt: new Date(),
  });
  logger.info("[SEED] Adventure story inserted: Embassy Escape");
}

function relativePath(q) {
  return q.source || null;
}

async function main() {
  await connectMongo();
  await seedTrivia();
  await seedAdventure();
  await closeMongo();
}

main().catch((err) => {
  logger.error("[SEED] Failed", { error: err.message });
  process.exit(1);
});
