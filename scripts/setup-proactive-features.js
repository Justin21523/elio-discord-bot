/**
 * Setup Proactive Features Configuration
 * Configures channel summaries, auto meme drops, and other automated features
 */

import { MongoClient } from "mongodb";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://dev:devpass@localhost:27017/?authSource=admin";
const DB_NAME = process.env.DB_NAME || "communiverse_bot";

async function setupProactiveFeatures() {
  console.log("🚀 Setting up proactive features...\n");

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB\n");

    const db = client.db(DB_NAME);

    // Get guild ID from environment or first guild in bot config
    const guildId = process.env.GUILD_ID_DEV || "1419056518388519054";
    const mainChannelId = process.env.MAIN_CHANNEL_ID || "1428125423404847205";

    console.log(`Guild ID: ${guildId}`);
    console.log(`Main Channel ID: ${mainChannelId}\n`);

    // 1. Setup Channel Summary Schedule
    console.log("📊 Setting up Channel Summary...");
    const schedulesCol = db.collection("schedules");

    const summarySchedule = {
      guildId: guildId,
      channelId: mainChannelId,
      kind: "channel_summary",
      cron: "0 23 * * *", // Daily at 23:00
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await schedulesCol.updateOne(
      { guildId, kind: "channel_summary" },
      { $set: summarySchedule },
      { upsert: true }
    );
    console.log("✓ Channel Summary schedule configured (daily at 23:00)\n");

    // 2. Setup Auto Meme Drop Configuration
    console.log("🎭 Setting up Auto Meme Drop...");
    const proactiveFeaturesCol = db.collection("proactive_features");

    const memeDropConfig = {
      guildId: guildId,
      feature: "auto_meme_drop",
      enabled: true,
      config: {
        channelIds: [mainChannelId],
        searchQueries: [
          "space memes",
          "alien memes funny",
          "sci-fi humor",
          "galaxy jokes",
          "astronaut memes"
        ],
        maxPerDay: 4,
        minNoveltyScore: 0.3,
        searchLimit: 15
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await proactiveFeaturesCol.updateOne(
      { guildId, feature: "auto_meme_drop" },
      { $set: memeDropConfig },
      { upsert: true }
    );
    console.log("✓ Auto Meme Drop configured (every 6 hours)\n");

    // 3. Setup Auto Persona Chat Configuration
    console.log("💬 Setting up Auto Persona Chat...");
    const personaChatConfig = {
      guildId: guildId,
      feature: "auto_persona_chat",
      enabled: true,
      config: {
        channelIds: [mainChannelId],
        maxPerDay: 12,
        personas: ["Elio", "Glordon", "Olga", "Caleb"],
        topics: [
          "daily life in Communiverse",
          "interesting space facts",
          "character interactions",
          "fun observations"
        ]
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await proactiveFeaturesCol.updateOne(
      { guildId, feature: "auto_persona_chat" },
      { $set: personaChatConfig },
      { upsert: true }
    );
    console.log("✓ Auto Persona Chat configured (every 2 hours)\n");

    // 4. Setup Auto Mini Game Configuration
    console.log("🎮 Setting up Auto Mini Game...");
    const miniGameConfig = {
      guildId: guildId,
      feature: "auto_mini_game",
      enabled: true,
      config: {
        channelIds: [mainChannelId],
        gameTypes: ["trivia", "riddle", "quick_react"],
        maxPerDay: 6,
        minParticipants: 1
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await proactiveFeaturesCol.updateOne(
      { guildId, feature: "auto_mini_game" },
      { $set: miniGameConfig },
      { upsert: true }
    );
    console.log("✓ Auto Mini Game configured (every 4 hours)\n");

    // 5. Setup Auto Story Weave Configuration
    console.log("📖 Setting up Auto Story Weave...");
    const storyWeaveConfig = {
      guildId: guildId,
      feature: "auto_story_weave",
      enabled: true,
      config: {
        channelIds: [mainChannelId],
        themes: [
          "space adventure",
          "alien encounter",
          "mystery in the stars",
          "Communiverse legends"
        ],
        maxPerDay: 1
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await proactiveFeaturesCol.updateOne(
      { guildId, feature: "auto_story_weave" },
      { $set: storyWeaveConfig },
      { upsert: true }
    );
    console.log("✓ Auto Story Weave configured (daily at noon)\n");

    // 6. Setup Auto World Builder Configuration
    console.log("🌍 Setting up Auto World Builder...");
    const worldBuilderConfig = {
      guildId: guildId,
      feature: "auto_world_builder",
      enabled: true,
      config: {
        channelIds: [mainChannelId],
        topics: [
          "new planet discovery",
          "Communiverse locations",
          "alien species",
          "cosmic phenomena"
        ],
        maxPerDay: 1
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await proactiveFeaturesCol.updateOne(
      { guildId, feature: "auto_world_builder" },
      { $set: worldBuilderConfig },
      { upsert: true }
    );
    console.log("✓ Auto World Builder configured (daily at midnight)\n");

    // 7. Create meme_drops collection index
    console.log("📑 Creating indexes...");
    const memeDropsCol = db.collection("meme_drops");
    await memeDropsCol.createIndex({ droppedAt: -1 });
    await memeDropsCol.createIndex({ guildId: 1, droppedAt: -1 });
    console.log("✓ Indexes created\n");

    // 8. Verify configuration
    console.log("🔍 Verifying configuration...");
    const scheduleCount = await schedulesCol.countDocuments({ guildId });
    const featureCount = await proactiveFeaturesCol.countDocuments({ guildId });

    console.log(`✓ Found ${scheduleCount} schedule(s)`);
    console.log(`✓ Found ${featureCount} proactive feature(s)\n`);

    // List all configured features
    console.log("📋 Configured Features:");
    const features = await proactiveFeaturesCol.find({ guildId }).toArray();
    features.forEach(f => {
      console.log(`  ✓ ${f.feature}: ${f.enabled ? 'ENABLED' : 'DISABLED'}`);
    });

    console.log("\n✅ All proactive features configured successfully!");
    console.log("\n📝 Summary:");
    console.log("  • Channel summaries: Daily at 23:00");
    console.log("  • Auto meme drops: Every 6 hours");
    console.log("  • Auto persona chats: Every 2 hours");
    console.log("  • Auto mini games: Every 4 hours");
    console.log("  • Auto story weave: Daily at noon");
    console.log("  • Auto world builder: Daily at midnight");
    console.log("  • Dynamic data updates: Weekly on Sundays at 3 AM");
    console.log("\n🎉 Your bot is now fully automated!");

  } catch (error) {
    console.error("❌ Error setting up proactive features:", error);
    throw error;
  } finally {
    await client.close();
    console.log("\n✓ Database connection closed");
  }
}

setupProactiveFeatures().catch(console.error);
