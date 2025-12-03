/**
 * Interaction Logger Service
 * Logs user-bot conversations for continuous learning and model improvement
 */

import { logInteraction, recordFeedback, findRecentInteraction, getStats } from '../db/models/interaction.js';
import { logger } from '../utils/logger.js';

class InteractionLogger {
  constructor() {
    this.enabled = true;
    this.queue = [];
    this.flushInterval = null;
    this.batchSize = 10;
    this.flushIntervalMs = 5000; // Flush every 5 seconds
  }

  /**
   * Initialize the logger with batched writes
   */
  async init() {
    this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
    logger.info('[InteractionLogger] Initialized with batch size:', this.batchSize);
    return this;
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
    logger.info('[InteractionLogger] Shutdown complete');
  }

  /**
   * Log a conversation interaction (queued for batch insert)
   * @param {Object} params
   * @param {string} params.guildId
   * @param {string} params.channelId
   * @param {string} params.userId
   * @param {string} params.username
   * @param {string} params.persona - Persona name that responded
   * @param {string} params.userMessage - User's input message
   * @param {string} params.botResponse - Bot's response
   * @param {string} params.responseSource - 'personaLogic' | 'llm' | 'rag' | 'fallback'
   * @param {number} params.similarity - TF-IDF similarity score
   * @returns {Object} { ok: boolean, data?: { queued: boolean } }
   */
  log({
    guildId,
    channelId,
    userId,
    username,
    persona,
    userMessage,
    botResponse,
    responseSource = 'personaLogic',
    similarity = null,
  }) {
    if (!this.enabled) {
      return { ok: true, data: { queued: false } };
    }

    // Skip very short messages (likely spam or test)
    if (!userMessage || userMessage.length < 3) {
      return { ok: true, data: { queued: false, reason: 'message_too_short' } };
    }

    // Skip bot messages in user field
    if (userId && userId.startsWith('bot_')) {
      return { ok: true, data: { queued: false, reason: 'bot_message' } };
    }

    this.queue.push({
      guildId,
      channelId,
      userId,
      username,
      persona,
      userMessage,
      botResponse,
      responseSource,
      similarity,
    });

    // Flush immediately if batch is full
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }

    return { ok: true, data: { queued: true } };
  }

  /**
   * Flush queued interactions to database
   */
  async flush() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);

    try {
      const results = await Promise.allSettled(
        batch.map(interaction => logInteraction(interaction))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        logger.warn('[InteractionLogger] Batch flush partial failure:', { successful, failed });
      } else {
        logger.debug('[InteractionLogger] Flushed interactions:', successful);
      }
    } catch (error) {
      logger.error('[InteractionLogger] Flush error:', error.message);
      // Re-queue failed items (limit to prevent infinite growth)
      if (this.queue.length < 1000) {
        this.queue.unshift(...batch);
      }
    }
  }

  /**
   * Record user feedback (thumbs up/down or rating)
   * @param {string} userId - Discord user ID
   * @param {Object} feedback - { thumbsUp, thumbsDown, rating }
   */
  async recordUserFeedback(userId, feedback) {
    try {
      // Find the user's most recent interaction (within last 5 minutes)
      const result = await findRecentInteraction(userId, { maxAgeMs: 5 * 60 * 1000 });

      if (!result.ok || !result.data) {
        return { ok: false, error: 'no_recent_interaction' };
      }

      const interactionId = result.data._id.toString();
      return await recordFeedback(interactionId, feedback);
    } catch (error) {
      logger.error('[InteractionLogger] Feedback error:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Record feedback by interaction ID directly
   * @param {string} interactionId - MongoDB ObjectId as string
   * @param {Object} feedback - { thumbsUp, thumbsDown, rating }
   */
  async recordFeedbackById(interactionId, feedback) {
    try {
      return await recordFeedback(interactionId, feedback);
    } catch (error) {
      logger.error('[InteractionLogger] Feedback by ID error:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Get statistics about collected interactions
   */
  async getStatistics() {
    try {
      return await getStats();
    } catch (error) {
      logger.error('[InteractionLogger] Stats error:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info('[InteractionLogger] Logging', enabled ? 'enabled' : 'disabled');
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      enabled: this.enabled,
      queueLength: this.queue.length,
      batchSize: this.batchSize,
    };
  }
}

// Singleton instance
const interactionLogger = new InteractionLogger();

export { interactionLogger };
export default interactionLogger;
