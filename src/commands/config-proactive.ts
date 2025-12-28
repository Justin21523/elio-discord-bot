/**
 * config-proactive.js
 * Configure proactive bot features (meme drop, persona chat, mini game)
 * All responses are ephemeral (only visible to the user)
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { getCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { run as runMemeDrop } from "../jobs/autoMemeDrop.js";
import { run as runMiniGame } from "../jobs/autoMiniGame.js";
import { run as runPersonaChat } from "../jobs/autoPersonaChat.js";
import cron from "node-cron";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

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
      .addChannelOption(opt =>
        opt
          .setName("channel1")
          .setDescription("First channel to drop memes in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel2")
          .setDescription("Second channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel3")
          .setDescription("Third channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("auto-detect")
          .setDescription("Auto-detect channels by name pattern")
          .setRequired(false)
          .addChoices(
            { name: "Channels containing 'meme'", value: "meme" },
            { name: "Channels containing 'media'", value: "media" },
            { name: "Channels containing 'random'", value: "random" }
          )
      )
      .addStringOption(opt =>
        opt
          .setName("type")
          .setDescription("Type of memes to drop (default: all)")
          .setRequired(false)
          .addChoices(
            { name: "All (images + videos)", value: "all" },
            { name: "Images only", value: "images" },
            { name: "Videos only", value: "videos" }
          )
      )
      .addIntegerOption(opt =>
        opt
          .setName("cooldown-hours")
          .setDescription("Hours before repeating same meme (default: 72)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(168)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("drop-now")
      .setDescription("Immediately drop a random meme to configured channels")
  )
  .addSubcommand(sub =>
    sub
      .setName("set")
      .setDescription("Set a scheduled proactive feature with time and channels")
      .addStringOption(opt =>
        opt
          .setName("feature")
          .setDescription("Which feature to schedule")
          .setRequired(true)
          .addChoices(
            { name: "Meme Drop", value: "meme" },
            { name: "Mini Game", value: "game" },
            { name: "Persona Chat", value: "persona" }
          )
      )
      .addStringOption(opt =>
        opt
          .setName("time")
          .setDescription("Time to run (HH:MM format, e.g. 14:30)")
          .setRequired(true)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel1")
          .setDescription("First channel to target")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel2")
          .setDescription("Second channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel3")
          .setDescription("Third channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel4")
          .setDescription("Fourth channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel5")
          .setDescription("Fifth channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("channel-pattern")
          .setDescription("OR auto-detect by name pattern (e.g. 'meme')")
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("repeat")
          .setDescription("How often to repeat (default: daily)")
          .setRequired(false)
          .addChoices(
            { name: "Daily", value: "daily" },
            { name: "Every 6 hours", value: "6h" },
            { name: "Every 4 hours", value: "4h" },
            { name: "Every 2 hours", value: "2h" },
            { name: "Hourly", value: "1h" }
          )
      )
      .addStringOption(opt =>
        opt
          .setName("timezone")
          .setDescription("Your timezone (default: CST UTC+8)")
          .setRequired(false)
          .addChoices(
            { name: "CST - China/Taiwan/HK/SG (UTC+8)", value: "8" },
            { name: "JST - Japan (UTC+9)", value: "9" },
            { name: "KST - Korea (UTC+9)", value: "9" },
            { name: "PST - US Pacific (UTC-8)", value: "-8" },
            { name: "MST - US Mountain (UTC-7)", value: "-7" },
            { name: "CST - US Central (UTC-6)", value: "-6" },
            { name: "EST - US Eastern (UTC-5)", value: "-5" },
            { name: "GMT - UK/Portugal (UTC+0)", value: "0" },
            { name: "CET - Germany/France/Italy (UTC+1)", value: "1" },
            { name: "EET - Finland/Greece/Romania (UTC+2)", value: "2" },
            { name: "MSK - Russia Moscow (UTC+3)", value: "3" },
            { name: "AEST - Australia Eastern (UTC+10)", value: "10" }
          )
      )
      .addStringOption(opt =>
        opt
          .setName("include-servers")
          .setDescription("Only include these server IDs (comma-separated)")
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("exclude-servers")
          .setDescription("Exclude these server IDs (comma-separated)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("schedules")
      .setDescription("View all scheduled proactive features")
  )
  .addSubcommand(sub =>
    sub
      .setName("delete-schedule")
      .setDescription("Delete a scheduled proactive feature")
      .addStringOption(opt =>
        opt
          .setName("schedule-id")
          .setDescription("The schedule ID to delete (see /config-proactive schedules)")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("run-now")
      .setDescription("Immediately run a proactive feature")
      .addStringOption(opt =>
        opt
          .setName("feature")
          .setDescription("Which feature to run now")
          .setRequired(true)
          .addChoices(
            { name: "Meme Drop", value: "meme" },
            { name: "Mini Game", value: "game" },
            { name: "Persona Chat", value: "persona" }
          )
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
          .setName("persona")
          .setDescription("Which persona to use (default: random)")
          .setRequired(false)
          .addChoices(
            { name: "Random (any persona)", value: "random" },
            { name: "Elio", value: "elio" },
            { name: "Caleb", value: "caleb" },
            { name: "Bryce", value: "bryce" }
          )
      )
      .addChannelOption(opt =>
        opt
          .setName("channel1")
          .setDescription("First channel for persona chats")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel2")
          .setDescription("Second channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel3")
          .setDescription("Third channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("auto-detect")
          .setDescription("Auto-detect channels by name pattern")
          .setRequired(false)
          .addChoices(
            { name: "Channels containing 'chat'", value: "chat" },
            { name: "Channels containing 'general'", value: "general" },
            { name: "Channels containing 'lounge'", value: "lounge" }
          )
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
          .setName("game-type")
          .setDescription("Which game type to run (default: random)")
          .setRequired(false)
          .addChoices(
            { name: "Random (any game)", value: "random" },
            { name: "Trivia - Knowledge questions", value: "trivia" },
            { name: "Adventure - Story choices", value: "adventure" },
            { name: "Reaction - Quick click", value: "reaction" },
            { name: "Guess Number - Logic mode", value: "guess-number" },
            { name: "Dice Roll - Highest roll wins", value: "dice-roll" },
            { name: "Battle - Turn-based duel", value: "battle" },
            { name: "IR Clue - Query & solve", value: "ir-clue" },
            { name: "Doc Hunt - BM25 search", value: "doc-hunt" },
            { name: "HMM Sequence - Probabilistic path", value: "hmm-sequence" },
            { name: "N-gram Story - Story weave", value: "ngram-story" },
            { name: "PMI Association", value: "pmi" },
            { name: "PMI Choice", value: "pmi-choice" }
          )
      )
      .addChannelOption(opt =>
        opt
          .setName("channel1")
          .setDescription("First channel for mini games")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel2")
          .setDescription("Second channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(opt =>
        opt
          .setName("channel3")
          .setDescription("Third channel (optional)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt
          .setName("auto-detect")
          .setDescription("Auto-detect channels by name pattern")
          .setRequired(false)
          .addChoices(
            { name: "Channels containing 'game'", value: "game" },
            { name: "Channels containing 'minigame'", value: "minigame" },
            { name: "Channels containing 'bot'", value: "bot" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("list-servers")
      .setDescription("List all servers the bot is in (for include/exclude options)")
  );

export async function execute(interaction: any, services: any) {
  // All config responses are ephemeral (only visible to the user)
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
      case "drop-now":
        await handleDropNow(interaction);
        break;
      case "set":
        await handleSet(interaction);
        break;
      case "schedules":
        await handleSchedules(interaction);
        break;
      case "delete-schedule":
        await handleDeleteSchedule(interaction);
        break;
      case "run-now":
        await handleRunNow(interaction);
        break;
      case "persona-chat":
        await handlePersonaChat(interaction);
        break;
      case "mini-game":
        await handleMiniGame(interaction);
        break;
      case "list-servers":
        await handleListServers(interaction);
        break;
    }
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Proactive config error", { error: msg });
    await interaction.editReply({
      content: `Error: ${msg}`
    });
  }
}

/**
 * List all servers the bot is in
 */
async function handleListServers(interaction: any) {
  const guilds = interaction.client.guilds.cache;

  let response = `**Bot Servers** (${guilds.size} total)\n\n`;
  response += `Use these IDs for \`include-servers\` or \`exclude-servers\` options:\n\n`;

  for (const [id, guild] of guilds) {
    response += `\`${id}\` - ${guild.name} (${guild.memberCount} members)\n`;
  }

  await interaction.editReply({ content: response });
}

/**
 * View all proactive feature configurations
 */
async function handleView(interaction: any) {
  const configCol = getCollection("bot_config");

    const memeConfig: any = await configCol.findOne({ key: "auto_meme_drop" });
    const personaConfig: any = await configCol.findOne({ key: "auto_persona_chat" });
    const gameConfig: any = await configCol.findOne({ key: "auto_mini_game" });

  let response = "**Proactive Features Configuration**\n\n";

  // Meme Drop
  response += "**1. Auto Meme Drop**\n";
  if (memeConfig) {
    response += `   Status: ${memeConfig.enabled ? "Enabled" : "Disabled"}\n`;
    response += `   Channels: ${memeConfig.channelIds?.length || 0} configured${memeConfig.autoDetect ? " (auto-detected)" : ""}\n`;
    if (memeConfig.channelIds?.length > 0) {
      response += `   ${memeConfig.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${memeConfig.channelIds.length > 5 ? ` +${memeConfig.channelIds.length - 5} more` : ""}\n`;
    }
    response += `   Type: ${memeConfig.memeType || "all"}\n`;
    response += `   Cooldown: ${memeConfig.cooldownHours || 72} hours\n`;
  } else {
    response += "   Status: Not configured\n";
  }
  response += "\n";

  // Persona Chat
  response += "**2. Auto Persona Chat**\n";
  if (personaConfig) {
    response += `   Status: ${personaConfig.enabled ? "Enabled" : "Disabled"}\n`;
    response += `   Channels: ${personaConfig.channelIds?.length || 0} configured\n`;
    if (personaConfig.channelIds?.length > 0) {
      response += `   ${personaConfig.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${personaConfig.channelIds.length > 5 ? ` +${personaConfig.channelIds.length - 5} more` : ""}\n`;
    }
    response += `   Min Gap: ${personaConfig.minMessageGap || 30} minutes\n`;
  } else {
    response += "   Status: Not configured\n";
  }
  response += "\n";

  // Mini Game
  response += "**3. Auto Mini Game**\n";
  if (gameConfig) {
    response += `   Status: ${gameConfig.enabled ? "Enabled" : "Disabled"}\n`;
    response += `   Channels: ${gameConfig.channelIds?.length || 0} configured\n`;
    if (gameConfig.channelIds?.length > 0) {
      response += `   ${gameConfig.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${gameConfig.channelIds.length > 5 ? ` +${gameConfig.channelIds.length - 5} more` : ""}\n`;
    }
    const gameTypes = gameConfig.gameTypes || ["trivia", "riddle", "reaction", "number_guess"];
    response += `   Game Types: ${gameTypes.join(", ")}\n`;
  } else {
    response += "   Status: Not configured\n";
  }

  await interaction.editReply({ content: response });
}

/**
 * Helper to extract channel IDs from channel options or auto-detect
 */
function extractChannelIds(
  interaction: any,
  autoDetectPattern: string | null = null,
  includeServers: string[] | null = null,
  excludeServers: string[] | null = null
): string[] {
  const channelIds: string[] = [];

  // Get explicit channel selections
  for (let i = 1; i <= 3; i++) {
    const channel = interaction.options.getChannel(`channel${i}`);
    if (channel) {
      channelIds.push(channel.id);
    }
  }

  // Auto-detect if pattern provided and no explicit channels
  if (autoDetectPattern && channelIds.length === 0) {
    for (const guild of interaction.client.guilds.cache.values()) {
      // Check server filters
      if (includeServers && includeServers.length > 0 && !includeServers.includes(guild.id)) {
        continue;
      }
      if (excludeServers && excludeServers.length > 0 && excludeServers.includes(guild.id)) {
        continue;
      }

      for (const channel of guild.channels.cache.values()) {
        if (channel.isTextBased() && channel.name.toLowerCase().includes(autoDetectPattern)) {
          channelIds.push(channel.id);
        }
      }
    }
  }

  return channelIds;
}

/**
 * Configure meme drop feature
 */
async function handleMemeDrop(interaction: any) {
  const enabled = interaction.options.getBoolean("enabled");
  const autoDetect = interaction.options.getString("auto-detect");
  const memeType = interaction.options.getString("type");
  const cooldownHours = interaction.options.getInteger("cooldown-hours");

  const configCol = getCollection("bot_config");

  const updateDoc: Record<string, any> = {
    key: "auto_meme_drop",
    enabled,
    updatedAt: new Date()
  };

  // Get channel IDs from explicit selections or auto-detect
  const channelIds = extractChannelIds(interaction, autoDetect);
  if (channelIds.length > 0) {
    updateDoc.channelIds = channelIds;
    updateDoc.autoDetect = !!autoDetect;
    updateDoc.autoDetectPattern = autoDetect || null;
  }

  // Set meme type
  if (memeType) {
    updateDoc.memeType = memeType;
  }

  // Set cooldown hours
  if (cooldownHours !== null) {
    updateDoc.cooldownHours = cooldownHours;
  }

  await configCol.updateOne(
    { key: "auto_meme_drop" },
    { $set: updateDoc },
    { upsert: true }
  );

  let response = `**Meme Drop Configuration Updated**\n\n`;
  response += `Status: ${enabled ? "Enabled" : "Disabled"}\n`;
  if (updateDoc.channelIds && updateDoc.channelIds.length > 0) {
    if (updateDoc.autoDetect) {
      response += `Channels (auto-detected '${autoDetect}'): ${updateDoc.channelIds.length} found\n`;
    } else {
      response += `Channels: ${updateDoc.channelIds.length} configured\n`;
    }
    response += `${updateDoc.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${updateDoc.channelIds.length > 5 ? ` +${updateDoc.channelIds.length - 5} more` : ""}\n`;
  }
  if (memeType) {
    response += `Meme Type: ${memeType}\n`;
  }
  if (cooldownHours !== null) {
    response += `Cooldown: ${cooldownHours} hours\n`;
  }
  response += `\nMemes will be dropped from local files (${enabled ? "every 6 hours" : "disabled"})`;
  response += `\nUse \`/config-proactive drop-now\` to drop immediately`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Meme drop config updated", {
    enabled,
    channelCount: updateDoc.channelIds?.length || 0,
    memeType: updateDoc.memeType,
    cooldownHours: updateDoc.cooldownHours,
    user: interaction.user.username
  });
}

/**
 * Immediately drop a meme
 */
async function handleDropNow(interaction: any) {
  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: "auto_meme_drop" });

  if (!config || !config.channelIds || config.channelIds.length === 0) {
    await interaction.editReply({
      content: "No channels configured for meme drops. Use `/config-proactive meme-drop` first."
    });
    return;
  }

  await interaction.editReply({
    content: "Dropping a random meme now..."
  });

  try {
    await runMemeDrop(interaction.client);
    await interaction.followUp({
      content: "Meme dropped successfully!",
      ephemeral: true
    });
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Drop now failed", { error: msg });
    await interaction.followUp({
      content: `Failed to drop meme: ${msg}`,
      ephemeral: true
    });
  }
}

/**
 * Configure persona chat feature
 */
async function handlePersonaChat(interaction: any) {
  const enabled = interaction.options.getBoolean("enabled");
  const personaChoice = interaction.options.getString("persona");
  const autoDetect = interaction.options.getString("auto-detect");
  const minGap = interaction.options.getInteger("min-gap");

  const configCol = getCollection("bot_config");

  const updateDoc: Record<string, any> = {
    key: "auto_persona_chat",
    enabled,
    updatedAt: new Date()
  };

  // Set persona selection
  if (personaChoice) {
    updateDoc.selectedPersona = personaChoice === "random" ? null : personaChoice;
  }

  // Get channel IDs from explicit selections or auto-detect
  const channelIds = extractChannelIds(interaction, autoDetect);
  if (channelIds.length > 0) {
    updateDoc.channelIds = channelIds;
    updateDoc.autoDetect = !!autoDetect;
    updateDoc.autoDetectPattern = autoDetect || null;
  }

  if (minGap !== null) {
    updateDoc.minMessageGap = minGap;
  }

  await configCol.updateOne(
    { key: "auto_persona_chat" },
    { $set: updateDoc },
    { upsert: true }
  );

  let response = `**Persona Chat Configuration Updated**\n\n`;
  response += `Status: ${enabled ? "Enabled" : "Disabled"}\n`;
  if (personaChoice) {
    response += `Persona: ${personaChoice === "random" ? "Random (any)" : personaChoice.charAt(0).toUpperCase() + personaChoice.slice(1)}\n`;
  }
  if (updateDoc.channelIds && updateDoc.channelIds.length > 0) {
    if (updateDoc.autoDetect) {
      response += `Channels (auto-detected '${autoDetect}'): ${updateDoc.channelIds.length} found\n`;
    } else {
      response += `Channels: ${updateDoc.channelIds.length} configured\n`;
    }
    response += `${updateDoc.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${updateDoc.channelIds.length > 5 ? ` +${updateDoc.channelIds.length - 5} more` : ""}\n`;
  }
  if (minGap !== null) {
    response += `Min Gap: ${minGap} minutes\n`;
  }
  response += `\nPersonas will analyze conversations and join when relevant (default: every 2 hours)`;
  response += `\nUse \`/config-proactive run-now feature:persona\` to run immediately`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Persona chat config updated", {
    enabled,
    persona: updateDoc.selectedPersona,
    channelCount: updateDoc.channelIds?.length || 0,
    autoDetect: updateDoc.autoDetectPattern,
    minGap: updateDoc.minMessageGap,
    user: interaction.user.username
  });
}

/**
 * Configure mini game feature
 */
async function handleMiniGame(interaction: any) {
  const enabled = interaction.options.getBoolean("enabled");
  const gameTypeChoice = interaction.options.getString("game-type");
  const autoDetect = interaction.options.getString("auto-detect");

  const configCol = getCollection("bot_config");

  const updateDoc: Record<string, any> = {
    key: "auto_mini_game",
    enabled,
    updatedAt: new Date()
  };

  // Set selected game type
  if (gameTypeChoice) {
    updateDoc.selectedGameType = gameTypeChoice === "random" ? null : gameTypeChoice;
  }

  // Get channel IDs from explicit selections or auto-detect
  const channelIds = extractChannelIds(interaction, autoDetect);
  if (channelIds.length > 0) {
    updateDoc.channelIds = channelIds;
    updateDoc.autoDetect = !!autoDetect;
    updateDoc.autoDetectPattern = autoDetect || null;
  }

  await configCol.updateOne(
    { key: "auto_mini_game" },
    { $set: updateDoc },
    { upsert: true }
  );

  let response = `**Mini Game Configuration Updated**\n\n`;
  response += `Status: ${enabled ? "Enabled" : "Disabled"}\n`;
  if (gameTypeChoice) {
    response += `Game Type: ${gameTypeChoice === "random" ? "Random (any)" : gameTypeChoice}\n`;
  }
  if (updateDoc.channelIds && updateDoc.channelIds.length > 0) {
    if (updateDoc.autoDetect) {
      response += `Channels (auto-detected '${autoDetect}'): ${updateDoc.channelIds.length} found\n`;
    } else {
      response += `Channels: ${updateDoc.channelIds.length} configured\n`;
    }
    response += `${updateDoc.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${updateDoc.channelIds.length > 5 ? ` +${updateDoc.channelIds.length - 5} more` : ""}\n`;
  }
  response += `\nBot will challenge active members to games (default: every 4 hours)`;
  response += `\nUse \`/config-proactive run-now feature:game\` to run immediately`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Mini game config updated", {
    enabled,
    gameType: updateDoc.selectedGameType,
    channelCount: updateDoc.channelIds?.length || 0,
    user: interaction.user.username
  });
}

// Store active cron jobs in memory
const activeSchedules = new Map<string, any>();

/**
 * Set a scheduled proactive feature
 */
async function handleSet(interaction: any) {
  const feature = interaction.options.getString("feature");
  const timeStr = interaction.options.getString("time");
  const channelPattern = interaction.options.getString("channel-pattern");
  const repeat = interaction.options.getString("repeat") || "daily";
  const timezoneOffset = parseInt(interaction.options.getString("timezone") || "8"); // Default to UTC+8 (Taiwan)
  const includeServersStr = interaction.options.getString("include-servers");
  const excludeServersStr = interaction.options.getString("exclude-servers");

  // Get selected channels (up to 5)
  const selectedChannels: any[] = [];
  for (let i = 1; i <= 5; i++) {
    const ch = interaction.options.getChannel(`channel${i}`);
    if (ch) selectedChannels.push(ch);
  }

  // Parse server filters
  const includeServers = includeServersStr
    ? includeServersStr
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : null;
  const excludeServers = excludeServersStr
    ? excludeServersStr
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : null;

  // Validate time format
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    await interaction.editReply({
      content: "Invalid time format. Please use HH:MM (e.g., 14:30)"
    });
    return;
  }

  const localHour = parseInt(timeMatch[1]);
  const minute = parseInt(timeMatch[2]);

  if (localHour < 0 || localHour > 23 || minute < 0 || minute > 59) {
    await interaction.editReply({
      content: "Invalid time. Hours: 0-23, Minutes: 0-59"
    });
    return;
  }

  // Convert local time to UTC
  let utcHour = localHour - timezoneOffset;
  if (utcHour < 0) utcHour += 24;
  if (utcHour >= 24) utcHour -= 24;

  // Build cron expression based on repeat (using UTC time)
  let cronExpr;
  switch (repeat) {
    case "1h":
      cronExpr = `${minute} * * * *`;
      break;
    case "2h":
      cronExpr = `${minute} */2 * * *`;
      break;
    case "4h":
      cronExpr = `${minute} */4 * * *`;
      break;
    case "6h":
      cronExpr = `${minute} */6 * * *`;
      break;
    case "daily":
    default:
      cronExpr = `${minute} ${utcHour} * * *`;
      break;
  }

  // Get channel IDs - priority: selected channels > pattern
  let channelIds: string[] = [];
  let channelSource = "";

  if (selectedChannels.length > 0) {
    // Use explicitly selected channels
    channelIds = selectedChannels.map((ch: any) => ch.id);
    channelSource = `selected: ${selectedChannels.map((ch: any) => `<#${ch.id}>`).join(", ")}`;
  } else if (channelPattern) {
    // Auto-detect channels across servers with filters
    for (const guild of interaction.client.guilds.cache.values()) {
      // Check server filters
      if (includeServers && includeServers.length > 0 && !includeServers.includes(guild.id)) {
        continue;
      }
      if (excludeServers && excludeServers.length > 0 && excludeServers.includes(guild.id)) {
        continue;
      }

      for (const channel of guild.channels.cache.values()) {
        if (channel.isTextBased() && channel.name.toLowerCase().includes(channelPattern.toLowerCase())) {
          channelIds.push(channel.id);
        }
      }
    }
    channelSource = `pattern '${channelPattern}': ${channelIds.length} channels found`;
  }

  if (channelIds.length === 0) {
    await interaction.editReply({
      content: "No channels found. Please specify a channel or a valid channel name pattern."
    });
    return;
  }

  // Generate schedule ID
  const scheduleId = `${feature}_${Date.now().toString(36)}`;

  // Save to database
  const schedulesCol = getCollection("proactive_schedules");
  const scheduleDoc: Record<string, any> = {
    scheduleId,
    feature,
    cronExpr,
    timeStr,
    repeat,
    timezoneOffset,
    channelIds,
    channelPattern: channelPattern || null,
    includeServers,
    excludeServers,
    createdBy: interaction.user.id,
    createdAt: new Date(),
    enabled: true
  };

  await schedulesCol.insertOne(scheduleDoc);

  // Also update the corresponding config to enable the feature
  const configCol = getCollection("bot_config");
  const configKey = feature === "meme" ? "auto_meme_drop" :
                    feature === "game" ? "auto_mini_game" : "auto_persona_chat";

  await configCol.updateOne(
    { key: configKey },
    {
      $set: {
        enabled: true,
        channelIds,
        channelPattern: channelPattern || null,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  // Schedule the cron job
  scheduleProactiveJob(interaction.client, scheduleDoc);

  const featureNames: Record<string, string> = { meme: "Meme Drop", game: "Mini Game", persona: "Persona Chat" };
  const repeatNames: Record<string, string> = { daily: "Daily", "6h": "Every 6 hours", "4h": "Every 4 hours", "2h": "Every 2 hours", "1h": "Hourly" };
  const tzNames: Record<string, string> = {
    "8": "CST", "9": "JST/KST", "-8": "PST", "-7": "MST", "-6": "CST-US", "-5": "EST",
    "0": "GMT", "1": "CET", "2": "EET", "3": "MSK", "10": "AEST"
  };

  const featureLabel = featureNames[String(feature)] || String(feature);
  let response = `**${featureLabel} Scheduled**\n\n`;
  response += `Time: ${timeStr} (${tzNames[String(timezoneOffset)] || `UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`})\n`;
  response += `UTC Time: ${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}\n`;
  response += `Repeat: ${repeatNames[String(repeat)] || String(repeat)}\n`;
  response += `Channels: ${channelSource}\n`;
  if (selectedChannels.length === 0 && channelPattern) {
    // Show found channels for pattern
    response += `${channelIds.slice(0, 10).map((id: any) => `<#${id}>`).join(", ")}`;
    if (channelIds.length > 10) {
      response += ` +${channelIds.length - 10} more`;
    }
    response += "\n";
  }
  if (includeServers) {
    response += `Include servers: ${includeServers.length}\n`;
  }
  if (excludeServers) {
    response += `Exclude servers: ${excludeServers.length}\n`;
  }
  response += `\n\nSchedule ID: \`${scheduleId}\``;
  response += `\nUse \`/config-proactive schedules\` to view all schedules`;
  response += `\nUse \`/config-proactive run-now feature:${feature}\` to run immediately`;

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Schedule created", {
    scheduleId,
    feature,
    cronExpr,
    channelCount: channelIds.length,
    includeServers,
    excludeServers,
    user: interaction.user.username
  });
}

/**
 * Schedule a proactive job using cron
 */
function scheduleProactiveJob(client: any, schedule: any) {
  const { scheduleId, feature, cronExpr, channelIds } = schedule;

  // Stop existing job if any
  if (activeSchedules.has(scheduleId)) {
    activeSchedules.get(scheduleId).stop();
  }

  const job = cron.schedule(cronExpr, async () => {
    logger.info(`[CRON] Running scheduled ${feature}`, { scheduleId });

    try {
      // Update config with channels before running
      const configCol = getCollection("bot_config");
      const configKey = feature === "meme" ? "auto_meme_drop" :
                        feature === "game" ? "auto_mini_game" : "auto_persona_chat";

      await configCol.updateOne(
        { key: configKey },
        { $set: { channelIds, enabled: true } }
      );

      // Run the appropriate job
      switch (feature) {
        case "meme":
          await runMemeDrop(client);
          break;
        case "game":
          await runMiniGame(client);
          break;
        case "persona":
          await runPersonaChat(client);
          break;
      }
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logger.error(`[CRON] Scheduled ${feature} failed`, { scheduleId, error: msg });
    }
  });

  activeSchedules.set(scheduleId, job);
  logger.info(`[CRON] Job scheduled`, { scheduleId, cronExpr });
}

/**
 * View all scheduled proactive features
 */
async function handleSchedules(interaction: any) {
  const schedulesCol = getCollection("proactive_schedules");
  const schedules = await schedulesCol.find({ enabled: true }).toArray();

  if (schedules.length === 0) {
    await interaction.editReply({
      content: "**No Proactive Schedules**\n\nUse `/config-proactive set` to create a schedule."
    });
    return;
  }

  const featureNames: Record<string, string> = { meme: "Meme Drop", game: "Mini Game", persona: "Persona Chat" };
  const repeatNames: Record<string, string> = { daily: "Daily", "6h": "Every 6h", "4h": "Every 4h", "2h": "Every 2h", "1h": "Hourly" };

  let response = `**Proactive Schedules** (${schedules.length} total)\n\n`;

  for (const schedule of schedules) {
    response += `**${featureNames[String(schedule.feature)] || String(schedule.feature)}**\n`;
    response += `  ID: \`${schedule.scheduleId}\`\n`;
    response += `  Time: ${schedule.timeStr} (${repeatNames[String(schedule.repeat)] || String(schedule.repeat)})\n`;
    response += `  Channels: ${schedule.channelIds?.length || 0}`;
    if (schedule.channelPattern) {
      response += ` (pattern: '${schedule.channelPattern}')`;
    }
    if (schedule.includeServers) {
      response += ` [include: ${schedule.includeServers.length}]`;
    }
    if (schedule.excludeServers) {
      response += ` [exclude: ${schedule.excludeServers.length}]`;
    }
    response += `\n\n`;
  }

  response += `Use \`/config-proactive delete-schedule schedule-id:<id>\` to remove a schedule`;

  await interaction.editReply({ content: response });
}

/**
 * Delete a scheduled proactive feature
 */
async function handleDeleteSchedule(interaction: any) {
  const scheduleId = interaction.options.getString("schedule-id");

  const schedulesCol = getCollection("proactive_schedules");
  const result = await schedulesCol.deleteOne({ scheduleId });

  if (result.deletedCount === 0) {
    await interaction.editReply({
      content: `Schedule \`${scheduleId}\` not found.`
    });
    return;
  }

  // Stop the cron job
  if (activeSchedules.has(scheduleId)) {
    activeSchedules.get(scheduleId).stop();
    activeSchedules.delete(scheduleId);
  }

  await interaction.editReply({
    content: `Schedule \`${scheduleId}\` deleted successfully.`
  });

  logger.info("[CONFIG] Schedule deleted", { scheduleId, user: interaction.user.username });
}

/**
 * Immediately run a proactive feature
 */
async function handleRunNow(interaction: any) {
  const feature = interaction.options.getString("feature");
  const featureNames: Record<string, string> = { meme: "Meme Drop", game: "Mini Game", persona: "Persona Chat" };
  const featureLabel = featureNames[String(feature)] || String(feature);

  await interaction.editReply({
    content: `Running ${featureLabel} now...`
  });

  try {
    switch (feature) {
      case "meme":
        await runMemeDrop(interaction.client);
        break;
      case "game":
        await runMiniGame(interaction.client);
        break;
      case "persona":
        await runPersonaChat(interaction.client);
        break;
    }

    await interaction.followUp({
      content: `${featureLabel} completed!`,
      ephemeral: true
    });
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Run now failed", { feature, error: msg });
    await interaction.followUp({
      content: `${featureLabel} failed: ${msg}`,
      ephemeral: true
    });
  }
}

/**
 * Load and arm all schedules on bot startup
 * Call this from index.js after bot is ready
 */
export async function loadProactiveSchedules(client: any) {
  try {
    const schedulesCol = getCollection("proactive_schedules");
    const schedules = await schedulesCol.find({ enabled: true }).toArray();

    for (const schedule of schedules) {
      scheduleProactiveJob(client, schedule);
    }

    logger.info("[CONFIG] Loaded proactive schedules", { count: schedules.length });
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Failed to load proactive schedules", { error: msg });
  }
}
