/**
 * Simple Proactive Features Setup - Direct MongoDB Insert
 */

import { MongoClient } from "mongodb";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://dev:devpass@localhost:27017/?authSource=admin";
const DB_NAME = process.env.DB_NAME || "communiverse_bot";

async function setup() {
  console.log("🚀 Setting up proactive features (simple mode)...\n");

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB\n");

    const db = client.db(DB_NAME);
    const col = db.collection("proactive_features");

    const guildId = "1419056518388519054";
    const mainChannelId = "1428125423404847205";

    // Drop existing configs
    await col.deleteMany({ guildId });
    console.log("✓ Cleared existing configs\n");

    // Insert all proactive features
    const features = [
      {
        guildId,
        feature: "auto_meme_drop",
        enabled: true,
        config: {
          channelIds: [mainChannelId],
          searchQueries: ["space memes", "alien memes", "sci-fi humor", "galaxy jokes"],
          maxPerDay: 4,
          minNoveltyScore: 0.3
        },
        createdAt: new Date()
      },
      {
        guildId,
        feature: "auto_persona_chat",
        enabled: true,
        config: {
          channelIds: [mainChannelId],
          maxPerDay: 12,
          personas: ["Elio", "Glordon", "Olga", "Caleb"]
        },
        createdAt: new Date()
      },
      {
        guildId,
        feature: "auto_mini_game",
        enabled: true,
        config: {
          channelIds: [mainChannelId],
          gameTypes: ["trivia", "riddle"],
          maxPerDay: 6
        },
        createdAt: new Date()
      },
      {
        guildId,
        feature: "auto_story_weave",
        enabled: true,
        config: {
          channelIds: [mainChannelId],
          themes: ["space adventure", "alien encounter", "Communiverse legends"],
          maxPerDay: 1
        },
        createdAt: new Date()
      },
      {
        guildId,
        feature: "auto_world_builder",
        enabled: true,
        config: {
          channelIds: [mainChannelId],
          topics: ["new planet", "alien species", "cosmic phenomena"],
          maxPerDay: 1
        },
        createdAt: new Date()
      },
      {
        guildId,
        feature: "channel_summary",
        enabled: true,
        config: {
          channelIds: [mainChannelId],
          lookbackHours: 24,
          minMessages: 10
        },
        createdAt: new Date()
      }
    ];

    const result = await col.insertMany(features);
    console.log(`✓ Inserted ${result.insertedCount} proactive features\n`);

    // Create indexes
    await col.createIndex({ guildId: 1, feature: 1 }, { unique: true });
    console.log("✓ Created indexes\n");

    // Create meme_drops collection
    const memeCol = db.collection("meme_drops");
    await memeCol.createIndex({ droppedAt: -1 });
    await memeCol.createIndex({ guildId: 1, droppedAt: -1 });
    console.log("✓ Created meme_drops indexes\n");

    // Verify
    console.log("📋 Configured Features:");
    const allFeatures = await col.find({ guildId }).toArray();
    allFeatures.forEach(f => {
      console.log(`  ✓ ${f.feature}: ${f.enabled ? 'ENABLED' : 'DISABLED'}`);
    });

    console.log("\n✅ Setup complete!");
    console.log("\n📝 Active Features:");
    console.log("  • Auto meme drops: Every 6 hours");
    console.log("  • Auto persona chats: Every 2 hours");
    console.log("  • Auto mini games: Every 4 hours");
    console.log("  • Auto story weave: Daily at noon");
    console.log("  • Auto world builder: Daily at midnight");
    console.log("  • Channel summaries: Daily at 23:00");
    console.log("  • Cosmic digest: Daily at 10:00 (built-in)");
    console.log("  • Dynamic data updates: Weekly Sundays 3 AM (built-in)");

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await client.close();
  }
}

setup().catch(console.error);
