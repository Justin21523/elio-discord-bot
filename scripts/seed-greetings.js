// /scripts/seed-greetings.js
// Seed greetings from /data/greetings.json using greetings service upsertMany.

import fs from "node:fs";
import path from "node:path";
import { upsertMany } from "../src/services/greetings.js";

async function main() {
  await connectMongo();      // << 必加
  try {
    if (import.meta.url === `file://${process.argv[1]}`) main();
      const file = path.resolve("data/greetings.json");
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const docs = Array.isArray(raw.greetings) ? raw.greetings : [];
      const res = await upsertMany(docs);
    if (res.ok) {
      console.log(`[JOB] greetings upserted=${res.data.upserted} modified=${res.data.modified}`);
      process.exit(0);
    } else {
      console.error("[ERR] seed-greetings failed:", res.error);
      process.exit(1);
    }
  } finally {
    await closeMongo();      // << 必加
  }
}

