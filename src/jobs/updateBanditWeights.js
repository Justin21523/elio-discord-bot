/**
 * updateBanditWeights.js
 * Cron job to process engagement signals and update Thompson Sampling Bandit weights.
 * Runs every 30 minutes to batch process feedback.
 */

import { logger } from "../util/logger.js";
import {
  getPendingRewards,
  computeReward,
  finalizeReward,
  getResponseMetadata,
  markIgnoredMessages,
  getEngagementStats,
} from "../services/analytics/engagement.js";

// AI service client for bandit updates
let aiClient = null;

/**
 * Main job runner
 */
export async function run(client) {
  try {
    logger.info("[JOB] updateBanditWeights started");

    // Lazy load AI client
    if (!aiClient) {
      const { default: ai } = await import("../services/ai/index.js");
      aiClient = ai;
    }

    // Step 1: Mark messages that have been ignored (no interaction after timeout)
    await markIgnoredMessages(10 * 60 * 1000); // 10 minutes

    // Step 2: Get pending signals to process
    const pending = await getPendingRewards(10 * 60 * 1000);
    logger.info(`[JOB] Processing ${pending.length} pending reward computations`);

    if (pending.length === 0) {
      logger.info("[JOB] No pending rewards to process");
      return;
    }

    // Step 3: Compute rewards and collect updates
    const updates = [];
    let processed = 0;
    let errors = 0;

    for (const doc of pending) {
      try {
        // Compute reward from signals
        const reward = await computeReward(doc.messageId);

        // Get response metadata to find strategy used
        const metadata = await getResponseMetadata(doc.messageId);

        if (metadata?.strategy) {
          updates.push({
            arm: metadata.strategy,
            strategy: metadata.strategy, // Alias for compatibility
            reward,
            messageId: doc.messageId,
            persona: metadata.persona,
          });

          // Mark as processed
          await finalizeReward(doc.messageId, reward, metadata.strategy);
          processed++;
        } else {
          // No metadata found - just mark as processed without update
          await finalizeReward(doc.messageId, reward, "unknown");
          logger.debug(`[JOB] No metadata for message ${doc.messageId}`);
        }
      } catch (error) {
        errors++;
        logger.warn(`[JOB] Failed to process message ${doc.messageId}`, {
          error: error.message,
        });
      }
    }

    logger.info(`[JOB] Computed ${processed} rewards, ${errors} errors`);

    // Step 4: Send batch update to AI service
    if (updates.length > 0) {
      try {
        const result = await sendBanditUpdate(updates);

        if (result.ok) {
          logger.info(`[JOB] Successfully updated bandit with ${updates.length} observations`, {
            newWeights: result.data?.weights,
          });
        } else {
          logger.warn("[JOB] Bandit update failed", { error: result.error });
        }
      } catch (error) {
        logger.error("[JOB] Failed to send bandit update", { error: error.message });
      }
    }

    // Step 5: Log statistics
    const stats = await getEngagementStats(new Date(Date.now() - 24 * 60 * 60 * 1000));
    logger.info("[JOB] 24h engagement stats", { stats });

    logger.info("[JOB] updateBanditWeights completed", {
      processed,
      errors,
      updates: updates.length,
    });
  } catch (error) {
    logger.error("[JOB] updateBanditWeights failed", { error: error.message });
  }
}

/**
 * Send batch update to AI service bandit endpoint
 */
async function sendBanditUpdate(updates) {
  try {
    // Check if AI service is available
    if (!aiClient?.hybrid) {
      // Fallback: log updates for manual review
      logger.info("[JOB] AI service not available, logging updates", {
        updateCount: updates.length,
        updates: updates.slice(0, 5), // First 5 for inspection
      });
      return { ok: false, error: "AI service not available" };
    }

    // Call hybrid bandit update endpoint
    const result = await aiClient.hybrid.batchUpdateBandit(updates);
    return result;
  } catch (error) {
    logger.error("[JOB] sendBanditUpdate failed", { error: error.message });
    return { ok: false, error: error.message };
  }
}

/**
 * Get current bandit weights (for monitoring)
 */
export async function getBanditStats() {
  try {
    if (!aiClient) {
      const { default: ai } = await import("../services/ai/index.js");
      aiClient = ai;
    }

    if (aiClient?.hybrid?.getBanditStats) {
      return await aiClient.hybrid.getBanditStats();
    }

    return { ok: false, error: "Bandit stats not available" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Manually trigger a bandit update (for testing)
 */
export async function triggerUpdate() {
  await run(null);
}

export default { run, getBanditStats, triggerUpdate };
