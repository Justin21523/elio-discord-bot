<<<<<<< HEAD
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
=======
// /scenario start|answer|reveal
// English-only.

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } from 'discord.js';
import * as scenarios from '../services/scenario.js';
import { formatErrorEmbed, safeEdit, ensureDeferred } from '../util/replies.js';
import { incCounter} from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName('scenario')
  .setDescription('Play a scenario quiz or speedrun.')
  .addSubcommand(sc => sc
    .setName('start')
    .setDescription('Start a scenario session')
    .addStringOption(o => o.setName('tag').setDescription('Scenario tag').setRequired(false))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration seconds (default 30)').setRequired(false))
  )
  .addSubcommand(sc => sc
    .setName('reveal')
    .setDescription('Reveal the answer & stats')
  )
  .addSubcommand(sc => sc
    .setName('cancel')
    .setDescription('Cancel the active session (admin)')
  )
  .setDMPermission(false);


export async function execute(interaction) {
  const startAt = Date.now();
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  try {
    await ensureDeferred(interaction, false);

    if (sub === 'start') {
      const tag = interaction.options.getString('tag') || null;
      const duration = interaction.options.getInteger('duration') || 30;

      const result = await scenarios.startSession({ guildId, channelId, tag, durationSec: duration });
      if (!result.ok) return safeEdit(interaction, formatErrorEmbed(result.error, 'failed to start'));

      const s = result.data.session;
      const letters = ['A','B','C','D'];
      const title = `Scenario • ${s.hostPersonaName || 'Elio'} • ${s.durationSec}s`;

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x72C5FF)
        .setDescription(`**Q:** ${s.prompt}\n\n${s.options.map((o, i) => `**${letters[i]}** ${o}`).join('\n')}`)
        .setFooter({ text: 'Answer by clicking a button below' });

      const row = new ActionRowBuilder().addComponents(
        ...s.options.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`scn:${s._id}:${i}`)
            .setLabel(letters[i])
            .setStyle(ButtonStyle.Primary)
        )
      );

      const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
      await safeEdit(interaction, { content: `Question started for **${s.durationSec}s**. Good luck!`, embeds: [] });

      // Collector for button clicks
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: s.durationSec * 1000
      });

      collector.on('collect', async (btn) => {
        // Ignore other channels/guilds
        if (btn.channelId !== channelId) return;
        // Parse customId
        const [_, sid, idx] = String(btn.customId).split(':');
        if (sid !== String(s._id)) {
          return btn.reply({ content: 'This question is no longer active.', ephemeral: true });
        }
        const res = await scenarios.answer({
          guildId, channelId, userId: btn.user.id, index: Number(idx)
        });
        if (!res.ok) {
          return btn.reply({ content: `❌ ${res.error.message}`, ephemeral: true });
        }
        if (res.data.correct) {
          const bonus = res.data.first ? ` (+${res.data.scored} pts, FIRST!)` : ` (+${res.data.scored} pts)`;
          return btn.reply({ content: `✅ Correct${bonus}`, ephemeral: true });
        } else {
          return btn.reply({ content: `❌ Wrong answer`, ephemeral: true });
        }
      });

      collector.on('end', async () => {
        // Auto reveal after timeout
        const rev = await scenarios.reveal({ guildId, channelId });
        if (!rev.ok) {
          return interaction.channel.send({ content: `⚠️ Reveal failed: ${rev.error.message}` });
        }
        const r = rev.data;
        const revealEmbed = new EmbedBuilder()
          .setTitle('Answer Revealed')
          .setColor(0x3FB950)
          .setDescription(`**Q:** ${r.prompt}\n\n**A:** ${letters[r.correctIndex]} — ${r.options[r.correctIndex]}\n\n` +
            `Total answers: **${r.totalAnswers}**, correct: **${r.correctCount}**`)
          .setFooter({ text: 'Great work!' });

        await interaction.channel.send({ embeds: [revealEmbed] });
      });

      incCounter('commands_total', { command: 'scenario.start' });
      return;
    }

    if (sub === 'reveal') {
      const rev = await scenarios.reveal({ guildId, channelId });
      if (!rev.ok) return safeEdit(interaction, formatErrorEmbed(rev.error, 'Reveal failed'));
      const r = rev.data;
      const letters = ['A','B','C','D'];
      const revealEmbed = {
        title: 'Answer Revealed (manual)',
        color: 0x3FB950,
        description: `**Q:** ${r.prompt}\n\n**A:** ${letters[r.correctIndex]} — ${r.options[r.correctIndex]}\n\n` +
          `Total answers: **${r.totalAnswers}**, correct: **${r.correctCount}**`
      };
      await safeEdit(interaction, { embeds: [revealEmbed] });
      return;
    }

    if (sub === 'cancel') {
      const res = await scenarios.cancel({ guildId, channelId });
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Cancel failed'));
      await safeEdit(interaction, { content: 'Session cancelled.' });
      return;
    }
  } catch (e) {
    await safeEdit(interaction, formatErrorEmbed({ code: 'UNKNOWN', message: 'Scenario command crashed' }));
  }
}
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
