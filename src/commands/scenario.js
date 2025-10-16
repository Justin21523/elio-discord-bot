/**
 * commands/persona.js
 * Persona command handlers: /persona meet, /persona act, /persona config
 */

import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { successEmbed, errorEmbed, infoEmbed } from "../util/replies.js";
import {
  getPersona,
  listPersonas,
  getConfig,
  setConfig,
  affinityDelta,
} from "../services/personasService.js";
import { personaSay } from "../services/webhooksService.js";

/**
 * Main persona command router
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export default async function handlePersona(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "meet":
      return await handlePersonaMeet(interaction);
    case "list":
      return await handlePersonaList(interaction);
    case "config":
      return await handlePersonaConfig(interaction);
    default:
      return {
        ok: false,
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: "Unknown subcommand",
        },
      };
  }
}

/**
 * Handle /persona meet <name> [#channel]
 */
async function handlePersonaMeet(interaction) {
  try {
    const personaName = interaction.options.getString("name", true);
    const targetChannel =
      interaction.options.getChannel("channel") || interaction.channel;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // Get persona
    const personaResult = await getPersona(personaName);
    if (!personaResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Persona Not Found",
            `Persona "${personaName}" doesn't exist. Use \`/persona list\` to see available personas.`
          ),
        ],
      });
      return personaResult;
    }

    const persona = personaResult.data;

    // Pick greeting
    const greeting =
      persona.openers && persona.openers.length > 0
        ? persona.openers[Math.floor(Math.random() * persona.openers.length)]
        : `Hello! I'm ${persona.name}.`;

    // Send as persona via webhook
    const sayResult = await personaSay({
      client: interaction.client,
      channelId: targetChannel.id,
      persona,
      content: greeting,
    });

    if (!sayResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Failed to Send",
            "Could not send persona message. Check bot permissions for webhooks."
          ),
        ],
      });
      return sayResult;
    }

    // Update affinity
    await affinityDelta({
      guildId,
      userId,
      personaId: persona._id.toString(),
      delta: { friendship: 2, trust: 1 },
      action: "meet",
    });

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Persona Appeared!",
          `${persona.name} has appeared in ${targetChannel}!`
        ),
      ],
    });

    logger.command("/persona meet success", {
      guildId,
      personaName: persona.name,
      channelId: targetChannel.id,
      userId,
    });

    return { ok: true, data: { personaId: persona._id.toString() } };
  } catch (error) {
    logger.error("[CMD] /persona meet failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to make persona appear",
        cause: error,
      },
    };
  }
}

/**
 * Handle /persona list
 */
async function handlePersonaList(interaction) {
  try {
    const listResult = await listPersonas();
    if (!listResult.ok) {
      await interaction.editReply({
        content: "❌ Failed to list personas. Please try again.",
      });
      return listResult;
    }

    const personas = listResult.data;

    if (personas.length === 0) {
      await interaction.editReply({
        content: "📋 No personas available yet.",
      });
      return { ok: true, data: { empty: true } };
    }

    let description = "";
    for (const p of personas) {
      const traits = p.traits
        ? `(Humor: ${p.traits.humor || 0}, Warmth: ${p.traits.warmth || 0})`
        : "";
      description += `**${p.name}** ${traits}\n`;
    }

    await interaction.editReply({
      embeds: [infoEmbed("Available Personas", description)],
    });

    logger.command("/persona list success", {
      guildId: interaction.guildId,
      count: personas.length,
    });

    return { ok: true, data: { personas } };
  } catch (error) {
    logger.error("[CMD] /persona list failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to list personas",
        cause: error,
      },
    };
  }
}

/**
 * Handle /persona config get|set
 */
async function handlePersonaConfig(interaction) {
  try {
    const action = interaction.options.getString("action", true);
    const guildId = interaction.guildId;

    if (action === "get") {
      const configResult = await getConfig(guildId);
      if (!configResult.ok) {
        await interaction.editReply({
          content: "❌ Failed to get config. Please try again.",
        });
        return configResult;
      }

      const config = configResult.data;

      const description =
        `**Cooldown**: ${config.cooldownSec} seconds\n` +
        `**Keyword Triggers**: ${
          config.keywordTriggersEnabled ? "Enabled" : "Disabled"
        }\n` +
        `**Memory Opt-In**: ${config.memoryOptIn ? "Enabled" : "Disabled"}\n` +
        `**Action Multipliers**:\n` +
        Object.entries(config.multipliers || {})
          .map(([action, mult]) => `  • ${action}: ${mult}x`)
          .join("\n");

      await interaction.editReply({
        embeds: [infoEmbed("Persona Configuration", description)],
      });

      return { ok: true, data: config };
    } else if (action === "set") {
      const key = interaction.options.getString("key", true);
      const value = interaction.options.getString("value", true);

      // Parse value
      let parsedValue;
      if (value === "true" || value === "false") {
        parsedValue = value === "true";
      } else if (!isNaN(value)) {
        parsedValue = parseFloat(value);
      } else {
        parsedValue = value;
      }

      const updates = { [key]: parsedValue };
      const setResult = await setConfig(guildId, updates);

      if (!setResult.ok) {
        await interaction.editReply({
          embeds: [errorEmbed("Config Update Failed", setResult.error.message)],
        });
        return setResult;
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            "Config Updated",
            `Set **${key}** to **${parsedValue}**`
          ),
        ],
      });

      return { ok: true, data: setResult.data };
    } else {
      return {
        ok: false,
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: "Unknown config action",
        },
      };
    }
  } catch (error) {
    logger.error("[CMD] /persona config failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to manage config",
        cause: error,
      },
    };
  }
}
