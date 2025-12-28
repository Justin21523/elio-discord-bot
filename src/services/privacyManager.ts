/**
 * Privacy Manager Service
 *
 * Handles user privacy preferences and data management:
 * - Opt-out of history collection
 * - Opt-out of ML training
 * - Data deletion requests
 * - Privacy compliance
 */

import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";

const COLLECTION = "privacy_settings";
const MESSAGES_COLLECTION = "channel_messages";

type DbLike = {
  collection: (name: string) => any;
};

type PrivacySettings = {
  userId: string;
  guildId: string | null;
  optOutHistory: boolean;
  optOutTraining: boolean;
  optOutEmbeddings: boolean;
  requestedDeletion: boolean;
  deletionRequestedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class PrivacyManager {
  db: DbLike;

  constructor(db: DbLike) {
    this.db = db;
  }

  /**
   * Get privacy settings for a user.
   */
  async getSettings(userId: string, guildId: string | null = null): Promise<Result<PrivacySettings>> {
    try {
      const query: Record<string, any> = { userId };
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

      return ok(settings as PrivacySettings);
    } catch (e) {
      return err("DB_ERROR", "Failed to get privacy settings", e);
    }
  }

  /**
   * Update privacy settings for a user.
   */
  async updateSettings(
    userId: string,
    settings: Partial<PrivacySettings> & Record<string, unknown>,
    guildId: string | null = null
  ): Promise<Result<any>> {
    try {
      const now = new Date();
      const filter: Record<string, any> = { userId };
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

      const result = await this.db.collection(COLLECTION).findOneAndUpdate(filter, update, {
        upsert: true,
        returnDocument: "after",
      });

      return ok(result);
    } catch (e) {
      return err("DB_ERROR", "Failed to update privacy settings", e);
    }
  }

  /**
   * Opt out of history collection.
   */
  async setHistoryOptOut(userId: string, optOut: boolean, guildId: string | null = null) {
    return this.updateSettings(userId, { optOutHistory: optOut }, guildId);
  }

  /**
   * Opt out of ML training.
   */
  async setTrainingOptOut(userId: string, optOut: boolean, guildId: string | null = null) {
    return this.updateSettings(userId, { optOutTraining: optOut }, guildId);
  }

  /**
   * Check if a user has opted out of history collection.
   */
  async isOptedOutOfHistory(userId: string, guildId: string | null = null): Promise<boolean> {
    const result = await this.getSettings(userId, guildId);
    if (!result.ok) return false;
    return result.data.optOutHistory === true;
  }

  /**
   * Check if a user has opted out of training.
   */
  async isOptedOutOfTraining(userId: string, guildId: string | null = null): Promise<boolean> {
    const result = await this.getSettings(userId, guildId);
    if (!result.ok) return false;
    return result.data.optOutTraining === true;
  }

  /**
   * Request deletion of all user data.
   */
  async requestDeletion(userId: string): Promise<Result<{ userId: string; deletionRequestedAt: Date; messagesRedacted: number }>> {
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
      return err("DB_ERROR", "Failed to request deletion", e);
    }
  }

  /**
   * Redact all messages from a user (replace content with [REDACTED]).
   */
  async redactUserMessages(userId: string): Promise<Result<{ modifiedCount: number }>> {
    try {
      const result = await this.db.collection(MESSAGES_COLLECTION).updateMany(
        { authorId: userId },
        {
          $set: {
            content: "[REDACTED]",
            cleanContent: "[REDACTED]",
            redacted: true,
            trainingEligible: false,
            embedding: null,
            updatedAt: new Date(),
          },
        }
      );

      return ok({ modifiedCount: result.modifiedCount });
    } catch (e) {
      return err("DB_ERROR", "Failed to redact messages", e);
    }
  }

  /**
   * Delete all messages from a user (hard delete).
   */
  async deleteUserMessages(userId: string): Promise<Result<{ deletedCount: number }>> {
    try {
      const result = await this.db.collection(MESSAGES_COLLECTION).deleteMany({
        authorId: userId,
      });

      return ok({ deletedCount: result.deletedCount });
    } catch (e) {
      return err("DB_ERROR", "Failed to delete messages", e);
    }
  }

  /**
   * Process pending deletion requests.
   * This should be run periodically by a cron job.
   */
  async processDeletionRequests(delayDays = 7): Promise<Result<{ processed: number; results: Array<{ userId: string; deletedCount: number }> }>> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - delayDays);

      const pendingDeletions = await this.db
        .collection(COLLECTION)
        .find({
          requestedDeletion: true,
          deletionRequestedAt: { $lt: cutoff },
        })
        .toArray();

      const results: Array<{ userId: string; deletedCount: number }> = [];
      for (const settings of pendingDeletions as any[]) {
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
      return err("DB_ERROR", "Failed to process deletion requests", e);
    }
  }

  /**
   * Get opted-out user IDs for filtering during ingestion.
   */
  async getOptedOutUserIds(guildId: string | null = null): Promise<Set<string>> {
    try {
      const query: Record<string, any> = { optOutHistory: true };
      if (guildId) {
        query.$or = [{ guildId }, { guildId: null }];
      }

      const settings = await this.db
        .collection(COLLECTION)
        .find(query, { projection: { userId: 1 } })
        .toArray();

      return new Set((settings as any[]).map((s) => s.userId));
    } catch (e) {
      console.error("[PrivacyManager] Failed to get opted-out users:", e);
      return new Set();
    }
  }

  /**
   * Mark messages from opted-out users as ineligible for training.
   */
  async syncOptOutStatus(guildId: string | null = null) {
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
      return err("DB_ERROR", "Failed to sync opt-out status", e);
    }
  }

  /**
   * Get privacy statistics.
   */
  async getStats() {
    try {
      const [totalUsers, historyOptOuts, trainingOptOuts, pendingDeletions] = await Promise.all([
        this.db.collection(COLLECTION).countDocuments(),
        this.db.collection(COLLECTION).countDocuments({ optOutHistory: true }),
        this.db.collection(COLLECTION).countDocuments({ optOutTraining: true }),
        this.db.collection(COLLECTION).countDocuments({ requestedDeletion: true }),
      ]);

      const redactedMessages = await this.db.collection(MESSAGES_COLLECTION).countDocuments({ redacted: true });

      return ok({
        totalUsers,
        historyOptOuts,
        trainingOptOuts,
        pendingDeletions,
        redactedMessages,
      });
    } catch (e) {
      return err("DB_ERROR", "Failed to get stats", e);
    }
  }
}

export default PrivacyManager;

