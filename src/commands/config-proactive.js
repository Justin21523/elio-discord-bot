/**
 * config-proactive.js
 * Configure proactive bot features (meme drop, persona chat, mini game)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("config-proactive")
  .setDescription("Configure proactive bot features")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("view")
      .setDescription("View current configuration for all proactive features")
  )
  .addSubcommand(sub =>
    sub
      .setName("meme-drop")
      .setDescription("Configure automatic meme drop feature")
      .addBooleanOption(opt =>
        opt
          .setName("enabled")
          .setDescription("Enable or disable meme drops")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt
          .setName("channels")
          .setDescription("Comma-separated channel IDs (e.g., 123,456)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("persona-chat")
      .setDescription("Configure automatic persona chat feature")
      .addBooleanOption(opt =>
        opt
          .setName("enabled")
          .setDescription("Enable or disable persona chats")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt
          .setName("channels")
          .setDescription("Comma-separated channel IDs (e.g., 123,456)")
          .setRequired(false)
      )
      .addIntegerOption(opt =>
        opt
          .setName("min-gap")
          .setDescription("Minimum minutes between persona messages (default: 30)")
          .setRequired(false)
          .setMinValue(5)
          .setMaxValue(1440)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("mini-game")
      .setDescription("Configure automatic mini game feature")
      .addBooleanOption(opt =>
        opt
          .setName("enabled")
          .setDescription("Enable or disable mini games")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt
          .setName("channels")
          .setDescription("Comma-separated channel IDs (e.g., 123,456)")
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("game-types")
          .setDescription("Game types to enable (default: all)")
          .setRequired(false)
          .addChoices(
            { name: "All Games", value: "all" },
            { name: "Trivia Only", value: "trivia" },
            { name: "Riddle Only", value: "riddle" },
            { name: "Reaction Only", value: "reaction" },
            { name: "Number Guess Only", value: "number_guess" }
          )
      )
  );

export async function execute(interaction, services) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "view":
        await handleView(interaction);
        break;
      case "meme-drop":
        await handleMemeDrop(interaction);
        break;
      case "persona-chat":
        await handlePersonaChat(interaction);
        break;
      case "mini-game":
        await handleMiniGame(interaction);
        break;
    }
  } catch (error) {
    logger.error("[CONFIG] Proactive config error", { error: error.message });
    await interaction.editReply({
      content: `❌ Error: ${error.message}`
    });
  }
}

/**
 * View all proactive feature configurations
 */
async function handleView(interaction) {
  const configCol = getCollection("bot_config");

  const memeConfig = await configCol.findOne({ key: "auto_meme_drop" });
  const personaConfig = await configCol.findOne({ key: "auto_persona_chat" });
  const gameConfig = await configCol.findOne({ key: "auto_mini_game" });

  let response = "**🎛️ Proactive Features Configuration**\n\n";

  // Meme Drop
  response += "**1. Auto Meme Drop** 🎨\n";
  if (memeConfig) {
    response += `   Status: ${memeConfig.enabled ? "✅ Enabled" : "❌ Disabled"}\n`;
    response += `   Channels: ${memeConfig.channelIds?.length || 0} configured\n`;
    if (memeConfig.channelIds?.length > 0) {
      response += `   → ${memeConfig.channelIds.map(id => `<#${id}>`).join(", ")}\n`;
    }
  } else {
    response += "   Status: ❌ Not configured\n";
  }
  response += "\n";

  // Persona Chat
  response += "**2. Auto Persona Chat** 💬\n";
  if (personaConfig) {
    response += `   Status: ${personaConfig.enabled ? "✅ Enabled" : "❌ Disabled"}\n`;
    response += `   Channels: ${personaConfig.channelIds?.length || 0} configured\n`;
    if (personaConfig.channelIds?.length > 0) {
      response += `   → ${personaConfig.channelIds.map(id => `<#${id}>`).join(", ")}\n`;
    }
    response += `   Min Gap: ${personaConfig.minMessageGap || 30} minutes\n`;
  } else {
    response += "   Status: ❌ Not configured\n";
  }
  response += "\n";

  // Mini Game
  response += "**3. Auto Mini Game** 🎮\n";
  if (gameConfig) {
    response += `   Status: ${gameConfig.enabled ? "✅ Enabled" : "❌ Disabled"}\n`;
    response += `   Channels: ${gameConfig.channelIds?.length || 0} configured\n`;
    if (gameConfig.channelIds?.length > 0) {
      response += `   → ${gameConfig.channelIds.map(id => `<#${id}>`).join(", ")}\n`;
    }
    const gameTypes = gameConfig.gameTypes || ["trivia", "riddle", "reaction", "number_guess"];
    response += `   Game Types: ${gameTypes.join(", ")}\n`;
  } else {
    response += "   Status: ❌ Not configured\n";
  }

  await interaction.editReply({ content: response });
}

/**
 * Configure meme drop feature
 */
async function handleMemeDrop(interaction) {
  const enabled = interaction.options.getBoolean("enabled");
  const channelsStr = interaction.options.getString("channels");

  const configCol = getCollection("bot_config");

  const updateDoc = {
    key: "auto_meme_drop",
    enabled,
    updatedAt: new Date()
  };

  // Parse channel IDs if provided
  if (channelsStr) {
    const channelIds = channelsStr.split(",").map(id => id.trim()).filter(Boolean);
    updateDoc.channelIds = channelIds;
  }

  await configCol.updateOne(
    { key: "auto_meme_drop" },
    { $set: updateDoc },
    { upsert: true }
  );

  let response = `✅ **Meme Drop Configuration Updated**\n\n`;
  response += `Status: ${enabled ? "✅ Enabled" : "❌ Disabled"}\n`;
  if (updateDoc.channelIds) {
    response += `Channels: ${updateDoc.channelIds.map(id => `<#${id}>`).join(", ")}\n`;
  }
  response += `\n_Next meme drop will occur according to cron schedule (default: every 6 hours)_`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Meme drop config updated", {
    enabled,
    channelCount: updateDoc.channelIds?.length || 0,
    user: interaction.user.username
  });
}

/**
 * Configure persona chat feature
 */
async function handlePersonaChat(interaction) {
  const enabled = interaction.options.getBoolean("enabled");
  const channelsStr = interaction.options.getString("channels");
  const minGap = interaction.options.getInteger("min-gap");

  const configCol = getCollection("bot_config");

  const updateDoc = {
    key: "auto_persona_chat",
    enabled,
    updatedAt: new Date()
  };

  // Parse channel IDs if provided
  if (channelsStr) {
    const channelIds = channelsStr.split(",").map(id => id.trim()).filter(Boolean);
    updateDoc.channelIds = channelIds;
  }

  if (minGap !== null) {
    updateDoc.minMessageGap = minGap;
  }

  await configCol.updateOne(
    { key: "auto_persona_chat" },
    { $set: updateDoc },
    { upsert: true }
  );

  let response = `✅ **Persona Chat Configuration Updated**\n\n`;
  response += `Status: ${enabled ? "✅ Enabled" : "❌ Disabled"}\n`;
  if (updateDoc.channelIds) {
    response += `Channels: ${updateDoc.channelIds.map(id => `<#${id}>`).join(", ")}\n`;
  }
  if (minGap !== null) {
    response += `Min Gap: ${minGap} minutes\n`;
  }
  response += `\n_Personas will analyze conversations and join when relevant (default: every 2 hours)_`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Persona chat config updated", {
    enabled,
    channelCount: updateDoc.channelIds?.length || 0,
    minGap: updateDoc.minMessageGap,
    user: interaction.user.username
  });
}

/**
 * Configure mini game feature
 */
async function handleMiniGame(interaction) {
  const enabled = interaction.options.getBoolean("enabled");
  const channelsStr = interaction.options.getString("channels");
  const gameTypesChoice = interaction.options.getString("game-types");

  const configCol = getCollection("bot_config");

  const updateDoc = {
    key: "auto_mini_game",
    enabled,
    updatedAt: new Date()
  };

  // Parse channel IDs if provided
  if (channelsStr) {
    const channelIds = channelsStr.split(",").map(id => id.trim()).filter(Boolean);
    updateDoc.channelIds = channelIds;
  }

  // Set game types
  if (gameTypesChoice) {
    if (gameTypesChoice === "all") {
      updateDoc.gameTypes = ["trivia", "riddle", "reaction", "number_guess"];
    } else {
      updateDoc.gameTypes = [gameTypesChoice];
    }
  }

  await configCol.updateOne(
    { key: "auto_mini_game" },
    { $set: updateDoc },
    { upsert: true }
  );

  let response = `✅ **Mini Game Configuration Updated**\n\n`;
  response += `Status: ${enabled ? "✅ Enabled" : "❌ Disabled"}\n`;
  if (updateDoc.channelIds) {
    response += `Channels: ${updateDoc.channelIds.map(id => `<#${id}>`).join(", ")}\n`;
  }
  if (updateDoc.gameTypes) {
    response += `Game Types: ${updateDoc.gameTypes.join(", ")}\n`;
  }
  response += `\n_Bot will challenge active members to games (default: every 4 hours)_`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Mini game config updated", {
    enabled,
    channelCount: updateDoc.channelIds?.length || 0,
    gameTypes: updateDoc.gameTypes,
    user: interaction.user.username
  });
}
