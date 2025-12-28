/**
 * commands/profile.js
 * User profile command handler.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { getProfile } from "../services/points.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View a user's profile")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("User to view (defaults to yourself)")
      .setRequired(false)
  );

/**
 * Handle /profile command
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function execute(interaction: any) {
  await interaction.deferReply();
  try {
    const guildId = interaction.guildId;
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const userId = targetUser.id;

    // Fetch profile
    const result: any = await getProfile(String(guildId), userId);

    if (!result.ok) {
      await interaction.editReply({
        content: "❌ Failed to fetch profile. Please try again.",
        ephemeral: true,
      });
      return result;
    }

    const profile = result.data as any;

    // Build profile embed
    const embed = new EmbedBuilder()
      .setColor(0x3498db) // Blue
      .setTitle(`${targetUser.username}'s Profile`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    // Add fields
    embed.addFields(
      { name: "💰 Points", value: `${profile.points}`, inline: true },
      { name: "⭐ Level", value: `${profile.level}`, inline: true },
      {
        name: "🏅 Rank",
        value: profile.rank ? `#${profile.rank}` : "N/A",
        inline: true,
      }
    );

    if (profile.streak > 1) {
      embed.addFields({
        name: "🔥 Streak",
        value: `${profile.streak} wins`,
        inline: true,
      });
    }

    if (profile.nextLevelAt) {
      const pointsNeeded = profile.nextLevelAt - profile.points;
      embed.addFields({
        name: "📈 Next Level",
        value: `${pointsNeeded} more points needed`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: "🌟 Status",
        value: "Max level reached!",
        inline: true,
      });
    }

    if (profile.lastWinAt) {
      embed.addFields({
        name: "🕐 Last Win",
        value: `<t:${Math.floor(
          new Date(profile.lastWinAt).getTime() / 1000
        )}:R>`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    logger.command("/profile success", {
      guildId,
      targetUserId: userId,
      requesterId: interaction.user.id,
    });

    return { ok: true, data: profile };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CMD] /profile failed", {
      guildId: interaction.guildId,
      error: msg,
    });

    await interaction.editReply({
      content: "❌ Something went wrong. Please try again.",
      ephemeral: true,
    });

    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to show profile",
        cause: error,
      },
    };
  }
}
