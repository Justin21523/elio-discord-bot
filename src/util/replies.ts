/**
 * util/replies.ts
 * Helper functions for consistent Discord reply formatting.
 * Never exposes stack traces or sensitive data to users.
 */

import { ErrorCodes } from "../config.js";

export type AppError = {
  code?: string;
  message?: string;
};

type SuccessReplyOptions = {
  title?: string;
  description?: string;
  image?: string;
  color?: number;
};

/**
 * Format a friendly error message based on error code
 * @param {Object} error - AppError object with code and message
 * @returns {string} User-friendly error message
 */
export function formatErrorReply(error: AppError): string {
  const code = error.code || ErrorCodes.UNKNOWN;

  const messages: Record<string, string> = {
    [ErrorCodes.BAD_REQUEST]:
      "❌ Invalid request. Please check your input and try again.",
    [ErrorCodes.NOT_FOUND]:
      "🔍 Not found. The requested resource doesn't exist.",
    [ErrorCodes.FORBIDDEN]: "🚫 You don't have permission to do that.",
    [ErrorCodes.RATE_LIMITED]:
      "⏳ Slow down! You're doing that too quickly. Please wait a moment.",
    [ErrorCodes.DB_ERROR]: "💾 Database error. Please try again in a moment.",
    [ErrorCodes.DISCORD_API_ERROR]:
      "🤖 Discord API error. Please try again shortly.",
    [ErrorCodes.AI_MODEL_ERROR]:
      "🧠 AI service unavailable. Please try again later.",
    [ErrorCodes.AI_TIMEOUT]: "⏱️ AI request timed out. Please try again.",
    [ErrorCodes.DEPENDENCY_UNAVAILABLE]:
      "🔌 External service unavailable. Please try again later.",
    [ErrorCodes.SCHEDULE_ERROR]: "📅 Scheduling error. Please try again.",
    [ErrorCodes.RAG_EMPTY]: "📚 No relevant information found.",
    [ErrorCodes.VALIDATION_FAILED]:
      "✏️ Validation failed. Please check your input.",
    [ErrorCodes.UNKNOWN]: "❓ Something went wrong. Please try again.",
  };

  const friendlyMessage =
    messages[code] ??
    messages[ErrorCodes.UNKNOWN] ??
    "❓ Something went wrong. Please try again.";

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
export function successEmbed(
  title: string,
  description: string,
  options: Record<string, unknown> = {}
): Record<string, unknown> {
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
export function infoEmbed(
  title: string,
  description: string,
  options: Record<string, unknown> = {}
): Record<string, unknown> {
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
export function errorEmbed(
  title: string,
  description: string,
  options: Record<string, unknown> = {}
): Record<string, unknown> {
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
export function formatErrorEmbed(
  error: AppError | null | undefined,
  title = "Something went wrong"
): { embeds: Array<{ title: string; description: string; color: number }>; ephemeral: boolean } {
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
export async function safeEdit(
  interaction: any,
  payload: any
): Promise<unknown | void> {
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
export async function ensureDeferred(
  interaction: any,
  ephemeral = false
): Promise<void> {
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
export async function sendErrorReply(
  interaction: any,
  errorOrMessage: unknown
): Promise<void> {
  let payload;

  if (typeof errorOrMessage === 'string') {
    payload = { content: `❌ ${errorOrMessage}`, ephemeral: true };
  } else if (errorOrMessage && typeof errorOrMessage === 'object') {
    const errorMessage = formatErrorReply(errorOrMessage as AppError);
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
export async function sendSuccessReply(
  interaction: any,
  messageOrOptions: unknown
): Promise<void> {
  let payload;

  if (typeof messageOrOptions === 'string') {
    payload = { content: `✅ ${messageOrOptions}` };
  } else if (messageOrOptions && typeof messageOrOptions === 'object') {
    // Handle embed format
    const { title, description, image, color = 0x00ff00 } =
      messageOrOptions as SuccessReplyOptions;

    const embed: {
      color: number;
      title: string;
      description: string;
      timestamp: string;
      image?: { url: string };
    } = {
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
    if (error instanceof Error) {
      console.error('[ERR] sendSuccessReply failed:', error.message);
    } else {
      console.error('[ERR] sendSuccessReply failed:', String(error));
    }
    // Try followUp as fallback
    try {
      await interaction.followUp({ ...payload, ephemeral: true });
    } catch {
      // If even followUp fails, give up silently
    }
  }
}
