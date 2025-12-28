/**
 * config-persona.js
 * Configure automatic persona chat feature
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { getCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Available personas for automatic chat
const PERSONAS = [
  { name: "Random (any persona)", value: "random" },
  { name: "Elio", value: "elio" },
  { name: "Caleb", value: "caleb" },
  { name: "Bryce", value: "bryce" }
];

export const data = new SlashCommandBuilder()
  .setName("config-persona")
  .setDescription("Configure automatic persona chat feature")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addBooleanOption(opt =>
    opt
      .setName("enabled")
      .setDescription("Enable or disable automatic persona chat")
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt
      .setName("persona")
      .setDescription("Which persona should speak")
      .setRequired(false)
      .addChoices(...PERSONAS)
  )
  .addChannelOption(opt =>
    opt
      .setName("channel1")
      .setDescription("First channel for persona chat")
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
      .setName("channel-pattern")
      .setDescription("Custom pattern to match channel names (e.g., 'chat', 'general')")
      .setRequired(false)
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
  .addIntegerOption(opt =>
    opt
      .setName("cooldown-hours")
      .setDescription("Hours between automatic messages (default: 2)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(24)
  );

export async function execute(interaction: any) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const enabled = interaction.options.getBoolean("enabled");
    const persona = interaction.options.getString("persona");
    const channelPattern = interaction.options.getString("channel-pattern");
    const includeServers = interaction.options.getString("include-servers") as string | null;
    const excludeServers = interaction.options.getString("exclude-servers") as string | null;
    const cooldownHours = interaction.options.getInteger("cooldown-hours");

    const configCol = getCollection("bot_config");

    const updateDoc: Record<string, any> = {
      key: "auto_persona_chat",
      enabled,
      updatedAt: new Date()
    };

    // Parse server filters
    if (includeServers) {
      updateDoc.includeServers = includeServers
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    if (excludeServers) {
      updateDoc.excludeServers = excludeServers
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    // Get channel IDs from explicit selections or pattern matching
    const channelIds = extractChannelIds(interaction, channelPattern, updateDoc.includeServers, updateDoc.excludeServers);
    if (channelIds.length > 0) {
      updateDoc.channelIds = channelIds;
    }

    if (channelPattern) {
      updateDoc.channelPattern = channelPattern;
    }

    if (persona) {
      updateDoc.persona = persona;
    }

    if (cooldownHours !== null) {
      updateDoc.cooldownHours = cooldownHours;
    }

    await configCol.updateOne(
      { key: "auto_persona_chat" },
      { $set: updateDoc },
      { upsert: true }
    );

    let response = `**Persona Chat Configuration Updated**\n\n`;
    response += `Status: ${enabled ? "Enabled" : "Disabled"}\n`;
    if (persona) {
      const personaLabel = PERSONAS.find(p => p.value === persona)?.name || persona;
      response += `Persona: ${personaLabel}\n`;
    }
    if (updateDoc.channelIds && updateDoc.channelIds.length > 0) {
      if (channelPattern) {
        response += `Channels (pattern '${channelPattern}'): ${updateDoc.channelIds.length} found\n`;
      } else {
        response += `Channels: ${updateDoc.channelIds.length} configured\n`;
      }
      response += `${updateDoc.channelIds.slice(0, 5).map((id: any) => `<#${id}>`).join(", ")}${updateDoc.channelIds.length > 5 ? ` +${updateDoc.channelIds.length - 5} more` : ""}\n`;
    }
    if (updateDoc.includeServers?.length > 0) {
      response += `Include Servers: ${updateDoc.includeServers.length} specified\n`;
    }
    if (updateDoc.excludeServers?.length > 0) {
      response += `Exclude Servers: ${updateDoc.excludeServers.length} specified\n`;
    }
    if (cooldownHours !== null) {
      response += `Cooldown: ${cooldownHours} hours\n`;
    }
    response += `\nPersonas will automatically chat in configured channels`;

    await interaction.editReply({ content: response });

    logger.info("[CONFIG] Persona chat config updated", {
      enabled,
      persona: updateDoc.persona,
      channelCount: updateDoc.channelIds?.length || 0,
      channelPattern,
      includeServers: updateDoc.includeServers,
      excludeServers: updateDoc.excludeServers,
      cooldownHours: updateDoc.cooldownHours,
      user: interaction.user.username
    });
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("[CONFIG] Persona chat config error", { error: msg });
    await interaction.editReply({ content: `Error: ${msg}` });
  }
}

function extractChannelIds(
  interaction: any,
  channelPattern: string | null = null,
  includeServers: string[] | null = null,
  excludeServers: string[] | null = null
): string[] {
  const channelIds: string[] = [];

  // First, collect explicitly selected channels
  for (let i = 1; i <= 3; i++) {
    const channel = interaction.options.getChannel(`channel${i}`);
    if (channel) {
      channelIds.push(channel.id);
    }
  }

  // If pattern specified and no explicit channels, auto-detect
  if (channelPattern && channelIds.length === 0) {
    const pattern = channelPattern.toLowerCase();

    for (const guild of interaction.client.guilds.cache.values()) {
      // Apply server filters
      if (includeServers && includeServers.length > 0) {
        if (!includeServers.includes(guild.id)) continue;
      }
      if (excludeServers && excludeServers.length > 0) {
        if (excludeServers.includes(guild.id)) continue;
      }

      for (const channel of guild.channels.cache.values()) {
        if (channel.isTextBased() && channel.name.toLowerCase().includes(pattern)) {
          channelIds.push(channel.id);
        }
      }
    }
  }

  return channelIds;
}
