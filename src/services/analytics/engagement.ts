/**
 * Engagement signal tracking for implicit feedback learning.
 * Captures user interactions (replies, reactions, conversation continuation)
 * to train the Thompson Sampling Bandit for strategy selection.
 */
import { getCollection } from "../../db/mongo.js";
import { logger } from "../../util/logger.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

// Signal weights for reward computation
export const SIGNAL_WEIGHTS = {
  reply: 1.0, // User replied to bot message
  reaction_positive: 0.5, // 👍 ❤️ 😊 🎉 ✅
  reaction_negative: -0.5, // 👎 😢 ❌
  conversation_continue: 0.3, // User sent another message within 5 min
  ignore: -0.1, // No interaction after timeout
} as const;

type EngagementEvent = keyof typeof SIGNAL_WEIGHTS | (string & {});

type EngagementSignal = {
  event: EngagementEvent;
  value: number;
  ts: Date;
} & Record<string, unknown>;

type EngagementSignalsDoc = {
  messageId: string;
  createdAt: Date;
  signals?: EngagementSignal[];
  rewardComputed?: boolean;
  finalReward?: number;
  strategy?: string;
  computedAt?: Date;
};

type ResponseMetadataDoc = {
  messageId: string;
  strategy: string;
  persona: string | null;
  userId: string | null;
  channelId: string | null;
  createdAt: Date;
} & Record<string, unknown>;

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

const NEGATIVE_EMOJIS = new Set([
  "👎",
  "😢",
  "❌",
  "😠",
  "😡",
  "💔",
  "🙁",
  "😕",
  "😞",
]);

/**
 * Track an engagement signal for a bot message.
 */
export async function trackEngagement(
  botMessageId: string,
  event: EngagementEvent,
  value = 1,
  meta: Record<string, unknown> = {}
) {
  if (!botMessageId || !event) return;

  try {
    const col = getCollection<EngagementSignalsDoc>("engagement_signals");

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
    logger.warn("[ENGAGEMENT] Failed to track", { error: getErrorMessage(error) });
  }
}

/**
 * Store metadata about a bot response for later reward attribution.
 */
export async function storeResponseMetadata(
  messageId: string,
  strategy: string,
  persona: string | null,
  userId: string | null,
  channelId: string | null,
  extra: Record<string, unknown> = {}
) {
  if (!messageId || !strategy) return;

  try {
    const col = getCollection<ResponseMetadataDoc>("response_metadata");

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
    logger.warn("[ENGAGEMENT] Failed to store metadata", { error: getErrorMessage(error) });
  }
}

/**
 * Get response metadata for a bot message.
 */
export async function getResponseMetadata(messageId: string) {
  if (!messageId) return null;

  try {
    const col = getCollection<ResponseMetadataDoc>("response_metadata");
    return await col.findOne({ messageId });
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to get metadata", { error: getErrorMessage(error) });
    return null;
  }
}

/**
 * Compute reward score for a bot message based on accumulated signals.
 * Returns reward value in [0, 1].
 */
export async function computeReward(botMessageId: string): Promise<number> {
  try {
    const col = getCollection<EngagementSignalsDoc>("engagement_signals");
    const doc = await col.findOne({ messageId: botMessageId });

    if (!doc || !Array.isArray(doc.signals) || doc.signals.length === 0) {
      return 0.5; // Neutral if no signals
    }

    let reward = 0;
    for (const signal of doc.signals as Array<any>) {
      const weight =
        SIGNAL_WEIGHTS[signal.event as keyof typeof SIGNAL_WEIGHTS] ?? 0;
      const signalValue = typeof signal.value === "number" ? signal.value : 1;
      reward += weight * signalValue;
    }

    // Normalize to [0, 1] range
    // Map from approx [-1, 2] to [0, 1]
    return Math.max(0, Math.min(1, (reward + 1) / 3));
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to compute reward", { error: getErrorMessage(error) });
    return 0.5; // Neutral on error
  }
}

/**
 * Get pending messages needing reward computation.
 * Returns messages older than timeout (default: 10 min) with signals.
 */
export async function getPendingRewards(timeoutMs = 10 * 60 * 1000) {
  try {
    const col = getCollection<EngagementSignalsDoc>("engagement_signals");
    const cutoff = new Date(Date.now() - timeoutMs);

    return await col
      .find({
        createdAt: { $lt: cutoff },
        rewardComputed: { $ne: true },
      })
      .toArray();
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to get pending rewards", { error: getErrorMessage(error) });
    return [];
  }
}

/**
 * Mark reward as computed and record final values.
 */
export async function finalizeReward(
  botMessageId: string,
  reward: number,
  strategy: string
) {
  try {
    const col = getCollection<EngagementSignalsDoc>("engagement_signals");

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
    logger.warn("[ENGAGEMENT] Failed to finalize reward", { error: getErrorMessage(error) });
  }
}

/**
 * Classify an emoji reaction as positive, negative, or neutral.
 */
export function classifyEmoji(emoji: unknown): "positive" | "negative" | "neutral" {
  if (!emoji) return "neutral";

  // Handle both emoji characters and Discord emoji names
  const emojiStr = String(emoji);

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
  if (
    lowerName.includes("thumbsdown") ||
    lowerName.includes("angry") ||
    lowerName.includes("sad")
  ) {
    return "negative";
  }

  return "neutral";
}

/**
 * Handle a reaction event and track engagement.
 */
export async function handleReaction(reaction: any, user: any, added = true) {
  if (user?.bot) return;

  const messageId = reaction?.message?.id;
  const emoji = reaction?.emoji?.name;
  if (!messageId) return;

  // Check if this is a bot message
  const metadata = await getResponseMetadata(messageId);
  if (!metadata) return; // Not a tracked bot message

  const classification = classifyEmoji(emoji);
  if (classification === "neutral") return; // Ignore neutral reactions

  const eventType =
    classification === "positive" ? "reaction_positive" : "reaction_negative";
  const value = added ? 1 : -1; // Remove reaction = subtract

  await trackEngagement(messageId, eventType, value, {
    emoji,
    userId: user?.id,
    removed: !added,
  });
}

/**
 * Handle a reply to a bot message.
 */
export async function handleReply(message: any) {
  const repliedToId = message?.reference?.messageId;
  if (!repliedToId) return;

  // Check if replied-to message is from our bot
  const metadata = await getResponseMetadata(repliedToId);
  if (!metadata) return;

  await trackEngagement(repliedToId, "reply", 1, {
    replyUserId: message?.author?.id,
    replyContent: String(message?.content ?? "").slice(0, 100), // First 100 chars for analysis
  });
}

/**
 * Handle conversation continuation (user sends message in same channel within timeout).
 */
export async function handleConversationContinue(
  channelId: string,
  userId: string,
  withinMs = 5 * 60 * 1000
) {
  try {
    const metaCol = getCollection<ResponseMetadataDoc>("response_metadata");

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
      const lastBotMessage = recentBotMessages[0] as any;
      await trackEngagement(lastBotMessage.messageId, "conversation_continue", 1, {
        continuingUserId: userId,
      });
    }
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to track conversation continue", { error: getErrorMessage(error) });
  }
}

/**
 * Mark messages as ignored after timeout (for penalty tracking).
 */
export async function markIgnoredMessages(timeoutMs = 10 * 60 * 1000) {
  try {
    const col = getCollection<EngagementSignalsDoc>("engagement_signals");
    const cutoff = new Date(Date.now() - timeoutMs);

    // Find messages with no signals after timeout
    const metaCol = getCollection<ResponseMetadataDoc>("response_metadata");
    const oldMessages = await metaCol
      .find({
        createdAt: { $lt: cutoff },
      })
      .toArray();

    for (const msg of oldMessages as Array<any>) {
      const existing = await col.findOne({ messageId: msg.messageId });

      // If no engagement signals at all, mark as ignored
      if (!existing || !Array.isArray(existing.signals) || existing.signals.length === 0) {
        await trackEngagement(msg.messageId, "ignore", 1, { timeoutMs });
      }
    }
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to mark ignored messages", { error: getErrorMessage(error) });
  }
}

/**
 * Get engagement statistics for a time period.
 */
export async function getEngagementStats(
  since = new Date(Date.now() - 24 * 60 * 60 * 1000)
) {
  try {
    const col = getCollection<EngagementSignalsDoc>("engagement_signals");

    const pipeline: Array<Record<string, unknown>> = [
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

    const stats: {
      since: string;
      signals: Record<string, { count: number; totalValue: number }>;
      totalMessages: number;
    } = {
      since: since.toISOString(),
      signals: {},
      totalMessages: 0,
    };

    for (const r of results as Array<any>) {
      const key = String(r._id);
      stats.signals[key] = {
        count: typeof r.count === "number" ? r.count : 0,
        totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
      };
    }

    // Count unique messages
    const uniqueCount = await col.countDocuments({ createdAt: { $gte: since } });
    stats.totalMessages = uniqueCount;

    return stats;
  } catch (error) {
    logger.warn("[ENGAGEMENT] Failed to get stats", { error: getErrorMessage(error) });
    return { error: getErrorMessage(error) };
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
