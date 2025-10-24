/**
 * commands/leaderboard.js
 * Leaderboard command handler.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { leaderboard } from "../services/points.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the server leaderboard")
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Number of players to show (1-25)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

/**
 * Handle /leaderboard command
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function execute(interaction) {
  await interaction.deferReply();
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

    // Build leaderboard embed with enhanced styling
    const embed = new EmbedBuilder()
      .setColor(0xffd700) // Gold
      .setTitle("🏆 Server Leaderboard")
      .setFooter({
        text: `Total players: ${total} | Use /profile to see your rank`,
        iconURL: interaction.guild.iconURL()
      })
      .setTimestamp();

    // Fetch top 3 users for thumbnail
    if (entries.length > 0) {
      const topUser = await interaction.client.users
        .fetch(entries[0].userId)
        .catch(() => null);
      if (topUser) {
        embed.setThumbnail(topUser.displayAvatarURL());
      }
    }

    // Build formatted leaderboard list
    let description = "";

    for (const entry of entries) {
      const user = await interaction.client.users
        .fetch(entry.userId)
        .catch(() => null);

      // Rank with medal for top 3
      let rankDisplay;
      if (entry.rank === 1) rankDisplay = "🥇";
      else if (entry.rank === 2) rankDisplay = "🥈";
      else if (entry.rank === 3) rankDisplay = "🥉";
      else rankDisplay = `**#${entry.rank}**`;

      // Username (truncate if too long)
      const username = user ? user.username.substring(0, 18) : `User#${entry.userId.slice(-4)}`;

      // Build entry line
      description += `${rankDisplay} **${username}**\n`;
      description += `   💰 ${entry.points} points • ⭐ Level ${entry.level}`;

      if (entry.streak > 1) {
        description += ` • 🔥 ${entry.streak} streak`;
      }

      description += "\n\n";
    }

    embed.setDescription(description);

    // Add special fields for top 3
    if (entries.length >= 3) {
      const fields = [];
      for (let i = 0; i < Math.min(3, entries.length); i++) {
        const entry = entries[i];
        const user = await interaction.client.users
          .fetch(entry.userId)
          .catch(() => null);

        const medals = ["🥇 First Place", "🥈 Second Place", "🥉 Third Place"];
        fields.push({
          name: medals[i],
          value: `**${user?.username || 'Unknown'}**\n${entry.points} points • Level ${entry.level}${entry.streak > 1 ? ` • ${entry.streak} streak` : ''}`,
          inline: true
        });
      }
      embed.addFields(fields);
    }

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
