/**
 * handlers/minigameHandlers.js
 * Handle button interactions for mini-games
 */

import GameManager from "../services/minigames/GameManager.js";
import { logger } from "../util/logger.js";

/**
 * Handle button interaction from mini-game
 */
export async function handleMinigameButton(interaction) {
  try {
    const customId = interaction.customId;

    // Parse button customId to extract game info
    // Format: {gameType}_{action}_{sessionId}_{data}
    const parts = customId.split("_");

    // Special case: recommended start buttons use prefix "minigame_start_<gameType>"
    if (customId.startsWith("minigame_start_")) {
      const gameType = customId.replace("minigame_start_", "");
      // Reuse minigame start with defaults
      await interaction.reply({
        embeds: [
          {
            title: "🎮 Launching Recommended Game",
            description: `Starting **${gameType}** ...`,
            color: 0x2ecc71,
          },
        ],
        ephemeral: true,
      });
      const { startGame } = await import("../services/minigames/GameManager.js");
      const result = await startGame(gameType, interaction.channel, interaction.user, {
        guildId: interaction.guildId,
      });
      if (!result.ok) {
        await interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
      } else {
        await interaction.followUp({
          embeds: [
            {
              title: "✅ Game Started",
              description: `Check the channel for **${gameType}**.`,
              color: 0x2ecc71,
            },
          ],
          ephemeral: true,
        });
      }
      return;
    }

    if (parts.length < 3) {
      await interaction.reply({
        content: "Invalid game button",
        ephemeral: true,
      });
      return;
    }

    const gameType = parts[0]; // trivia, adventure, reaction, battle, etc.
    const action = parts[1]; // answer, choice, click, skill
    const sessionId = parts[2];
    const dataIndex = parts[3]; // optional - answer index, choice index, etc.

    // Get game from channel
    const game = GameManager.getGame(interaction.channel.id);

    if (!game) {
      await interaction.reply({
        content: "❌ This game has ended or is no longer active.",
        ephemeral: true,
      });
      return;
    }

    // Verify session matches
    if (game.sessionId !== sessionId) {
      await interaction.reply({
        content: "❌ This button is from an old game session.",
        ephemeral: true,
      });
      return;
    }

    // Handle based on game type
    let result;

    if (gameType === "trivia" && action === "answer") {
      const answerIndex = parseInt(dataIndex, 10);
      result = await game.handleAction(interaction.user.id, "answer", {
        answerIndex,
      });
    } else if (gameType === "adventure" && action === "choice") {
      const choiceIndex = parseInt(dataIndex, 10);
      result = await game.handleAction(interaction.user.id, "choice", {
        choiceIndex,
      });
    } else if (gameType === "reaction" && action === "click") {
      result = await game.handleAction(interaction.user.id, "click", {});
    } else if (gameType === "dice-roll" && action === "roll") {
      result = await game.handleAction(interaction.user.id, "roll", {});
    } else if (gameType === "adventure" && action === "choice") {
      const choiceIndex = parseInt(dataIndex, 10);
      result = await game.handleAction(interaction.user.id, "choice", { choiceIndex });
    } else if (gameType === "battle" && action === "skill") {
      const skillId = dataIndex;
      result = await game.handleAction(interaction.user.id, "skill", { skillId });
    } else if (gameType === "ngram-story" && action === "narrate") {
      result = await game.handleAction(interaction.user.id, "narrate", { keyword: dataIndex || "" });
    } else {
      await interaction.reply({
        content: "❌ Unknown game action",
        ephemeral: true,
      });
      return;
    }

    // Respond to interaction
    if (result.ok) {
      await interaction.deferUpdate().catch(() => {});
    } else {
      await interaction.reply({
        content: `❌ ${result.error}`,
        ephemeral: true,
      }).catch(() => {
        // Ignore if can't reply
      });
    }

    logger.debug("[MINIGAME_BUTTON] Handled", {
      gameType,
      action,
      userId: interaction.user.id,
      result: result.ok,
    });
  } catch (error) {
    logger.error("[MINIGAME_BUTTON] Error:", {
      error: error.message,
      stack: error.stack,
    });

    try {
      await interaction.reply({
        content: "❌ An error occurred processing your action.",
        ephemeral: true,
      });
    } catch (replyError) {
      // Ignore reply errors
    }
  }
}

export default {
  handleMinigameButton,
};
