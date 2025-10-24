/**
 * util/replies.js
 * Helper functions for consistent Discord reply formatting.
 * Never exposes stack traces or sensitive data to users.
 */

import { ErrorCodes as ErrorCode } from "../config.js";

/**
 * Format a friendly error message based on error code
 * @param {Object} error - AppError object with code and message
 * @returns {string} User-friendly error message
 */
export function formatErrorReply(error) {
  const code = error.code || ErrorCode.UNKNOWN;

  const messages = {
    [ErrorCode.BAD_REQUEST]:
      "❌ Invalid request. Please check your input and try again.",
    [ErrorCode.NOT_FOUND]:
      "🔍 Not found. The requested resource doesn't exist.",
    [ErrorCode.FORBIDDEN]: "🚫 You don't have permission to do that.",
    [ErrorCode.RATE_LIMITED]:
      "⏳ Slow down! You're doing that too quickly. Please wait a moment.",
    [ErrorCode.DB_ERROR]: "💾 Database error. Please try again in a moment.",
    [ErrorCode.DISCORD_API_ERROR]:
      "🤖 Discord API error. Please try again shortly.",
    [ErrorCode.AI_MODEL_ERROR]:
      "🧠 AI service unavailable. Please try again later.",
    [ErrorCode.AI_TIMEOUT]: "⏱️ AI request timed out. Please try again.",
    [ErrorCode.DEPENDENCY_UNAVAILABLE]:
      "🔌 External service unavailable. Please try again later.",
    [ErrorCode.SCHEDULE_ERROR]: "📅 Scheduling error. Please try again.",
    [ErrorCode.RAG_EMPTY]: "📚 No relevant information found.",
    [ErrorCode.VALIDATION_FAILED]:
      "✏️ Validation failed. Please check your input.",
    [ErrorCode.UNKNOWN]: "❓ Something went wrong. Please try again.",
  };

  const friendlyMessage = messages[code] || messages[ErrorCode.UNKNOWN];

  // Optionally append the error message if it's user-safe
  if (
    error.message &&
    !error.message.includes("Error:") &&
    !error.message.includes("stack")
  ) {
    return `${friendlyMessage}\n*${error.message}*`;
  }

  return friendlyMessage;
}

/**
 * Create a success embed
 * @param {string} title
 * @param {string} description
 * @param {Object} options - Additional embed options
 * @returns {Object} Discord embed object
 */
export function successEmbed(title, description, options = {}) {
  return {
    color: 0x00ff00, // Green
    title: `✅ ${title}`,
    description,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Create an info embed
 * @param {string} title
 * @param {string} description
 * @param {Object} options - Additional embed options
 * @returns {Object} Discord embed object
 */
export function infoEmbed(title, description, options = {}) {
  return {
    color: 0x3498db, // Blue
    title: `ℹ️ ${title}`,
    description,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Create an error embed
 * @param {string} title
 * @param {string} description
 * @param {Object} options - Additional embed options
 * @returns {Object} Discord embed object
 */
export function errorEmbed(title, description, options = {}) {
  return {
    color: 0xff0000, // Red
    title: `❌ ${title}`,
    description,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Formats an ephemeral error reply payload for Discord.
 * Keeps ErrorCode visible for debugging while being friendly.
 */
export function formatErrorEmbed(error, title = "Something went wrong") {
  const code = error?.code || "UNKNOWN";
  const msg = error?.message || "Unexpected error";
  return {
    embeds: [
      {
        title,
        description: `**ErrorCode:** \`${code}\`\n${msg}`,
        color: 0xff5555,
      },
    ],
    ephemeral: true,
  };
}

/**
 * Quick helper to wrap discord.js interaction error flow.
 */
export async function safeEdit(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch {
    // swallow discord edit race
  }
}

/**
 * Ensure this interaction is deferred exactly once.
 * Safe to call multiple times in the same handler.
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {boolean} ephemeral
 */
export async function ensureDeferred(interaction, ephemeral = false) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  } catch {
    // ignore; if already replied/deferred, discord.js may throw
  }
}

/**
 * Send an error reply to an interaction
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {Object|string} errorOrMessage - Error object or string message
 */
export async function sendErrorReply(interaction, errorOrMessage) {
  let payload;

  if (typeof errorOrMessage === 'string') {
    payload = { content: `❌ ${errorOrMessage}`, ephemeral: true };
  } else if (errorOrMessage && typeof errorOrMessage === 'object') {
    const errorMessage = formatErrorReply(errorOrMessage);
    payload = { content: errorMessage, ephemeral: true };
  } else {
    payload = { content: '❌ An error occurred', ephemeral: true };
  }

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // Ignore Discord API errors
  }
}

/**
 * Send a success reply to an interaction
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {Object|string} messageOrOptions - String message or options object with title/description/image
 */
export async function sendSuccessReply(interaction, messageOrOptions) {
  let payload;

  if (typeof messageOrOptions === 'string') {
    payload = { content: `✅ ${messageOrOptions}` };
  } else if (messageOrOptions && typeof messageOrOptions === 'object') {
    // Handle embed format
    const { title, description, image, color = 0x00ff00 } = messageOrOptions;

    const embed = {
      color,
      title: title || '✅ Success',
      description: description || '',
      timestamp: new Date().toISOString(),
    };

    if (image) {
      embed.image = { url: image };
    }

    payload = { embeds: [embed] };
  } else {
    payload = { content: '✅ Success' };
  }

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    // Log Discord API errors for debugging
    console.error('[ERR] sendSuccessReply failed:', error.message);
    // Try followUp as fallback
    try {
      await interaction.followUp({ ...payload, ephemeral: true });
    } catch {
      // If even followUp fails, give up silently
    }
  }
}
