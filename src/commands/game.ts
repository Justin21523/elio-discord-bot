/**
 * commands/game.js
 * Game command handlers: /game start and button click interactions.
 * Thin handlers - business logic in services.
 */

import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { successEmbed, errorEmbed, infoEmbed } from "../util/replies.js";
import { startGame, handleClick, startDmSession, answerDm, getDmStatus, cancelDm } from "../handlers/gameHandlers.js";

export const data = new SlashCommandBuilder()
  .setName("game")
  .setDescription("Quick reaction games and DM mini-games")
  .addSubcommand((sub) =>
    sub.setName("start").setDescription("Start a quick reaction game")
  )
  .addSubcommand((sub) =>
    sub
      .setName("dm-start")
      .setDescription("Start a DM mini-game with a persona")
      .addStringOption((opt) =>
        opt
          .setName("persona")
          .setDescription("Choose a persona to play with (optional)")
          .setRequired(false)
          .addChoices(
            { name: "Elio", value: "Elio" },
            { name: "Olga", value: "Olga" },
            { name: "Glordon", value: "Glordon" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("dm-answer")
      .setDescription("Answer the current DM game question")
      .addStringOption((opt) =>
        opt
          .setName("answer")
          .setDescription("Your answer")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("dm-status").setDescription("Check your current DM game status")
  )
  .addSubcommand((sub) =>
    sub.setName("dm-cancel").setDescription("Cancel your current DM game")
  );

/**
 * Main game command router
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function execute(interaction: any) {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "start":
      return await handleGameStart(interaction);
    case "dm-start":
      return await handleDmStart(interaction);
    case "dm-answer":
      return await handleDmAnswer(interaction);
    case "dm-status":
      return await handleDmStatus(interaction);
    case "dm-cancel":
      return await handleDmCancel(interaction);
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
async function handleGameStart(interaction: any) {
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
    const gameResult: any = await startGame({
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CMD] /game start failed", {
      guildId: interaction.guildId,
      error: msg,
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
export async function handleGameClick(interaction: any) {
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
    const clickResult: any = await handleClick({
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[INT] Game click failed", {
      customId: interaction.customId,
      userId: interaction.user.id,
      error: msg,
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

/**
 * Handle /game dm-start
 */
async function handleDmStart(interaction: any) {
  try {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const personaName = interaction.options.getString("persona");

    const result: any = await startDmSession({
      userId,
      guildId,
      personaName,
    });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [errorEmbed("DM Game Start Failed", result.error.message)],
      });
      return result;
    }

    const { persona, turn, totalTurns, question } = result.data;

    await interaction.editReply({
      embeds: [
        infoEmbed(
          `🎮 DM Game Started with ${persona}!`,
          `**Question ${turn}/${totalTurns}**\n\n${question}\n\n` +
            `Use \`/game dm-answer\` to answer!\n` +
            `💡 Tip: Answer correctly to earn points!`
        ),
      ],
    });

    logger.command("/game dm-start success", {
      userId,
      guildId,
      persona,
    });

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CMD] /game dm-start failed", {
      userId: interaction.user.id,
      error: msg,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to start DM game",
        cause: error,
      },
    };
  }
}

/**
 * Handle /game dm-answer
 */
async function handleDmAnswer(interaction: any) {
  try {
    const userId = interaction.user.id;
    const answer = interaction.options.getString("answer");

    const result: any = await answerDm({ userId, answer });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [errorEmbed("Answer Failed", result.error.message)],
      });
      return result;
    }

    const { correct, feedback, gameComplete, nextQuestion, turn, totalTurns, currentScore, finalScore, correctAnswers, totalQuestions, perfectGame } = result.data;

    if (gameComplete) {
      // Game finished
      let message = `${feedback}\n\n`;
      message += `🎉 **Game Complete!**\n\n`;
      message += `✅ Correct: ${correctAnswers}/${totalQuestions}\n`;
      message += `🏆 Final Score: **${finalScore} points**`;

      if (perfectGame) {
        message += `\n\n🌟 **PERFECT GAME!** 🌟\nYou got every question right! Bonus applied!`;
      }

      await interaction.editReply({
        embeds: [successEmbed("Game Over", message)],
      });
    } else {
      // Next question
      let message = `${feedback}\n\n`;
      message += `📊 Current Score: **${currentScore} points**\n\n`;
      message += `**Question ${turn}/${totalTurns}**\n\n${nextQuestion}`;

      await interaction.editReply({
        embeds: [
          infoEmbed(
            correct ? "✅ Correct!" : "❌ Incorrect",
            message
          ),
        ],
      });
    }

    logger.command("/game dm-answer success", {
      userId,
      correct,
      gameComplete,
    });

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CMD] /game dm-answer failed", {
      userId: interaction.user.id,
      error: msg,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to process answer",
        cause: error,
      },
    };
  }
}

/**
 * Handle /game dm-status
 */
async function handleDmStatus(interaction: any) {
  try {
    const userId = interaction.user.id;

    const result: any = await getDmStatus(userId);

    if (!result.ok) {
      await interaction.editReply({
        embeds: [infoEmbed("No Active Game", "You don't have an active DM game. Start one with `/game dm-start`!")],
      });
      return result;
    }

    const { session } = result.data;

    const message = `**Persona:** ${session.personaName}\n` +
      `**Progress:** Question ${session.turn}/${session.totalTurns}\n` +
      `**Current Score:** ${session.score} points\n` +
      `**Correct Answers:** ${session.correctAnswers}`;

    await interaction.editReply({
      embeds: [infoEmbed("🎮 DM Game Status", message)],
    });

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CMD] /game dm-status failed", {
      userId: interaction.user.id,
      error: msg,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to get status",
        cause: error,
      },
    };
  }
}

/**
 * Handle /game dm-cancel
 */
async function handleDmCancel(interaction: any) {
  try {
    const userId = interaction.user.id;

    const result: any = await cancelDm(userId);

    if (!result.ok) {
      await interaction.editReply({
        embeds: [infoEmbed("No Active Game", "You don't have an active DM game to cancel.")],
      });
      return result;
    }

    await interaction.editReply({
      embeds: [successEmbed("Game Cancelled", "Your DM game has been cancelled. Start a new one anytime with `/game dm-start`!")],
    });

    logger.command("/game dm-cancel success", { userId });

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[CMD] /game dm-cancel failed", {
      userId: interaction.user.id,
      error: msg,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to cancel game",
        cause: error,
      },
    };
  }
}
