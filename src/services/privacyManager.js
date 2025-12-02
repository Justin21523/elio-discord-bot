/**
 * Privacy Manager Service
 *
 * Handles user privacy preferences and data management:
 * - Opt-out of history collection
 * - Opt-out of ML training
 * - Data deletion requests
 * - Privacy compliance
 */

import { ok, err } from '../utils/result.js';

const COLLECTION = 'privacy_settings';
const MESSAGES_COLLECTION = 'channel_messages';

export class PrivacyManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get privacy settings for a user.
   * @param {string} userId - Discord user ID
   * @param {string} [guildId] - Optional guild ID for guild-specific settings
   * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
   */
  async getSettings(userId, guildId = null) {
    try {
      const query = { userId };
      if (guildId) {
        query.guildId = guildId;
      }

      const settings = await this.db.collection(COLLECTION).findOne(query);

      if (!settings) {
        // Return defaults
        return ok({
          userId,
          guildId,
          optOutHistory: false,
          optOutTraining: false,
          optOutEmbeddings: false,
          requestedDeletion: false,
        });
      }

      return ok(settings);
    } catch (e) {
      return err('DB_ERROR', 'Failed to get privacy settings', e);
    }
  }

  /**
   * Update privacy settings for a user.
   * @param {string} userId - Discord user ID
   * @param {object} settings - Settings to update
   * @param {string} [guildId] - Optional guild ID
   * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
   */
  async updateSettings(userId, settings, guildId = null) {
    try {
      const now = new Date();
      const filter = { userId };
      if (guildId) {
        filter.guildId = guildId;
      }

      const update = {
        $set: {
          ...settings,
          updatedAt: now,
        },
        $setOnInsert: {
          userId,
          guildId,
          createdAt: now,
        },
      };

      const result = await this.db.collection(COLLECTION).findOneAndUpdate(
        filter,
        update,
        { upsert: true, returnDocument: 'after' }
      );

      return ok(result);
    } catch (e) {
      return err('DB_ERROR', 'Failed to update privacy settings', e);
    }
  }

  /**
   * Opt out of history collection.
   * @param {string} userId - Discord user ID
   * @param {boolean} optOut - Whether to opt out
   * @param {string} [guildId] - Optional guild ID
   */
  async setHistoryOptOut(userId, optOut, guildId = null) {
    return this.updateSettings(userId, { optOutHistory: optOut }, guildId);
  }

  /**
   * Opt out of ML training.
   * @param {string} userId - Discord user ID
   * @param {boolean} optOut - Whether to opt out
   * @param {string} [guildId] - Optional guild ID
   */
  async setTrainingOptOut(userId, optOut, guildId = null) {
    return this.updateSettings(userId, { optOutTraining: optOut }, guildId);
  }

  /**
   * Check if a user has opted out of history collection.
   * @param {string} userId - Discord user ID
   * @param {string} [guildId] - Optional guild ID
   * @returns {Promise<boolean>}
   */
  async isOptedOutOfHistory(userId, guildId = null) {
    const result = await this.getSettings(userId, guildId);
    if (!result.ok) return false;
    return result.data.optOutHistory === true;
  }

  /**
   * Check if a user has opted out of training.
   * @param {string} userId - Discord user ID
   * @param {string} [guildId] - Optional guild ID
   * @returns {Promise<boolean>}
   */
  async isOptedOutOfTraining(userId, guildId = null) {
    const result = await this.getSettings(userId, guildId);
    if (!result.ok) return false;
    return result.data.optOutTraining === true;
  }

  /**
   * Request deletion of all user data.
   * @param {string} userId - Discord user ID
   * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
   */
  async requestDeletion(userId) {
    try {
      const now = new Date();

      // Mark settings with deletion request
      await this.updateSettings(userId, {
        requestedDeletion: true,
        deletionRequestedAt: now,
        optOutHistory: true,
        optOutTraining: true,
        optOutEmbeddings: true,
      });

      // Redact all messages from this user
      const redactResult = await this.redactUserMessages(userId);

      return ok({
        userId,
        deletionRequestedAt: now,
        messagesRedacted: redactResult.ok ? redactResult.data.modifiedCount : 0,
      });
    } catch (e) {
      return err('DB_ERROR', 'Failed to request deletion', e);
    }
  }

  /**
   * Redact all messages from a user (replace content with [REDACTED]).
   * @param {string} userId - Discord user ID
   * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
   */
  async redactUserMessages(userId) {
    try {
      const result = await this.db.collection(MESSAGES_COLLECTION).updateMany(
        { authorId: userId },
        {
          $set: {
            content: '[REDACTED]',
            cleanContent: '[REDACTED]',
            redacted: true,
            trainingEligible: false,
            embedding: null,
            updatedAt: new Date(),
          },
        }
      );

      return ok({ modifiedCount: result.modifiedCount });
    } catch (e) {
      return err('DB_ERROR', 'Failed to redact messages', e);
    }
  }

  /**
   * Delete all messages from a user (hard delete).
   * @param {string} userId - Discord user ID
   * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
   */
  async deleteUserMessages(userId) {
    try {
      const result = await this.db.collection(MESSAGES_COLLECTION).deleteMany({
        authorId: userId,
      });

      return ok({ deletedCount: result.deletedCount });
    } catch (e) {
      return err('DB_ERROR', 'Failed to delete messages', e);
    }
  }

  /**
   * Process pending deletion requests.
   * This should be run periodically by a cron job.
   * @param {number} delayDays - Days to wait before permanent deletion
   */
  async processDeletionRequests(delayDays = 7) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - delayDays);

      const pendingDeletions = await this.db.collection(COLLECTION)
        .find({
          requestedDeletion: true,
          deletionRequestedAt: { $lt: cutoff },
        })
        .toArray();

      const results = [];
      for (const settings of pendingDeletions) {
        const deleteResult = await this.deleteUserMessages(settings.userId);
        if (deleteResult.ok) {
          results.push({
            userId: settings.userId,
            deletedCount: deleteResult.data.deletedCount,
          });
        }
      }

      return ok({ processed: results.length, results });
    } catch (e) {
      return err('DB_ERROR', 'Failed to process deletion requests', e);
    }
  }

  /**
   * Get opted-out user IDs for filtering during ingestion.
   * @param {string} [guildId] - Optional guild filter
   * @returns {Promise<Set<string>>}
   */
  async getOptedOutUserIds(guildId = null) {
    try {
      const query = { optOutHistory: true };
      if (guildId) {
        query.$or = [{ guildId }, { guildId: null }];
      }

      const settings = await this.db.collection(COLLECTION)
        .find(query, { projection: { userId: 1 } })
        .toArray();

      return new Set(settings.map(s => s.userId));
    } catch (e) {
      console.error('[PrivacyManager] Failed to get opted-out users:', e);
      return new Set();
    }
  }

  /**
   * Mark messages from opted-out users as ineligible for training.
   * @param {string} [guildId] - Optional guild filter
   */
  async syncOptOutStatus(guildId = null) {
    try {
      const optedOutIds = await this.getOptedOutUserIds(guildId);

      if (optedOutIds.size === 0) {
        return ok({ updated: 0 });
      }

      const result = await this.db.collection(MESSAGES_COLLECTION).updateMany(
        {
          authorId: { $in: Array.from(optedOutIds) },
          optedOut: { $ne: true },
        },
        {
          $set: {
            optedOut: true,
            trainingEligible: false,
            updatedAt: new Date(),
          },
        }
      );

      return ok({ updated: result.modifiedCount });
    } catch (e) {
      return err('DB_ERROR', 'Failed to sync opt-out status', e);
    }
  }

  /**
   * Get privacy statistics.
   */
  async getStats() {
    try {
      const [
        totalUsers,
        historyOptOuts,
        trainingOptOuts,
        pendingDeletions,
      ] = await Promise.all([
        this.db.collection(COLLECTION).countDocuments(),
        this.db.collection(COLLECTION).countDocuments({ optOutHistory: true }),
        this.db.collection(COLLECTION).countDocuments({ optOutTraining: true }),
        this.db.collection(COLLECTION).countDocuments({ requestedDeletion: true }),
      ]);

      const redactedMessages = await this.db.collection(MESSAGES_COLLECTION)
        .countDocuments({ redacted: true });

      return ok({
        totalUsers,
        historyOptOuts,
        trainingOptOuts,
        pendingDeletions,
        redactedMessages,
      });
    } catch (e) {
      return err('DB_ERROR', 'Failed to get stats', e);
    }
  }
}

export default PrivacyManager;
