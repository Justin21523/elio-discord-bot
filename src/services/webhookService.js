/**
 * services/webhooksService.js
 * Webhook management for persona speaking.
 * Creates and caches webhooks, sends messages as personas.
 */

import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";

// Webhook cache: channelId -> webhook
const webhookCache = new Map();

/**
 * Get or create webhook for a channel
 * @param {Object} channel - Discord channel object
 * @param {string} name - Webhook name
 * @returns {Promise<Webhook>}
 */
async function getOrCreateWebhook(channel, name = "Persona Bot") {
  const cacheKey = channel.id;

  // Check cache
  if (webhookCache.has(cacheKey)) {
    const cached = webhookCache.get(cacheKey);
    try {
      // Verify webhook still exists
      await cached.fetch();
      return cached;
    } catch (error) {
      // Webhook was deleted, remove from cache
      webhookCache.delete(cacheKey);
    }
  }

  // Create or find webhook
  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find(
    (wh) => wh.owner.id === channel.client.user.id && wh.name === name
  );

  if (!webhook) {
    webhook = await channel.createWebhook({
      name,
      reason: "Persona system webhook",
    });
  }

  webhookCache.set(cacheKey, webhook);
  return webhook;
}

/**
 * Send message as a persona using webhook
 * @param {Object} params
 * @param {Object} params.client - Discord client
 * @param {string} params.channelId - Target channel ID
 * @param {Object} params.persona - Persona document { name, avatarUrl, ... }
 * @param {string} params.content - Message content
 * @param {Array} [params.embeds] - Optional embeds
 * @param {Array} [params.components] - Optional components
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function personaSay({
  client,
  channelId,
  persona,
  content,
  embeds = [],
  components = [],
}) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Channel not found or not text-based",
        },
      };
    }

    // Get or create webhook
    const webhook = await getOrCreateWebhook(channel);

    // Send message as persona
    const message = await webhook.send({
      content,
      username: persona.name,
      avatarURL: persona.avatarUrl || undefined,
      embeds,
      components,
      allowedMentions: { parse: [] }, // Prevent mentions
    });

    logger.info("[Webhook] Persona spoke", {
      channelId,
      personaName: persona.name,
      messageId: message.id,
    });

    return {
      ok: true,
      data: {
        messageId: message.id,
        webhookId: webhook.id,
      },
    };
  } catch (error) {
    logger.error("[Webhook] personaSay failed", {
      channelId,
      personaName: persona?.name,
      error: error.message,
    });

    // Check for permission errors
    if (error.code === 50013 || error.code === 50001) {
      return {
        ok: false,
        error: {
          code: ErrorCode.DISCORD_API_ERROR,
          message: "Bot lacks permissions to create webhooks or send messages",
          cause: error,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.DISCORD_API_ERROR,
        message: "Failed to send persona message",
        cause: error,
      },
    };
  }
}

/**
 * Clear webhook cache (useful for testing or manual cleanup)
 */
export function clearWebhookCache() {
  webhookCache.clear();
  logger.info("[Webhook] Cache cleared");
}
