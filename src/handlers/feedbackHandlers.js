/**
 * feedbackHandlers.js
 * Handlers for response feedback buttons (thumbs up/down)
 * Used for continuous learning and model improvement
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { interactionLogger } from "../services/interactionLogger.js";
import { logger } from "../util/logger.js";

// Feedback button custom ID prefixes
export const FEEDBACK_PREFIX = {
  THUMBS_UP: "feedback_up_",
  THUMBS_DOWN: "feedback_down_",
};

/**
 * Create feedback buttons row for a message
 * @param {string} interactionId - MongoDB ObjectId as string for the interaction
 * @returns {ActionRowBuilder} Discord action row with feedback buttons
 */
export function createFeedbackButtons(interactionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${FEEDBACK_PREFIX.THUMBS_UP}${interactionId}`)
      .setEmoji("👍")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${FEEDBACK_PREFIX.THUMBS_DOWN}${interactionId}`)
      .setEmoji("👎")
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Handle thumbs up feedback
 */
export async function handleThumbsUp(interaction) {
  try {
    const interactionId = interaction.customId.replace(FEEDBACK_PREFIX.THUMBS_UP, "");

    const result = await interactionLogger.recordFeedbackById(interactionId, {
      thumbsUp: true,
      thumbsDown: false,
    });

    if (result.ok) {
      // Update button to show feedback received
      await interaction.update({
        components: [createDisabledFeedbackRow("up")],
      });
      logger.debug("[FEEDBACK] Thumbs up recorded", { interactionId });
    } else {
      await interaction.reply({
        content: "Thanks for your feedback!",
        ephemeral: true,
      });
    }
  } catch (error) {
    logger.error("[FEEDBACK] Thumbs up error", { error: error.message });
    await interaction.reply({
      content: "Thanks for your feedback!",
      ephemeral: true,
    });
  }
}

/**
 * Handle thumbs down feedback
 */
export async function handleThumbsDown(interaction) {
  try {
    const interactionId = interaction.customId.replace(FEEDBACK_PREFIX.THUMBS_DOWN, "");

    const result = await interactionLogger.recordFeedbackById(interactionId, {
      thumbsUp: false,
      thumbsDown: true,
    });

    if (result.ok) {
      // Update button to show feedback received
      await interaction.update({
        components: [createDisabledFeedbackRow("down")],
      });
      logger.debug("[FEEDBACK] Thumbs down recorded", { interactionId });
    } else {
      await interaction.reply({
        content: "Thanks for your feedback! We'll work on improving.",
        ephemeral: true,
      });
    }
  } catch (error) {
    logger.error("[FEEDBACK] Thumbs down error", { error: error.message });
    await interaction.reply({
      content: "Thanks for your feedback!",
      ephemeral: true,
    });
  }
}

/**
 * Create disabled feedback buttons after user has voted
 */
function createDisabledFeedbackRow(selected) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("feedback_done_up")
      .setEmoji(selected === "up" ? "✅" : "👍")
      .setStyle(selected === "up" ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("feedback_done_down")
      .setEmoji(selected === "down" ? "❌" : "👎")
      .setStyle(selected === "down" ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

/**
 * Check if a custom ID is a feedback button
 */
export function isFeedbackButton(customId) {
  return (
    customId.startsWith(FEEDBACK_PREFIX.THUMBS_UP) ||
    customId.startsWith(FEEDBACK_PREFIX.THUMBS_DOWN)
  );
}

/**
 * Route feedback button interaction to appropriate handler
 */
export async function handleFeedbackButton(interaction) {
  const { customId } = interaction;

  if (customId.startsWith(FEEDBACK_PREFIX.THUMBS_UP)) {
    return handleThumbsUp(interaction);
  }

  if (customId.startsWith(FEEDBACK_PREFIX.THUMBS_DOWN)) {
    return handleThumbsDown(interaction);
  }
}
