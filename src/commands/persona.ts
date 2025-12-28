/**
 * commands/persona.js
 * Persona command handlers: /persona meet, /persona act, /persona config
 */

import { SlashCommandBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { successEmbed, errorEmbed, infoEmbed } from "../util/replies.js";
import {
  getPersona,
  listPersonas,
  getConfig,
  setConfig,
  affinityDelta,
} from "../services/persona.js";
import { sendAsPersona } from "../services/webhooks.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const data = new SlashCommandBuilder()
  .setName("persona")
  .setDescription("Interact with personas")
  .addSubcommand((sub) =>
    sub
      .setName("meet")
      .setDescription("Have a persona appear in a channel")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Persona name")
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel for persona to appear in")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("ask")
      .setDescription("Ask a persona a question")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Persona name")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("question")
          .setDescription("Your question")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("interact")
      .setDescription("Interact with a persona")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Persona name")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("action")
          .setDescription("Type of interaction")
          .setRequired(true)
          .addChoices(
            { name: "Tell a joke", value: "joke" },
            { name: "Give a gift", value: "gift" },
            { name: "Offer help", value: "help" },
            { name: "Challenge", value: "challenge" },
            { name: "Comfort", value: "comfort" },
            { name: "Tease", value: "tease" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("affinity")
      .setDescription("Check your affinity with a persona")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Persona name")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List available personas")
  )
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription("Manage persona configuration")
      .addStringOption((opt) =>
        opt
          .setName("action")
          .setDescription("Configuration action")
          .setRequired(true)
          .addChoices(
            { name: "Get", value: "get" },
            { name: "Set", value: "set" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("key")
          .setDescription("Configuration key (for set)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("value")
          .setDescription("Configuration value (for set)")
          .setRequired(false)
      )
  );

/**
 * Main persona command router
 * @param {ChatInputCommandInteraction} interaction
 * @param {Object} services - Services object
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function execute(interaction: any, services: any) {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "meet":
      return await handlePersonaMeet(interaction);
    case "ask":
      return await handlePersonaAsk(interaction, services);
    case "interact":
      return await handlePersonaInteract(interaction);
    case "affinity":
      return await handlePersonaAffinity(interaction);
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
async function handlePersonaMeet(interaction: any) {
  try {
    const personaName = interaction.options.getString("name", true);
    const targetChannel =
      interaction.options.getChannel("channel") || interaction.channel;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // Get persona
    const personaResult: any = await getPersona(personaName);
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
    const sayResult: any = await sendAsPersona(targetChannel.id, persona, { content: greeting });

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
    } as any);

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
  } catch (error: unknown) {
    logger.error("[CMD] /persona meet failed", {
      guildId: interaction.guildId,
      error: getErrorMessage(error),
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
async function handlePersonaList(interaction: any) {
  try {
    const listResult: any = await listPersonas();
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
  } catch (error: unknown) {
    logger.error("[CMD] /persona list failed", {
      guildId: interaction.guildId,
      error: getErrorMessage(error),
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
 * Handle /persona ask <name> <question>
 */
async function handlePersonaAsk(interaction: any, services: any) {
  try {
    const personaName = interaction.options.getString("name", true);
    const question = interaction.options.getString("question", true);
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // Get persona
    const personaResult: any = await getPersona(personaName);
    if (!personaResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Persona Not Found",
            `Persona "${personaName}" doesn't exist.`
          ),
        ],
      });
      return personaResult;
    }

    const persona = personaResult.data;

    // Use AI service to generate response
    const aiResult: any = await services.ai.persona.compose(question, persona);

    if (!aiResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "AI Error",
            "Failed to generate response. Please try again."
          ),
        ],
      });
      return aiResult;
    }

    // Send response as persona via webhook
    const channel = interaction.channel;
    await sendAsPersona(channel.id, persona, { content: aiResult.data.text });

    // Update affinity
    await affinityDelta({
      guildId,
      userId,
      personaId: persona._id.toString(),
      delta: { friendship: 1, trust: 1 },
      action: "ask",
    } as any);

    await interaction.editReply({
      embeds: [successEmbed("Question Asked", `${persona.name} has responded!`)],
    });

    return { ok: true };
  } catch (error: unknown) {
    logger.error("[CMD] /persona ask failed", {
      guildId: interaction.guildId,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to ask persona",
        cause: error,
      },
    };
  }
}

/**
 * Handle /persona interact <name> <action>
 */
async function handlePersonaInteract(interaction: any) {
  try {
    const personaName = interaction.options.getString("name", true);
    const action = interaction.options.getString("action", true);
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // Get persona
    const personaResult: any = await getPersona(personaName);
    if (!personaResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Persona Not Found",
            `Persona "${personaName}" doesn't exist.`
          ),
        ],
      });
      return personaResult;
    }

    const persona = personaResult.data;

    // Get action deltas from persona data
    const actionData = persona.actions?.[action];

    if (!actionData) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Action Not Available",
            `${persona.name} doesn't respond to "${action}"`
          ),
        ],
      });
      return { ok: false };
    }

    // Apply affinity delta
    await affinityDelta({
      guildId,
      userId,
      personaId: persona._id.toString(),
      delta: {
        friendship: actionData.friendship || 0,
        trust: actionData.trust || 0,
        dependence: actionData.dependence || 0,
      },
      action,
    } as any);

    // Generate response message
    const responses = {
      joke: `${persona.name} laughs at your joke! 😄`,
      gift: `${persona.name} gratefully accepts your gift! 🎁`,
      help: `${persona.name} appreciates your help! 🤝`,
      challenge: `${persona.name} accepts your challenge! 💪`,
      comfort: `${persona.name} feels comforted! 💙`,
      tease: `${persona.name} reacts to your teasing! 😏`,
    };

    const friendshipChange =
      actionData.friendship > 0
        ? ` +${actionData.friendship} friendship`
        : actionData.friendship < 0
        ? ` ${actionData.friendship} friendship`
        : "";
    const trustChange =
      actionData.trust > 0
        ? ` +${actionData.trust} trust`
        : actionData.trust < 0
        ? ` ${actionData.trust} trust`
        : "";

    const responseText = (responses as Record<string, string>)[String(action)] || "";
    const changes = [friendshipChange, trustChange].filter((c) => c).join(",");

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Interaction Complete",
          `${responseText}\n\n**Changes:** ${changes || "None"}\n\n${
            actionData.notes ? `_${actionData.notes}_` : ""
          }`
        ),
      ],
    });

    return { ok: true };
  } catch (error: unknown) {
    logger.error("[CMD] /persona interact failed", {
      guildId: interaction.guildId,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to interact with persona",
        cause: error,
      },
    };
  }
}

/**
 * Handle /persona affinity <name>
 */
async function handlePersonaAffinity(interaction: any) {
  try {
    const personaName = interaction.options.getString("name", true);
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // Get persona
    const personaResult: any = await getPersona(personaName);
    if (!personaResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Persona Not Found",
            `Persona "${personaName}" doesn't exist.`
          ),
        ],
      });
      return personaResult;
    }

    const persona = personaResult.data;

    // Get affinity data from database
    const { getCollection } = await import("../db/mongo.js");
    const affinityCol = getCollection("persona_affinity");
    const affinityDoc = await affinityCol.findOne({
      guildId,
      userId,
      persona: persona._id.toString(),
    });

    const friendship = affinityDoc?.friendship || 0;
    const trust = affinityDoc?.trust || 0;
    const dependence = affinityDoc?.dependence || 0;
    const total = friendship + trust + dependence;

    // Determine relationship level
    let level = "Stranger";
    let emoji = "👤";
    if (total >= 60) {
      level = "Best Friends";
      emoji = "💖";
    } else if (total >= 35) {
      level = "Close Friends";
      emoji = "💙";
    } else if (total >= 15) {
      level = "Friends";
      emoji = "😊";
    } else if (total >= 5) {
      level = "Acquaintance";
      emoji = "🙂";
    }

    const description =
      `**Relationship:** ${emoji} ${level}\n\n` +
      `**Friendship:** ${friendship}\n` +
      `**Trust:** ${trust}\n` +
      `**Dependence:** ${dependence}\n\n` +
      `**Total Affinity:** ${total}\n\n` +
      `_Keep interacting with ${persona.name} to strengthen your bond!_`;

    const embed = infoEmbed(`Affinity with ${persona.name}`, description);
    if (persona.avatarUrl || persona.avatar) {
      embed.thumbnail = { url: persona.avatarUrl || persona.avatar };
    }

    await interaction.editReply({
      embeds: [embed],
    });

    return { ok: true };
  } catch (error: unknown) {
    logger.error("[CMD] /persona affinity failed", {
      guildId: interaction.guildId,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to check affinity",
        cause: error,
      },
    };
  }
}

/**
 * Handle /persona config get|set
 */
async function handlePersonaConfig(interaction: any) {
  try {
    const action = interaction.options.getString("action", true);
    const guildId = interaction.guildId;

    if (action === "get") {
      const configResult: any = await getConfig(guildId);
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
      const setResult: any = await setConfig(guildId, updates as any);

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
  } catch (error: unknown) {
    logger.error("[CMD] /persona config failed", {
      guildId: interaction.guildId,
      error: getErrorMessage(error),
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
