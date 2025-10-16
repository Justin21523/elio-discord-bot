<<<<<<< HEAD
/**
 * commands/leaderboard.js
 * Leaderboard command handler.
 */

import { EmbedBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { leaderboard } from "../services/pointsService.js";

/**
 * Handle /leaderboard command
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export default async function handleLeaderboard(interaction) {
  try {
    const guildId = interaction.guildId;
    const limit = interaction.options.getInteger("limit") || 10;

    // Validate limit
    if (limit < 1 || limit > 25) {
      await interaction.editReply({
        content: "❌ Limit must be between 1 and 25.",
        ephemeral: true,
      });
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Invalid limit",
        },
      };
    }

    // Fetch leaderboard
    const result = await leaderboard({ guildId, limit });

    if (!result.ok) {
      await interaction.editReply({
        content: "❌ Failed to fetch leaderboard. Please try again.",
        ephemeral: true,
      });
      return result;
    }

    const { entries, total } = result.data;

    if (entries.length === 0) {
      await interaction.editReply({
        content:
          "📊 No one has earned points yet. Start playing games to get on the leaderboard!",
        ephemeral: false,
      });
      return { ok: true, data: { empty: true } };
    }

    // Build leaderboard embed
    const embed = new EmbedBuilder()
      .setColor(0xffd700) // Gold
      .setTitle("🏆 Leaderboard")
      .setDescription(`Top ${entries.length} players in this server`)
      .setFooter({ text: `Total players: ${total}` })
      .setTimestamp();

    // Add fields for each entry
    let description = "";
    for (const entry of entries) {
      const medal =
        entry.rank === 1
          ? "🥇"
          : entry.rank === 2
          ? "🥈"
          : entry.rank === 3
          ? "🥉"
          : `${entry.rank}.`;
      const user = await interaction.client.users
        .fetch(entry.userId)
        .catch(() => null);
      const username = user
        ? user.username
        : `User ${entry.userId.slice(0, 6)}`;

      description += `${medal} **${username}** - ${entry.points} pts (Lv${entry.level})`;
      if (entry.streak > 1) {
        description += ` 🔥${entry.streak}`;
      }
      description += "\n";
    }

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });

    logger.command("/leaderboard success", {
      guildId,
      limit,
      entriesCount: entries.length,
    });

    return { ok: true, data: { entries } };
  } catch (error) {
    logger.error("[CMD] /leaderboard failed", {
      guildId: interaction.guildId,
      error: error.message,
    });

    await interaction.editReply({
      content: "❌ Something went wrong. Please try again.",
      ephemeral: true,
    });

    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to show leaderboard",
        cause: error,
      },
    };
  }
}
=======
// English-only code & comments.
// Slash command: /leaderboard (top N, default 10) for current guild.
// Pretty embed with medal emojis.

import { SlashCommandBuilder, EmbedBuilder, userMention } from 'discord.js';
import * as Points from '../services/points.js';
import { ensureDeferred, safeEdit, formatErrorEmbed } from '../util/replies.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';
import { logger as baseLogger } from '../util/logger.js';

const log = baseLogger.child({ cmd: 'leaderboard' });

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the top players in this guild.')
  .addIntegerOption(o =>
    o.setName('limit').setDescription('How many entries (1-50, default 10)').setRequired(false)
  )
  .setDMPermission(false);

const MEDALS = ['🥇', '🥈', '🥉'];

export async function execute(interaction) {
  const stop = startTimer(METRIC_NAMES.command_latency_seconds, { command: 'leaderboard' });
  try {
    await ensureDeferred(interaction, false);
    const guildId = interaction.guildId;
    const limit = interaction.options.getInteger('limit') ?? 10;

    const res = await Points.leaderboard(guildId, limit);
    if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Leaderboard unavailable'));

    const rows = res.data;
    if (!rows.length) {
      await safeEdit(interaction, { content: 'No profiles yet. Use `/game start` or `/points add` to begin!' });
      stop({ command: 'leaderboard' });
      return;
    }

    const lines = rows.map((r, i) => {
      const medal = MEDALS[i] || `#${i + 1}`;
      return `${medal} ${userMention(r.userId)} — **${r.points}** pts (Lv.${r.level})`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Guild Leaderboard')
      .setColor(0xff79c6)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${rows.length}` });

    await safeEdit(interaction, { embeds: [embed] });
    incCounter(METRIC_NAMES.commands_total, { command: 'leaderboard' }, 1);
    stop({ command: 'leaderboard' });
  } catch (e) {
    log.error('[ERR] /leaderboard failed', { e: String(e), guildId: interaction.guildId, userId: interaction.user?.id });
    await safeEdit(interaction, {
      content: '❌ Unexpected error while showing leaderboard.',
      ephemeral: true,
    });
    stop({ command: 'leaderboard' });
  }
}

export default { data, execute };
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
