// scripts/seed-greetings.js
/**
 * Seed greetings dataset into the "greetings" collection.
 * Expects a file at data/greetings.json with the shape:
 * { "greetings": [ { "text": "...", "tags":["elio"], "weight":1, "enabled":true }, ... ] }
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "communiverse_bot";
const DATA_FILE = path.resolve("data", "greetings.json");

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}`);
  }
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const list = Array.isArray(raw.greetings) ? raw.greetings : [];
  if (!list.length) throw new Error("No greetings found in the dataset.");

  // Basic validation
  for (const [i, g] of list.entries()) {
    if (typeof g.text !== "string")
      throw new Error(`greetings[${i}].text must be a string`);
    if (g.tags && !Array.isArray(g.tags))
      throw new Error(`greetings[${i}].tags must be an array if present`);
  }

  const client = new MongoClient(uri, {
    directConnection: true,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection("greetings");

  // Optional reset behavior: pass --reset to drop existing docs
  if (process.argv.includes("--reset")) {
    await col.deleteMany({});
  }

  const now = new Date();
  const docs = list.map((g) => ({
    ...g,
    enabled: g.enabled !== false,
    weight: Number.isFinite(g.weight) ? g.weight : 1,
    createdAt: now,
  }));

  const result = await col.insertMany(docs);
  console.log(`[INT] greetings inserted: ${result.insertedCount}`);

  await client.close();
}

main().catch((e) => {
  console.error("[ERR] seed-greetings failed:", e);
  process.exit(1);
});
