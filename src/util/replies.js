/**
 * util/replies.js
 * Helper functions for consistent Discord reply formatting.
 * Never exposes stack traces or sensitive data to users.
 */

import { ErrorCode } from "../config.js";

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
