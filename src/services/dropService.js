/**
 * services/dropService.js
 * Drop orchestration service with retry/backoff and failure notifications.
 */

import { pickRandom } from "./mediaRepo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { incCounter } from "../util/metrics.js";

/**
 * Execute a drop (post media to channel)
 * Includes retry logic with exponential backoff
 * @param {Object} params
 * @param {Object} params.client - Discord client
 * @param {string} params.channelId - Target channel ID
 * @param {string} params.guildId - Guild ID for context
 * @param {boolean} [params.nsfwAllowed] - Whether NSFW is allowed (default: check channel)
 * @param {string[]} [params.tags] - Optional tag filters
 * @param {number} [params.maxRetries] - Max retry attempts (default: 3)
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function executeDrop({
  client,
  channelId,
  guildId,
  nsfwAllowed = null,
  tags = null,
  maxRetries = 3,
}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Fetch channel
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        return {
          ok: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: "Channel not found or bot lacks access",
          },
        };
      }

      // Determine NSFW allowance if not explicitly set
      const allowNsfw =
        nsfwAllowed !== null ? nsfwAllowed : channel.nsfw || false;

      // Pick random media
      const mediaResult = await pickRandom({
        nsfwAllowed: allowNsfw,
        tags,
        guildId,
      });

      if (!mediaResult.ok) {
        return mediaResult; // Media pool empty or filtered out
      }

      const media = mediaResult.data;

      // Send to channel
      const message = await channel.send({
        content:
          media.tags && media.tags.length > 0
            ? `🎁 **Drop!** #${media.tags.join(" #")}`
            : "🎁 **Drop!**",
        files: [{ attachment: media.url }],
      });

      logger.info("[Drop] Successfully executed", {
        guildId,
        channelId,
        mediaId: media._id.toString(),
        messageId: message.id,
        attempt,
      });

      incCounter("media_posts_total", { source: "drop" }, 1);

      return {
        ok: true,
        data: {
          messageId: message.id,
          mediaId: media._id.toString(),
          type: media.type,
          attempt,
        },
      };
    } catch (error) {
      lastError = error;

      logger.warn("[Drop] Attempt failed", {
        guildId,
        channelId,
        attempt,
        maxRetries,
        error: error.message,
      });

      // Don't retry on certain errors
      if (error.code === 50013 || error.code === 50001) {
        // Missing Permissions or Missing Access
        return {
          ok: false,
          error: {
            code: ErrorCode.DISCORD_API_ERROR,
            message: "Bot lacks permissions to post in this channel",
            cause: error,
          },
        };
      }

      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt seconds
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
        logger.info("[Drop] Retrying after backoff", {
          guildId,
          channelId,
          backoffMs,
          nextAttempt: attempt + 1,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries exhausted
  logger.error("[Drop] All retries exhausted", {
    guildId,
    channelId,
    maxRetries,
    error: lastError?.message,
  });

  return {
    ok: false,
    error: {
      code: ErrorCode.DISCORD_API_ERROR,
      message: "Failed to execute drop after retries",
      cause: lastError,
      details: { maxRetries },
    },
  };
}

/**
 * Send failure notification to a fallback channel or guild owner
 * @param {Object} params
 * @param {Object} params.client - Discord client
 * @param {string} params.guildId - Guild ID
 * @param {string} params.channelId - Failed channel ID
 * @param {Object} params.error - Error object
 */
export async function notifyDropFailure({ client, guildId, channelId, error }) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    // Try to find a suitable notification channel
    let notificationChannel = null;

    // Try system channel
    if (guild.systemChannel) {
      notificationChannel = guild.systemChannel;
    } else {
      // Find first text channel bot can send to
      const channels = await guild.channels.fetch();
      for (const [, channel] of channels) {
        if (
          channel.isTextBased() &&
          channel.permissionsFor(guild.members.me).has("SendMessages")
        ) {
          notificationChannel = channel;
          break;
        }
      }
    }

    if (notificationChannel) {
      await notificationChannel.send({
        content:
          `⚠️ **Drop Failed**\n` +
          `Failed to post media drop in <#${channelId}>.\n` +
          `Error: ${error.message}\n` +
          `Please check channel permissions or use \`/drop set\` to reconfigure.`,
      });

      logger.info("[Drop] Failure notification sent", {
        guildId,
        notificationChannelId: notificationChannel.id,
      });
    }
  } catch (notifyError) {
    logger.warn("[Drop] Failed to send failure notification", {
      guildId,
      error: notifyError.message,
    });
  }
}
