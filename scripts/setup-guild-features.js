/**
 * setup-guild-features.js
 * Quick setup script to enable all proactive AI features for a guild
 *
 * Usage:
 *   node scripts/setup-guild-features.js <GUILD_ID> <CHANNEL_ID>
 *
 * Example:
 *   node scripts/setup-guild-features.js 123456789 987654321
 */

import { getDb, getCollection } from '../src/db/mongo.js';
import { logger } from '../src/util/logger.js';

async function setupGuildFeatures(guildId, channelId) {
  try {
    logger.info('[SETUP] Configuring guild for proactive AI features...', {
      guildId,
      channelId,
    });

    const config = {
      guildId,

      // Proactive feature configuration
      proactive: {
        // Enable auto persona chat (passive replies)
        autoPersonaChat: true,

        // Auto Meme Drop - Random media with AI captions
        auto_meme_drop: true,
        auto_meme_drop_channel: channelId,

        // Auto Persona Chat - Personas start conversations
        auto_persona_chat: true,
        auto_persona_chat_channel: channelId,

        // Auto Mini Game - Surprise trivia games
        auto_mini_game: true,
        auto_mini_game_channel: channelId,

        // Auto Story Weave - Collaborative storytelling
        auto_story_weave: true,
        auto_story_weave_channel: channelId,

        // Auto World Builder - Lore and world-building posts
        auto_world_builder: true,
        auto_world_builder_channel: channelId,
      },

      // Auto-reply channels (empty array = all channels enabled)
      autoReplyChannels: [],

      // AI feature flags
      features: {
        useRAG: true,      // Enable RAG for knowledge retrieval
        useVLM: true,      // Enable image recognition
        useAgent: false,   // Disable complex agent tasks (optional)
      },

      // Metadata
      configuredAt: new Date(),
      configuredBy: 'setup-script',
    };

    const configCol = getCollection('guild_config');

    const result = await configCol.updateOne(
      { guildId },
      { $set: config },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      logger.info('[SETUP] ✅ Guild configuration created!', { guildId });
    } else {
      logger.info('[SETUP] ✅ Guild configuration updated!', { guildId });
    }

    console.log('\n🎉 SUCCESS! Your guild is now configured with:');
    console.log('   ✅ Auto Meme Drop (random media with AI captions)');
    console.log('   ✅ Auto Persona Chat (personas start conversations)');
    console.log('   ✅ Auto Mini Game (surprise trivia)');
    console.log('   ✅ Auto Story Weave (collaborative storytelling)');
    console.log('   ✅ Auto World Builder (lore posts)');
    console.log('   ✅ Passive persona replies (mention/keyword triggers)');
    console.log('   ✅ RAG knowledge retrieval');
    console.log('   ✅ VLM image recognition');
    console.log('\n📋 Configuration:');
    console.log(`   Guild ID: ${guildId}`);
    console.log(`   Target Channel: ${channelId}`);
    console.log('   Auto-reply: Enabled for all channels');
    console.log('\n🔧 To modify settings:');
    console.log('   1. Connect to MongoDB: mongosh "mongodb://dev:devpass@localhost:27017/?authSource=admin"');
    console.log('   2. Use database: use communiverse_bot');
    console.log(`   3. Update config: db.guild_config.updateOne({guildId:"${guildId}"}, {$set:{...}})`);
    console.log('\n📖 For more info, see: COMPLETE_BOT_FEATURES.md');

    process.exit(0);
  } catch (error) {
    logger.error('[SETUP] Failed to configure guild:', {
      error: error.message,
      stack: error.stack,
    });
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// CLI interface
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('\n❌ Usage: node scripts/setup-guild-features.js <GUILD_ID> <CHANNEL_ID>');
  console.error('\nExample:');
  console.error('   node scripts/setup-guild-features.js 1234567890 9876543210\n');
  process.exit(1);
}

const [guildId, channelId] = args;

// Run setup
await setupGuildFeatures(guildId, channelId);
