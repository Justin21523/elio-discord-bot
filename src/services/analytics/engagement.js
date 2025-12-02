/**
 * Engagement signal tracking for implicit feedback learning.
 * Captures user interactions (replies, reactions, conversation continuation)
 * to train the Thompson Sampling Bandit for strategy selection.
 */
import { getCollection } from "../../db/mongo.js";
import { logger } from "../../util/logger.js";

// Signal weights for reward computation
const SIGNAL_WEIGHTS = {
  reply: 1.0, // User replied to bot message
  reaction_positive: 0.5, // 👍 ❤️ 😊 🎉 ✅
  reaction_negative: -0.5, // 👎 😢 ❌
  conversation_continue: 0.3, // User sent another message within 5 min
  ignore: -0.1, // No interaction after timeout
};

// Positive and negative emoji sets
const POSITIVE_EMOJIS = new Set([
  "👍",
  "❤️",
  "😊",
  "🎉",
  "✅",
  "💯",
  "🙌",
  "😍",
  "🥰",
  "❤",
  "💜",
  "💙",
  "💚",
  "🧡",
  "💛",
  "⭐",
  "🌟",
  "✨",
  "👏",
  "🔥",
]);

const NEGATIVE_EMOJIS = new Set(["👎", "😢", "❌", "😠", "😡", "💔", "🙁", "😕", "😞"]);

/**
 * Track an engagement signal for a bot message.
 *
 * @param {string} botMessageId - The bot message ID
 * @param {string} event - Event type (reply, reaction_positive, etc.)
 * @param {number} value - Signal value (default: 1)
 * @param {object} meta - Additional metadata
 */
export async function trackEngagement(botMessageId, event, value = 1, meta = {}) {
  if (!botMessageId || !event) return;

  try {
    const col = getCollection("engagement_signals");

    await col.updateOne(
      { messageId: botMessageId },
      {
        $push: {
          signals: {
            event,
            value,
            ts: new Date(),
            ...meta,
          },
        },
        $setOnInsert: {
          messageId: botMessageId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.debug("[ENGAGEMENT] Tracked signal", { botMessageId, event, value });
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to track", { error: error.message });
  }
}

/**
 * Store metadata about a bot response for later reward attribution.
 *
 * @param {string} messageId - Bot message ID
 * @param {string} strategy - Strategy used (tfidf_markov, template_fill, etc.)
 * @param {string} persona - Persona name
 * @param {string} userId - Target user ID
 * @param {string} channelId - Channel ID
 * @param {object} extra - Additional metadata
 */
export async function storeResponseMetadata(
  messageId,
  strategy,
  persona,
  userId,
  channelId,
  extra = {}
) {
  if (!messageId || !strategy) return;

  try {
    const col = getCollection("response_metadata");

    await col.insertOne({
      messageId,
      strategy,
      persona: persona || null,
      userId: userId || null,
      channelId: channelId || null,
      createdAt: new Date(),
      ...extra,
    });

    logger.debug("[ENGAGEMENT] Stored response metadata", { messageId, strategy, persona });
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to store metadata", { error: error.message });
  }
}

/**
 * Get response metadata for a bot message.
 *
 * @param {string} messageId - Bot message ID
 * @returns {object|null} Response metadata
 */
export async function getResponseMetadata(messageId) {
  if (!messageId) return null;

  try {
    const col = getCollection("response_metadata");
    return await col.findOne({ messageId });
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to get metadata", { error: error.message });
    return null;
  }
}

/**
 * Compute reward score for a bot message based on accumulated signals.
 *
 * @param {string} botMessageId - Bot message ID
 * @returns {number} Reward value in [0, 1]
 */
export async function computeReward(botMessageId) {
  try {
    const col = getCollection("engagement_signals");
    const doc = await col.findOne({ messageId: botMessageId });

    if (!doc || !doc.signals || doc.signals.length === 0) {
      return 0.5; // Neutral if no signals
    }

    let reward = 0;
    for (const signal of doc.signals) {
      const weight = SIGNAL_WEIGHTS[signal.event] || 0;
      reward += weight * (signal.value || 1);
    }

    // Normalize to [0, 1] range
    // Map from approx [-1, 2] to [0, 1]
    return Math.max(0, Math.min(1, (reward + 1) / 3));
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to compute reward", { error: error.message });
    return 0.5; // Neutral on error
  }
}

/**
 * Get pending messages needing reward computation.
 * Returns messages older than timeout (default: 10 min) with signals.
 *
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10 min)
 * @returns {Array} Pending documents
 */
export async function getPendingRewards(timeoutMs = 10 * 60 * 1000) {
  try {
    const col = getCollection("engagement_signals");
    const cutoff = new Date(Date.now() - timeoutMs);

    return await col
      .find({
        createdAt: { $lt: cutoff },
        rewardComputed: { $ne: true },
      })
      .toArray();
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to get pending rewards", { error: error.message });
    return [];
  }
}

/**
 * Mark reward as computed and record final values.
 *
 * @param {string} botMessageId - Bot message ID
 * @param {number} reward - Final computed reward
 * @param {string} strategy - Strategy that was used
 */
export async function finalizeReward(botMessageId, reward, strategy) {
  try {
    const col = getCollection("engagement_signals");

    await col.updateOne(
      { messageId: botMessageId },
      {
        $set: {
          rewardComputed: true,
          finalReward: reward,
          strategy,
          computedAt: new Date(),
        },
      }
    );

    logger.debug("[ENGAGEMENT] Finalized reward", { botMessageId, reward, strategy });
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to finalize reward", { error: error.message });
  }
}

/**
 * Classify an emoji reaction as positive, negative, or neutral.
 *
 * @param {string} emoji - Emoji character or name
 * @returns {string} 'positive', 'negative', or 'neutral'
 */
export function classifyEmoji(emoji) {
  if (!emoji) return "neutral";

  // Handle both emoji characters and Discord emoji names
  const emojiStr = emoji.toString();

  if (POSITIVE_EMOJIS.has(emojiStr)) return "positive";
  if (NEGATIVE_EMOJIS.has(emojiStr)) return "negative";

  // Check emoji name patterns
  const lowerName = emojiStr.toLowerCase();
  if (
    lowerName.includes("thumbsup") ||
    lowerName.includes("heart") ||
    lowerName.includes("smile") ||
    lowerName.includes("star")
  ) {
    return "positive";
  }
  if (lowerName.includes("thumbsdown") || lowerName.includes("angry") || lowerName.includes("sad")) {
    return "negative";
  }

  return "neutral";
}

/**
 * Handle a reaction event and track engagement.
 *
 * @param {object} reaction - Discord reaction object
 * @param {object} user - User who reacted
 * @param {boolean} added - Whether reaction was added (true) or removed (false)
 */
export async function handleReaction(reaction, user, added = true) {
  if (user.bot) return;

  const messageId = reaction.message.id;
  const emoji = reaction.emoji.name;

  // Check if this is a bot message
  const metadata = await getResponseMetadata(messageId);
  if (!metadata) return; // Not a tracked bot message

  const classification = classifyEmoji(emoji);
  if (classification === "neutral") return; // Ignore neutral reactions

  const eventType = classification === "positive" ? "reaction_positive" : "reaction_negative";
  const value = added ? 1 : -1; // Remove reaction = subtract

  await trackEngagement(messageId, eventType, value, {
    emoji,
    userId: user.id,
    removed: !added,
  });
}

/**
 * Handle a reply to a bot message.
 *
 * @param {object} message - Discord message that is a reply
 */
export async function handleReply(message) {
  if (!message.reference?.messageId) return;

  const repliedToId = message.reference.messageId;

  // Check if replied-to message is from our bot
  const metadata = await getResponseMetadata(repliedToId);
  if (!metadata) return;

  await trackEngagement(repliedToId, "reply", 1, {
    replyUserId: message.author.id,
    replyContent: message.content.slice(0, 100), // First 100 chars for analysis
  });
}

/**
 * Handle conversation continuation (user sends message in same channel within timeout).
 *
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {number} withinMs - Time window in ms (default: 5 min)
 */
export async function handleConversationContinue(channelId, userId, withinMs = 5 * 60 * 1000) {
  try {
    const metaCol = getCollection("response_metadata");

    // Find recent bot messages to this user in this channel
    const recentCutoff = new Date(Date.now() - withinMs);
    const recentBotMessages = await metaCol
      .find({
        channelId,
        userId,
        createdAt: { $gt: recentCutoff },
      })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (recentBotMessages.length > 0) {
      const lastBotMessage = recentBotMessages[0];
      await trackEngagement(lastBotMessage.messageId, "conversation_continue", 1, {
        continuingUserId: userId,
      });
    }
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to track conversation continue", { error: error.message });
  }
}

/**
 * Mark messages as ignored after timeout (for penalty tracking).
 *
 * @param {number} timeoutMs - Timeout in milliseconds
 */
export async function markIgnoredMessages(timeoutMs = 10 * 60 * 1000) {
  try {
    const col = getCollection("engagement_signals");
    const cutoff = new Date(Date.now() - timeoutMs);

    // Find messages with no signals after timeout
    const metaCol = getCollection("response_metadata");
    const oldMessages = await metaCol
      .find({
        createdAt: { $lt: cutoff },
      })
      .toArray();

    for (const msg of oldMessages) {
      const existing = await col.findOne({ messageId: msg.messageId });

      // If no engagement signals at all, mark as ignored
      if (!existing || !existing.signals || existing.signals.length === 0) {
        await trackEngagement(msg.messageId, "ignore", 1, {
          timeoutMs,
        });
      }
    }
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to mark ignored messages", { error: error.message });
  }
}

/**
 * Get engagement statistics for a time period.
 *
 * @param {Date} since - Start date
 * @returns {object} Engagement statistics
 */
export async function getEngagementStats(since = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  try {
    const col = getCollection("engagement_signals");

    const pipeline = [
      { $match: { createdAt: { $gte: since } } },
      { $unwind: "$signals" },
      {
        $group: {
          _id: "$signals.event",
          count: { $sum: 1 },
          totalValue: { $sum: "$signals.value" },
        },
      },
    ];

    const results = await col.aggregate(pipeline).toArray();

    const stats = {
      since: since.toISOString(),
      signals: {},
      totalMessages: 0,
    };

    for (const r of results) {
      stats.signals[r._id] = {
        count: r.count,
        totalValue: r.totalValue,
      };
    }

    // Count unique messages
    const uniqueCount = await col.countDocuments({ createdAt: { $gte: since } });
    stats.totalMessages = uniqueCount;

    return stats;
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to get stats", { error: error.message });
    return { error: error.message };
  }
}

export default {
  trackEngagement,
  storeResponseMetadata,
  getResponseMetadata,
  computeReward,
  getPendingRewards,
  finalizeReward,
  classifyEmoji,
  handleReaction,
  handleReply,
  handleConversationContinue,
  markIgnoredMessages,
  getEngagementStats,
  SIGNAL_WEIGHTS,
};
