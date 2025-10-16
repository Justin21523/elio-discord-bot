/**
 * commands/game.js
 * Game command handlers: /game start and button click interactions.
 * Thin handlers - business logic in services.
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { successEmbed, errorEmbed, infoEmbed } from "../util/replies.js";
import { startGame, handleClick } from "../services/gameService.js";

/**
 * Main game command router
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export default async function handleGame(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "start":
      return await handleGameStart(interaction);
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
 * Handle /game start
 */
async function handleGameStart(interaction) {
  try {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    // Create game button
    const button = new ButtonBuilder()
      .setCustomId("game_click_pending") // Will be updated after message is sent
      .setLabel("🎯 Click to Win!")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    // Send game message
    const message = await interaction.editReply({
      embeds: [
        infoEmbed(
          "Quick React Game",
          "**First click wins!**\n" +
            "Be the first to press the button to earn points.\n\n" +
            "🏆 Winner gets **10 points**\n" +
            "⚡ Cooldown: 30 seconds between wins"
        ),
      ],
      components: [row],
    });

    // Start game in database
    const gameResult = await startGame({
      guildId,
      channelId,
      messageId: message.id,
    });

    if (!gameResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Game Start Failed",
            "Could not start the game. Please try again."
          ),
        ],
        components: [],
      });
      return gameResult;
    }

    const gameId = gameResult.data.gameId;

    // Update button with actual game ID
    button.setCustomId(`game_click_${gameId}`);
    const updatedRow = new ActionRowBuilder().addComponents(button);

    await interaction.editReply({
      embeds: message.embeds,
      components: [updatedRow],
    });

    logger.command("/game start success", {
      guildId,
      channelId,
      gameId,
      messageId: message.id,
    });

    return { ok: true, data: { gameId, messageId: message.id } };
  } catch (error) {
    logger.error("[CMD] /game start failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to start game",
        cause: error,
      },
    };
  }
}

/**
 * Handle game button click
 * @param {ButtonInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function handleGameClick(interaction) {
  try {
    const customId = interaction.customId;
    const gameId = customId.replace("game_click_", "");
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    if (gameId === "pending") {
      await interaction.reply({
        content: "⚠️ Game is still loading, please wait a moment.",
        ephemeral: true,
      });
      return { ok: false };
    }

    // Process click
    const clickResult = await handleClick({
      gameId,
      userId,
      guildId,
    });

    if (!clickResult.ok) {
      // User was late or on cooldown
      await interaction.reply({
        content: clickResult.error.message,
        ephemeral: true,
      });
      return clickResult;
    }

    // User won!
    const pointsData = clickResult.data.points;

    let winMessage = `🎉 **${interaction.user.username}** wins!\n\n`;
    winMessage += `✨ **+${pointsData.awarded} points**\n`;
    winMessage += `📊 Total: **${pointsData.points} points** (Level ${pointsData.level})`;

    if (pointsData.leveledUp) {
      winMessage += `\n\n🎊 **LEVEL UP!** You reached Level ${pointsData.level}!`;
    }

    // Disable button
    const disabledButton = ButtonBuilder.from(interaction.component)
      .setDisabled(true)
      .setLabel("Game Over")
      .setStyle(ButtonStyle.Secondary);

    const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

    // Update original message
    await interaction.update({
      embeds: [successEmbed("Winner!", winMessage)],
      components: [disabledRow],
    });

    logger.interaction("Game click - Winner", {
      gameId,
      userId,
      guildId,
      points: pointsData.awarded,
    });

    return { ok: true, data: clickResult.data };
  } catch (error) {
    logger.error("[INT] Game click failed", {
      customId: interaction.customId,
      userId: interaction.user.id,
      error: error.message,
    });

    try {
      await interaction.reply({
        content: "❌ Something went wrong. Please try again.",
        ephemeral: true,
      });
    } catch (replyError) {
      // Ignore reply errors
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to process click",
        cause: error,
      },
    };
  }
}
