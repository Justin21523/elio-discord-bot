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
