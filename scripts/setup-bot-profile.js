/**
 * scripts/setup-bot-profile.js
 * Configure bot profile: About Me description and recommended slash commands
 */

import { REST, Routes } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
const APP_ID = process.env.APP_ID;

// About Me description (max 190 characters)
const ABOUT_ME = "🌌 Elio Bot - Your Communiverse AI companion! Chat with personas, play games, earn points, and explore interactive scenarios. Powered by advanced AI (RAG, LLM, VLM).";

// Recommended slash commands for bot profile
// These appear prominently when users view the bot
const RECOMMENDED_COMMANDS = [
  {
    id: null, // Will be filled automatically
    name: "persona",
    description: "🎭 Interact with AI personas from the Communiverse",
  },
  {
    id: null,
    name: "ai",
    description: "🤖 Ask AI questions or chat with intelligent responses",
  },
  {
    id: null,
    name: "scenario",
    description: "🎯 Play interactive scenario quizzes and earn points",
  },
  {
    id: null,
    name: "drop",
    description: "🎁 Schedule or trigger media drops in your server",
  },
  {
    id: null,
    name: "leaderboard",
    description: "🏆 View the server points leaderboard",
  },
];

async function setupBotProfile() {
  try {
    console.log("🔧 Setting up bot profile...\n");

    // Step 1: Update About Me
    console.log("📝 Updating About Me description...");
    try {
      await rest.patch(Routes.currentApplication(), {
        body: {
          description: ABOUT_ME,
        },
      });
      console.log("✅ About Me updated successfully!");
      console.log(`   "${ABOUT_ME}"\n`);
    } catch (error) {
      console.error("❌ Failed to update About Me:", error.message);
    }

    // Step 2: Get guild commands to map names to IDs
    console.log("🔍 Fetching command IDs...");
    const guildId = process.env.GUILD_ID_DEV;

    let commands;
    if (guildId) {
      commands = await rest.get(Routes.applicationGuildCommands(APP_ID, guildId));
      console.log(`✅ Found ${commands.length} guild commands\n`);
    } else {
      commands = await rest.get(Routes.applicationCommands(APP_ID));
      console.log(`✅ Found ${commands.length} global commands\n`);
    }

    // Map command names to IDs
    const commandMap = new Map();
    for (const cmd of commands) {
      commandMap.set(cmd.name, cmd.id);
    }

    // Step 3: Prepare recommended commands with IDs
    const recommendedWithIds = RECOMMENDED_COMMANDS.map((rec) => {
      const commandId = commandMap.get(rec.name);
      if (!commandId) {
        console.warn(`⚠️  Command "${rec.name}" not found in registered commands`);
        return null;
      }
      return {
        id: commandId,
        name: rec.name,
        description: rec.description,
      };
    }).filter(Boolean);

    if (recommendedWithIds.length === 0) {
      console.error("❌ No valid recommended commands found!");
      return;
    }

    console.log("🎯 Setting recommended commands:");
    recommendedWithIds.forEach((cmd) => {
      console.log(`   • /${cmd.name} - ${cmd.description}`);
    });
    console.log();

    // Note: Discord API doesn't directly support setting recommended commands via REST API
    // This needs to be done through the Discord Developer Portal
    console.log("📋 To complete setup:");
    console.log("1. Go to https://discord.com/developers/applications");
    console.log(`2. Select your application (ID: ${APP_ID})`);
    console.log("3. Go to 'App Directory' > 'Discovery'");
    console.log("4. Add these commands as 'Recommended Commands':");
    console.log();
    recommendedWithIds.forEach((cmd) => {
      console.log(`   /${cmd.name} (ID: ${cmd.id})`);
    });
    console.log();

    // Step 4: Create a formatted list for easy copy-paste
    console.log("📄 Command IDs for reference:");
    console.log("─".repeat(60));
    commandMap.forEach((id, name) => {
      console.log(`${name.padEnd(20)} : ${id}`);
    });
    console.log("─".repeat(60));
    console.log();

    console.log("✨ Bot profile setup complete!");
    console.log("💡 Remember to set recommended commands in Discord Developer Portal");
  } catch (error) {
    console.error("❌ Error setting up bot profile:", error);
    process.exit(1);
  }
}

setupBotProfile();
