/**
 * config-social.js
 * Configure social media monitor feature for proactive news sharing
 * All responses are ephemeral (only visible to the user)
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { getCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { run as runSocialMonitor } from "../jobs/socialMediaMonitor.js";

const CONFIG_KEY = "social_media_monitor";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const data = new SlashCommandBuilder()
  .setName("config-social")
  .setDescription("Configure social media monitor (Elio news sharing)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("view")
      .setDescription("View current social media monitor configuration")
  )
  .addSubcommand(sub =>
    sub
      .setName("enable")
      .setDescription("Enable social media monitor")
      .addChannelOption(opt =>
        opt
          .setName("channel1")
          .setDescription("First channel to post news")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
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
  )
  .addSubcommand(sub =>
    sub
      .setName("disable")
      .setDescription("Disable social media monitor")
  )
  .addSubcommand(sub =>
    sub
      .setName("set-frequency")
      .setDescription("Set how often to search for news")
      .addStringOption(opt =>
        opt
          .setName("frequency")
          .setDescription("Search frequency")
          .setRequired(true)
          .addChoices(
            { name: "Every hour", value: "1h" },
            { name: "Every 2 hours (default)", value: "2h" },
            { name: "Every 4 hours", value: "4h" },
            { name: "Every 6 hours", value: "6h" },
            { name: "Every 12 hours", value: "12h" },
            { name: "Daily", value: "24h" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("set-limit")
      .setDescription("Set maximum shares per run")
      .addIntegerOption(opt =>
        opt
          .setName("max-shares")
          .setDescription("Maximum news items to share per run (1-10)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("toggle-source")
      .setDescription("Enable or disable a news source")
      .addStringOption(opt =>
        opt
          .setName("source")
          .setDescription("News source to toggle")
          .setRequired(true)
          .addChoices(
            { name: "Reddit", value: "reddit" },
            { name: "YouTube", value: "youtube" },
            { name: "Twitter/X", value: "twitter" },
            { name: "News (Variety, THR, etc)", value: "news" }
          )
      )
      .addBooleanOption(opt =>
        opt
          .setName("enabled")
          .setDescription("Enable or disable this source")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("run-now")
      .setDescription("Immediately run the social media monitor")
  )
  .addSubcommand(sub =>
    sub
      .setName("add-channel")
      .setDescription("Add a channel to receive news")
      .addChannelOption(opt =>
        opt
          .setName("channel")
          .setDescription("Channel to add")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("remove-channel")
      .setDescription("Remove a channel from receiving news")
      .addChannelOption(opt =>
        opt
          .setName("channel")
          .setDescription("Channel to remove")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("set-channel-pattern")
      .setDescription("Set a pattern to match channel names (e.g., 'news', 'elio')")
      .addStringOption(opt =>
        opt
          .setName("pattern")
          .setDescription("Channel name pattern (case-insensitive, use * for wildcard)")
          .setRequired(true)
      )
      .addBooleanOption(opt =>
        opt
          .setName("enabled")
          .setDescription("Enable or disable pattern matching")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("clear-channel-pattern")
      .setDescription("Clear channel name pattern and use explicit channel list only")
  )
  .addSubcommand(sub =>
    sub
      .setName("set-server-mode")
      .setDescription("Set server filter mode (include or exclude)")
      .addStringOption(opt =>
        opt
          .setName("mode")
          .setDescription("Include only listed servers, or exclude listed servers")
          .setRequired(true)
          .addChoices(
            { name: "Include (only listed servers)", value: "include" },
            { name: "Exclude (all except listed)", value: "exclude" },
            { name: "All servers (no filter)", value: "all" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("add-server")
      .setDescription("Add a server to the include/exclude list")
      .addStringOption(opt =>
        opt
          .setName("server-id")
          .setDescription("Server ID to add (or 'current' for this server)")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("remove-server")
      .setDescription("Remove a server from the include/exclude list")
      .addStringOption(opt =>
        opt
          .setName("server-id")
          .setDescription("Server ID to remove (or 'current' for this server)")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("add-channel-by-id")
      .setDescription("Add a channel from ANY server by its ID")
      .addStringOption(opt =>
        opt
          .setName("channel-id")
          .setDescription("Channel ID to add (17-20 digit number)")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("list-all-channels")
      .setDescription("List all channels across all servers that match the pattern")
  );

export async function execute(interaction: any, services: any) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "view":
        await handleView(interaction);
        break;
      case "enable":
        await handleEnable(interaction);
        break;
      case "disable":
        await handleDisable(interaction);
        break;
      case "set-frequency":
        await handleSetFrequency(interaction);
        break;
      case "set-limit":
        await handleSetLimit(interaction);
        break;
      case "toggle-source":
        await handleToggleSource(interaction);
        break;
      case "run-now":
        await handleRunNow(interaction);
        break;
      case "add-channel":
        await handleAddChannel(interaction);
        break;
      case "remove-channel":
        await handleRemoveChannel(interaction);
        break;
      case "set-channel-pattern":
        await handleSetChannelPattern(interaction);
        break;
      case "clear-channel-pattern":
        await handleClearChannelPattern(interaction);
        break;
      case "set-server-mode":
        await handleSetServerMode(interaction);
        break;
      case "add-server":
        await handleAddServer(interaction);
        break;
      case "remove-server":
        await handleRemoveServer(interaction);
        break;
      case "add-channel-by-id":
        await handleAddChannelById(interaction);
        break;
      case "list-all-channels":
        await handleListAllChannels(interaction);
        break;
    }
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Social media config error", { error: msg });
    await interaction.editReply({
      content: `Error: ${msg}`
    });
  }
}

/**
 * View current configuration
 */
async function handleView(interaction: any) {
  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  let response = "**Social Media Monitor Configuration**\n\n";

  if (!config) {
    response += "Status: **Not configured**\n\n";
    response += "Use `/config-social enable` to set up the social media monitor.";
    await interaction.editReply({ content: response });
    return;
  }

  response += `Status: ${config.enabled ? "**Enabled**" : "**Disabled**"}\n`;
  response += `Frequency: ${config.frequency || "Every 2 hours"}\n`;
  response += `Max shares per run: ${config.maxSharesPerRun || 3}\n\n`;

  // Show explicit channels grouped by server
  response += "**Explicit Channels:**\n";
  if (config.channelIds && config.channelIds.length > 0) {
    const channelsByServer = new Map();
    for (const channelId of config.channelIds) {
      const channel = interaction.client.channels.cache.get(channelId);
      if (channel) {
        const guildName = channel.guild?.name || "Unknown Server";
        if (!channelsByServer.has(guildName)) {
          channelsByServer.set(guildName, []);
        }
        channelsByServer.get(guildName).push({ id: channelId, name: channel.name });
      } else {
        if (!channelsByServer.has("(Inaccessible)")) {
          channelsByServer.set("(Inaccessible)", []);
        }
        channelsByServer.get("(Inaccessible)").push({ id: channelId, name: "?" });
      }
    }
    for (const [serverName, channels] of channelsByServer) {
      response += `  **${serverName}:**\n`;
      for (const ch of channels) {
        response += `    - #${ch.name} (\`${ch.id}\`)\n`;
      }
    }
  } else {
    response += "  No explicit channels configured\n";
  }

  // Show channel pattern and matched channels
  if (config.channelPattern) {
    response += `\n**Channel Pattern:** \`${config.channelPattern}\``;
    response += ` (${config.channelPatternEnabled !== false ? "Enabled" : "Disabled"})\n`;

    // Show pattern-matched channels across all servers
    if (config.channelPatternEnabled !== false) {
      const matchedChannels = findPatternMatchedChannels(interaction.client, config);
      if (matchedChannels.length > 0) {
        response += `**Pattern-Matched Channels (${matchedChannels.length}):**\n`;
        const byServer = new Map();
        for (const ch of matchedChannels) {
          const guildName = ch.guild?.name || "Unknown";
          if (!byServer.has(guildName)) {
            byServer.set(guildName, []);
          }
          byServer.get(guildName).push(ch);
        }
        for (const [serverName, channels] of byServer) {
          response += `  **${serverName}:**\n`;
          for (const ch of channels) {
            response += `    - #${ch.name} (\`${ch.id}\`)\n`;
          }
        }
      } else {
        response += "  No channels match the pattern\n";
      }
    }
  }

  // Show server filter
  response += "\n**Server Filter:**\n";
  const serverMode = config.serverMode || "all";
  const serverModeLabels: Record<string, string> = {
    all: "All servers (no filter)",
    include: "Include only listed servers",
    exclude: "Exclude listed servers"
  };
  response += `  Mode: ${serverModeLabels[String(serverMode)] || String(serverMode)}\n`;
  if (serverMode !== "all" && config.serverIds && config.serverIds.length > 0) {
    for (const serverId of config.serverIds) {
      const guild = interaction.client.guilds.cache.get(serverId);
      response += `    - ${guild?.name || "Unknown"} (\`${serverId}\`)\n`;
    }
  }

  // Show sources
  response += "\n**Sources:**\n";
  const sources = config.sources || { reddit: true, youtube: true, twitter: true, news: true };
  response += `  Reddit: ${sources.reddit ? "Enabled" : "Disabled"}\n`;
  response += `  YouTube: ${sources.youtube ? "Enabled" : "Disabled"}\n`;
  response += `  Twitter/X: ${sources.twitter ? "Enabled" : "Disabled"}\n`;
  response += `  News: ${sources.news ? "Enabled" : "Disabled"}\n`;

  response += "\n**Commands:**\n";
  response += "  `/config-social run-now` - Run immediately\n";
  response += "  `/config-social list-all-channels` - See all matching channels\n";
  response += "  `/config-social add-channel-by-id` - Add channel from any server\n";

  await interaction.editReply({ content: response });
}

/**
 * Helper: Check if a channel name matches the pattern
 * Supports wildcards (*) and full regular expressions
 */
function matchesChannelPattern(channelName: string, pattern: string) {
  if (!pattern) return false;

  try {
    // Check if pattern looks like a regex (starts with / and ends with /)
    if (pattern.startsWith("/") && pattern.includes("/", 1)) {
      const lastSlash = pattern.lastIndexOf("/");
      const regexPattern = pattern.substring(1, lastSlash);
      const flags = pattern.substring(lastSlash + 1);
      const regex = new RegExp(regexPattern, flags || "i");
      return regex.test(channelName);
    }

    // If pattern has no wildcards, do a simple substring match (case-insensitive)
    if (!pattern.includes("*")) {
      return channelName.toLowerCase().includes(pattern.toLowerCase());
    }

    // Convert wildcard pattern to regex (case-insensitive)
    // Escape special regex characters except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    // Use full match (^...$) for explicit wildcard patterns
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(channelName);
  } catch (error: unknown) {
    // If regex is invalid, fall back to substring match
    return channelName.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Helper: Find all channels across all servers that match the pattern
 */
function findPatternMatchedChannels(client: any, config: any) {
  const pattern = config.channelPattern;
  if (!pattern || config.channelPatternEnabled === false) {
    return [];
  }

  const matched = [];
  const serverMode = config.serverMode || "all";
  const serverIds = config.serverIds || [];

  for (const guild of client.guilds.cache.values()) {
    // Check server filter
    if (serverMode === "include" && !serverIds.includes(guild.id)) continue;
    if (serverMode === "exclude" && serverIds.includes(guild.id)) continue;

    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== 0) continue; // Only text channels (GuildText = 0)
      if (matchesChannelPattern(channel.name, pattern)) {
        matched.push(channel);
      }
    }
  }

  return matched;
}

/**
 * Enable the monitor with specified channels
 */
async function handleEnable(interaction: any) {
  const channelIds = [];
  for (let i = 1; i <= 3; i++) {
    const channel = interaction.options.getChannel(`channel${i}`);
    if (channel) {
      channelIds.push(channel.id);
    }
  }

  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        key: CONFIG_KEY,
        enabled: true,
        channelIds,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      },
      $setOnInsert: {
        maxSharesPerRun: 3,
        frequency: "2h",
        sources: {
          reddit: true,
          youtube: true,
          twitter: true,
          news: true
        }
      }
    },
    { upsert: true }
  );

  let response = "**Social Media Monitor Enabled**\n\n";
  response += "Channels:\n";
  for (const channelId of channelIds) {
    response += `  <#${channelId}>\n`;
  }
  response += "\nThe bot will search for Elio-related news every 2 hours and share with a random persona.\n";
  response += "\nUse `/config-social run-now` to test immediately.";

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Social media monitor enabled", {
    channelCount: channelIds.length,
    user: interaction.user.username
  });
}

/**
 * Disable the monitor
 */
async function handleDisable(interaction: any) {
  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        enabled: false,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    }
  );

  await interaction.editReply({
    content: "**Social Media Monitor Disabled**\n\nThe bot will stop searching for Elio news.\nUse `/config-social enable` to re-enable."
  });

  logger.info("[CONFIG] Social media monitor disabled", { user: interaction.user.username });
}

/**
 * Set search frequency
 */
async function handleSetFrequency(interaction: any) {
  const frequency = interaction.options.getString("frequency");

  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        frequency,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  const frequencyNames: Record<string, string> = {
    "1h": "Every hour",
    "2h": "Every 2 hours",
    "4h": "Every 4 hours",
    "6h": "Every 6 hours",
    "12h": "Every 12 hours",
    "24h": "Daily"
  };

  await interaction.editReply({
    content: `**Frequency Updated**\n\nSocial media monitor will now run: **${frequencyNames[String(frequency)] || String(frequency)}**\n\nNote: Changes will take effect on next bot restart or cron reload.`
  });

  logger.info("[CONFIG] Social media frequency changed", { frequency, user: interaction.user.username });
}

/**
 * Set max shares per run
 */
async function handleSetLimit(interaction: any) {
  const maxShares = interaction.options.getInteger("max-shares");

  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        maxSharesPerRun: maxShares,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  await interaction.editReply({
    content: `**Limit Updated**\n\nMaximum shares per run: **${maxShares}**`
  });

  logger.info("[CONFIG] Social media limit changed", { maxShares, user: interaction.user.username });
}

/**
 * Toggle a news source
 */
async function handleToggleSource(interaction: any) {
  const source = interaction.options.getString("source");
  const enabled = interaction.options.getBoolean("enabled");

  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  const sources = config?.sources || {
    reddit: true,
    youtube: true,
    twitter: true,
    news: true
  };

  sources[source] = enabled;

  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        sources,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  const sourceNames: Record<string, string> = {
    reddit: "Reddit",
    youtube: "YouTube",
    twitter: "Twitter/X",
    news: "News"
  };

  await interaction.editReply({
    content: `**Source Updated**\n\n${sourceNames[String(source)] || String(source)}: **${enabled ? "Enabled" : "Disabled"}**`
  });

  logger.info("[CONFIG] Social media source toggled", { source, enabled, user: interaction.user.username });
}

/**
 * Run the monitor immediately
 */
async function handleRunNow(interaction: any) {
  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  if (!config || !config.channelIds || config.channelIds.length === 0) {
    await interaction.editReply({
      content: "No channels configured. Use `/config-social enable` first."
    });
    return;
  }

  await interaction.editReply({
    content: "Searching for Elio news now..."
  });

  try {
    await runSocialMonitor(interaction.client);
    await interaction.followUp({
      content: "Social media scan complete! Check your configured channels for any new content.",
      ephemeral: true
    });
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Run now failed", { error: msg });
    await interaction.followUp({
      content: `Failed: ${msg}`,
      ephemeral: true
    });
  }
}

/**
 * Add a channel
 */
async function handleAddChannel(interaction: any) {
  const channel = interaction.options.getChannel("channel");

  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  const channelIds = config?.channelIds || [];

  if (channelIds.includes(channel.id)) {
    await interaction.editReply({
      content: `<#${channel.id}> is already in the list.`
    });
    return;
  }

  channelIds.push(channel.id);

  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        channelIds,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  await interaction.editReply({
    content: `**Channel Added**\n\n<#${channel.id}> will now receive Elio news.\n\nTotal channels: ${channelIds.length}`
  });

  logger.info("[CONFIG] Channel added to social monitor", { channelId: channel.id, user: interaction.user.username });
}

/**
 * Remove a channel
 */
async function handleRemoveChannel(interaction: any) {
  const channel = interaction.options.getChannel("channel");

  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  if (!config?.channelIds || !config.channelIds.includes(channel.id)) {
    await interaction.editReply({
      content: `<#${channel.id}> is not in the list.`
    });
    return;
  }

  const channelIds = config.channelIds.filter((id: any) => id !== channel.id);

  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        channelIds,
        updatedAt: new Date()
      }
    }
  );

  await interaction.editReply({
    content: `**Channel Removed**\n\n<#${channel.id}> will no longer receive Elio news.\n\nRemaining channels: ${channelIds.length}`
  });

  logger.info("[CONFIG] Channel removed from social monitor", { channelId: channel.id, user: interaction.user.username });
}

/**
 * Set channel name pattern for auto-matching
 */
async function handleSetChannelPattern(interaction: any) {
  const pattern = interaction.options.getString("pattern");
  const enabled = interaction.options.getBoolean("enabled") ?? true;

  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        channelPattern: pattern,
        channelPatternEnabled: enabled,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    },
    { upsert: true }
  );

  let response = `**Channel Pattern ${enabled ? "Set" : "Disabled"}**\n\n`;
  response += `Pattern: \`${pattern}\`\n`;
  response += `Status: ${enabled ? "Enabled" : "Disabled"}\n\n`;
  response += "Channels with names matching this pattern (case-insensitive) will receive news.\n";
  response += "Use `*` as wildcard (e.g., `*news*`, `elio*`, `*media`)";

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Channel pattern set", { pattern, enabled, user: interaction.user.username });
}

/**
 * Clear channel pattern
 */
async function handleClearChannelPattern(interaction: any) {
  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $unset: {
        channelPattern: "",
        channelPatternEnabled: ""
      },
      $set: {
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    }
  );

  await interaction.editReply({
    content: "**Channel Pattern Cleared**\n\nOnly explicitly added channels will receive news."
  });

  logger.info("[CONFIG] Channel pattern cleared", { user: interaction.user.username });
}

/**
 * Set server filter mode (include, exclude, or all)
 */
async function handleSetServerMode(interaction: any) {
  const mode = interaction.options.getString("mode");

  const configCol = getCollection("bot_config");
  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        serverMode: mode,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    },
    { upsert: true }
  );

  const modeLabels: Record<string, string> = {
    all: "All servers (no filter)",
    include: "Include only listed servers",
    exclude: "Exclude listed servers"
  };

  let response = `**Server Filter Mode Updated**\n\n`;
  response += `Mode: **${modeLabels[String(mode)] || String(mode)}**\n\n`;

  if (mode === "include") {
    response += "Only servers in the server list will receive news.\n";
    response += "Use `/config-social add-server` to add servers.";
  } else if (mode === "exclude") {
    response += "All servers EXCEPT those in the list will receive news.\n";
    response += "Use `/config-social add-server` to add servers to exclude.";
  } else {
    response += "All servers will receive news (server list ignored).";
  }

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Server mode changed", { mode, user: interaction.user.username });
}

/**
 * Add a server to the include/exclude list
 */
async function handleAddServer(interaction: any) {
  let serverId = interaction.options.getString("server-id");

  // Handle "current" keyword
  if (serverId.toLowerCase() === "current") {
    serverId = interaction.guildId;
  }

  // Validate server ID format (numeric string)
  if (!/^\d{17,20}$/.test(serverId)) {
    await interaction.editReply({
      content: `Invalid server ID: \`${serverId}\`\n\nServer IDs are 17-20 digit numbers.\nUse \`current\` to add this server.`
    });
    return;
  }

  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  const serverIds = config?.serverIds || [];

  if (serverIds.includes(serverId)) {
    await interaction.editReply({
      content: `Server \`${serverId}\` is already in the list.`
    });
    return;
  }

  serverIds.push(serverId);

  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        serverIds,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    },
    { upsert: true }
  );

  const serverMode = config?.serverMode || "all";
  let response = `**Server Added**\n\n`;
  response += `Server ID: \`${serverId}\`\n`;
  response += `Total servers in list: ${serverIds.length}\n\n`;

  if (serverMode === "all") {
    response += "Note: Server mode is set to 'all', so this list is currently ignored.\n";
    response += "Use `/config-social set-server-mode` to change.";
  } else if (serverMode === "include") {
    response += "This server will receive news.";
  } else {
    response += "This server will be excluded from receiving news.";
  }

  await interaction.editReply({ content: response });

  logger.info("[CONFIG] Server added to filter list", { serverId, user: interaction.user.username });
}

/**
 * Remove a server from the include/exclude list
 */
async function handleRemoveServer(interaction: any) {
  let serverId = interaction.options.getString("server-id");

  // Handle "current" keyword
  if (serverId.toLowerCase() === "current") {
    serverId = interaction.guildId;
  }

  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  if (!config?.serverIds || !config.serverIds.includes(serverId)) {
    await interaction.editReply({
      content: `Server \`${serverId}\` is not in the list.`
    });
    return;
  }

  const serverIds = config.serverIds.filter((id: any) => id !== serverId);

  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        serverIds,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    }
  );

  await interaction.editReply({
    content: `**Server Removed**\n\nServer \`${serverId}\` removed from filter list.\n\nRemaining servers: ${serverIds.length}`
  });

  logger.info("[CONFIG] Server removed from filter list", { serverId, user: interaction.user.username });
}

/**
 * Add a channel from ANY server by its ID
 */
async function handleAddChannelById(interaction: any) {
  const channelId = interaction.options.getString("channel-id");

  // Validate channel ID format
  if (!/^\d{17,20}$/.test(channelId)) {
    await interaction.editReply({
      content: `Invalid channel ID: \`${channelId}\`\n\nChannel IDs are 17-20 digit numbers.`
    });
    return;
  }

  // Try to get the channel from all cached guilds
  const channel = interaction.client.channels.cache.get(channelId);
  if (!channel) {
    await interaction.editReply({
      content: `Channel \`${channelId}\` not found.\n\nMake sure the bot is in the server where this channel exists.`
    });
    return;
  }

  if (channel.type !== 0) { // GuildText = 0
    await interaction.editReply({
      content: `Channel \`${channelId}\` is not a text channel.`
    });
    return;
  }

  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  const channelIds = config?.channelIds || [];

  if (channelIds.includes(channelId)) {
    await interaction.editReply({
      content: `Channel #${channel.name} (\`${channelId}\`) is already in the list.`
    });
    return;
  }

  channelIds.push(channelId);

  await configCol.updateOne(
    { key: CONFIG_KEY },
    {
      $set: {
        channelIds,
        updatedAt: new Date(),
        updatedBy: interaction.user.id
      }
    },
    { upsert: true }
  );

  await interaction.editReply({
    content: `**Channel Added**\n\n#${channel.name} from **${channel.guild.name}** (\`${channelId}\`) will now receive Elio news.\n\nTotal channels: ${channelIds.length}`
  });

  logger.info("[CONFIG] Channel added by ID to social monitor", {
    channelId,
    channelName: channel.name,
    guildName: channel.guild.name,
    user: interaction.user.username
  });
}

/**
 * List all channels across all servers that match the pattern
 */
async function handleListAllChannels(interaction: any) {
  const configCol = getCollection("bot_config");
  const config = await configCol.findOne({ key: CONFIG_KEY });

  let response = "**All Available Channels Across Servers**\n\n";

  // List all servers the bot is in
  const guilds = interaction.client.guilds.cache;
  response += `Bot is in **${guilds.size}** servers\n\n`;

  // Get pattern-matched channels
  const pattern = config?.channelPattern;
  const patternEnabled = config?.channelPatternEnabled !== false;

  for (const guild of guilds.values()) {
    const textChannels = guild.channels.cache.filter((ch: any) => ch.type === 0);

    response += `**${guild.name}** (\`${guild.id}\`)\n`;

    let matchCount = 0;
    for (const channel of textChannels.values()) {
      const isExplicit = config?.channelIds?.includes(channel.id);
      const isPatternMatched = pattern && patternEnabled && matchesChannelPattern(channel.name, pattern);

      if (isExplicit || isPatternMatched) {
        const markers = [];
        if (isExplicit) markers.push("explicit");
        if (isPatternMatched) markers.push("pattern");
        response += `  - #${channel.name} (\`${channel.id}\`) [${markers.join(", ")}]\n`;
        matchCount++;
      }
    }

    if (matchCount === 0) {
      response += "  (no matching channels)\n";
    }
    response += "\n";
  }

  // If response is too long, truncate
  if (response.length > 1900) {
    response = response.substring(0, 1900) + "\n\n*... (truncated)*";
  }

  response += "\n**Tip:** Use `/config-social add-channel-by-id` to add any channel by ID.";

  await interaction.editReply({ content: response });
}
