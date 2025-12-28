/**
 * handlers/minigameHandlers.js
 * Handle button interactions for mini-games
 *
 * CRITICAL: Discord requires acknowledgement within 3 seconds.
 * We MUST call deferUpdate() immediately before any game logic.
 */

import GameManager from "../services/minigames/GameManager.js";
import { logger } from "../util/logger.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Handle button interaction from mini-game
 */
export async function handleMinigameButton(interaction: any) {
  const customId = interaction.customId;

  // Special case: recommended start buttons use prefix "minigame_start_<gameType>"
  // These need a visible reply, not a deferred update
  if (customId.startsWith("minigame_start_")) {
    return handleRecommendedStart(interaction);
  }

  // CRITICAL: Acknowledge interaction IMMEDIATELY (within 3 seconds)
  // This prevents "The application did not respond" errors
  try {
    await interaction.deferUpdate();
  } catch (deferErr) {
    // If defer fails, interaction likely already timed out or was handled
    logger.warn("[MINIGAME_BUTTON] deferUpdate failed (interaction may have timed out)", {
      customId,
      error: getErrorMessage(deferErr),
    });
    return;
  }

  try {
    // Parse button customId to extract game info
    // Format: {gameType}_{action}_{sessionId}_{data}
    const parts = customId.split("_");

    if (parts.length < 3) {
      await sendFollowUpError(interaction, "Invalid game button format.");
      return;
    }

    const gameType = parts[0]; // trivia, adventure, reaction, battle, etc.
    const action = parts[1]; // answer, choice, click, skill
    const sessionId = parts[2];
    const dataIndex = parts[3]; // optional - answer index, choice index, etc.

    // Get game from channel
    const game = GameManager.getGame(interaction.channel.id);

    if (!game) {
      await sendFollowUpError(interaction, "This game has ended or is no longer active.");
      return;
    }

    // Verify session matches
    if (game.sessionId !== sessionId) {
      await sendFollowUpError(
        interaction,
        "This button is from an old game session. Start a new game with `/minigame start`."
      );
      return;
    }

    // Handle based on game type and action
    const result = await dispatchGameAction(game, gameType, action, dataIndex, interaction.user.id);

    if (!result) {
      await sendFollowUpError(interaction, "Unknown game action.");
      return;
    }

    if (!result.ok) {
      await sendFollowUpError(interaction, result.error || "Action failed.");
    }

    logger.debug("[MINIGAME_BUTTON] Handled", {
      gameType,
      action,
      userId: interaction.user.id,
      success: result?.ok ?? false,
    });
  } catch (error) {
    logger.error("[MINIGAME_BUTTON] Error:", {
      customId,
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    await sendFollowUpError(interaction, "An error occurred processing your action.");
  }
}

/**
 * Handle "minigame_start_<gameType>" buttons from recommendations
 */
async function handleRecommendedStart(interaction: any) {
  const customId = interaction.customId;
  const gameType = customId.replace("minigame_start_", "");

  try {
    // Reply first (ephemeral acknowledgement)
    await interaction.reply({
      embeds: [
        {
          title: "🎮 Launching Game",
          description: `Starting **${gameType}**...`,
          color: 0x2ecc71,
        },
      ],
      ephemeral: true,
    });

    // Start the game
    const result = await GameManager.startGame(
      gameType,
      interaction.channel,
      interaction.user,
      { guildId: interaction.guildId }
    );

    if (!result.ok) {
      await interaction.followUp({
        content: `❌ ${result.error}`,
        ephemeral: true,
      });
    }
  } catch (error) {
    logger.error("[MINIGAME_BUTTON] handleRecommendedStart error:", {
      gameType,
      error: getErrorMessage(error),
    });

    try {
      if (interaction.replied) {
        await interaction.followUp({
          content: "❌ Failed to start game.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "❌ Failed to start game.",
          ephemeral: true,
        });
      }
    } catch {
      // Ignore reply errors
    }
  }
}

/**
 * Dispatch action to the appropriate game handler
 *
 * IMPORTANT: Action names MUST match what the game's handleAction() expects:
 * - HMMSequenceGame expects "next" (not "predict")
 * - PMIAssociationGame expects "pmi" (not "answer")
 * - KeywordPMIGame expects "pmichoice" (not "answer")
 * - IRDocHuntGame expects "docquery"/"docanswer" (not "select")
 */
async function dispatchGameAction(
  game: any,
  gameType: string,
  action: string,
  dataIndex: string | undefined,
  userId: string
) {
  // Map of gameType_action -> handler function
  const handlers: Record<string, () => any> = {
    // Trivia
    trivia_answer: () => {
      const answerIndex = parseInt(dataIndex ?? "0", 10);
      return game.handleAction(userId, "answer", { answerIndex });
    },

    // Adventure
    adventure_choice: () => {
      const choiceIndex = parseInt(dataIndex ?? "0", 10);
      return game.handleAction(userId, "choice", { choiceIndex });
    },

    // Reaction
    reaction_click: () => game.handleAction(userId, "click", {}),

    // Dice Roll
    "dice-roll_roll": () => game.handleAction(userId, "roll", {}),

    // Battle
    battle_skill: () => game.handleAction(userId, "skill", { skillId: dataIndex }),

    // Guess Number
    guess_guess: () => {
      const guessValue = parseInt(dataIndex ?? "0", 10);
      return game.handleAction(userId, "guess", { value: guessValue });
    },

    // N-gram Story
    "ngram-story_narrate": () => game.handleAction(userId, "narrate", { keyword: dataIndex || "" }),
    "ngram-story_word": () => game.handleAction(userId, "word", { word: dataIndex || "" }),

    // PMI Association - expects "pmi" action with { guess: string }
    pmi_answer: () => {
      return game.handleAction(userId, "pmi", { guess: dataIndex || "" });
    },

    // Keyword PMI - expects "pmichoice" action with { option: number }
    "keyword-pmi_answer": () => {
      const optionNum = parseInt(dataIndex ?? "0", 10) + 1; // Button index is 0-based, game expects 1-based
      return game.handleAction(userId, "pmichoice", { option: optionNum });
    },

    // IR Clue - expects "clue" or "answer" actions
    "ir-clue_answer": () => {
      return game.handleAction(userId, "answer", { text: dataIndex || "" });
    },
    "ir-clue_clue": () => {
      return game.handleAction(userId, "clue", { query: dataIndex || "" });
    },

    // Doc Hunt - expects "docquery" or "docanswer" actions
    "doc-hunt_select": () => {
      return game.handleAction(userId, "docquery", { query: dataIndex || "" });
    },
    "doc-hunt_answer": () => {
      return game.handleAction(userId, "docanswer", { text: dataIndex || "" });
    },

    // HMM Sequence - expects "next" action (not "predict")
    hmm_predict: () => game.handleAction(userId, "next", {}),
    hmm_next: () => game.handleAction(userId, "next", {}),
  };

  const key = `${gameType}_${action}`;
  const handler = handlers[key];

  if (handler) {
    return handler();
  }

  // Fallback: try generic handleAction
  logger.warn("[MINIGAME_BUTTON] Using fallback handler", { gameType, action });
  return game.handleAction(userId, action, { data: dataIndex });
}

/**
 * Send an ephemeral error follow-up (after deferUpdate)
 */
async function sendFollowUpError(interaction: any, message: string) {
  try {
    await interaction.followUp({
      content: `❌ ${message}`,
      ephemeral: true,
    });
  } catch (err) {
    logger.warn("[MINIGAME_BUTTON] followUp failed", { error: getErrorMessage(err) });
  }
}

export default {
  handleMinigameButton,
};
