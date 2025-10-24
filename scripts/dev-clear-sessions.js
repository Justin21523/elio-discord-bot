// /scripts/dev-clear-sessions.js
// Dev-only helper: mark all scenario_sessions of a guild/channel inactive, or remove them.

import { MongoClient } from "mongodb";
import { config } from "../src/config.js";

async function main() {
  const guildId = process.argv[2];
  const channelId = process.argv[3];
  if (!guildId) {
    console.error("Usage: node scripts/dev-clear-sessions.js <guildId> [channelId] [--remove]");
    process.exit(1);
  }
  const remove = process.argv.includes("--remove");
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.DB_NAME);

  try {
    const filter = { guildId: String(guildId) };
    if (channelId) filter.channelId = String(channelId);

    if (remove) {
      const res = await db.collection("scenario_sessions").deleteMany(filter);
      console.log("[JOB] removed sessions:", res.deletedCount);
    } else {
      const res = await db.collection("scenario_sessions").updateMany(filter, { $set: { active: false } });
      console.log("[JOB] deactivated sessions matched:", res.matchedCount, "modified:", res.modifiedCount);
    }
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
