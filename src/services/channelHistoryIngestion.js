/**
 * Channel History Ingestion Service
 *
 * Fetches Discord channel messages and stores them in MongoDB.
 * Supports:
 * - Paginated message fetching (Discord API limit: 100 per request)
 * - Privacy filtering (opt-out users excluded)
 * - Duplicate detection via messageId
 * - Optional embedding generation for RAG
 */

import { ok, err } from '../util/result.js';
import { PrivacyManager } from './privacyManager.js';

const COLLECTION = 'channel_messages';
const BATCH_SIZE = 100; // Discord API max per request
const DEFAULT_MAX_DAYS = 7;

export class ChannelHistoryIngestion {
  constructor(db, aiClient = null) {
    this.db = db;
    this.aiClient = aiClient;
    this.privacyManager = new PrivacyManager(db);
  }

  /**
   * Ingest messages from a Discord channel.
   * @param {TextChannel} channel - Discord.js channel object
   * @param {object} options - Ingestion options
   * @param {number} [options.maxDays=7] - Maximum days to look back
   * @param {number} [options.limit=null] - Maximum messages to fetch (null = no limit)
   * @param {boolean} [options.generateEmbeddings=false] - Generate embeddings for RAG
   * @param {Date} [options.after=null] - Only fetch messages after this date
   * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
   */
  async ingestChannel(channel, options = {}) {
    const {
      maxDays = DEFAULT_MAX_DAYS,
      limit = null,
      generateEmbeddings = false,
      after = null,
    } = options;

    try {
      const guildId = channel.guild?.id || null;

      // Get opted-out user IDs
      const optedOutUsers = await this.privacyManager.getOptedOutUserIds(guildId);

      // Calculate cutoff date
      const cutoffDate = after || new Date();
      if (!after) {
        cutoffDate.setDate(cutoffDate.getDate() - maxDays);
      }

      let totalFetched = 0;
      let totalStored = 0;
      let totalSkipped = 0;
      let lastMessageId = null;
      let hasMore = true;

      while (hasMore) {
        // Fetch batch from Discord
        const fetchOptions = { limit: BATCH_SIZE };
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }

        const messages = await channel.messages.fetch(fetchOptions);

        if (messages.size === 0) {
          hasMore = false;
          break;
        }

        // Convert to array and filter by date
        const messageArray = Array.from(messages.values())
          .filter(msg => msg.createdAt >= cutoffDate);

        if (messageArray.length === 0) {
          hasMore = false;
          break;
        }

        // Process batch
        const batchResult = await this._processBatch(
          messageArray,
          guildId,
          optedOutUsers,
          generateEmbeddings
        );

        totalFetched += messageArray.length;
        totalStored += batchResult.stored;
        totalSkipped += batchResult.skipped;

        // Update last message ID for pagination
        lastMessageId = messages.last()?.id;

        // Check if we've hit the limit
        if (limit && totalFetched >= limit) {
          hasMore = false;
        }

        // Check if oldest message in batch is before cutoff
        const oldestInBatch = messageArray[messageArray.length - 1];
        if (oldestInBatch.createdAt < cutoffDate) {
          hasMore = false;
        }
      }

      return ok({
        channelId: channel.id,
        channelName: channel.name,
        guildId,
        totalFetched,
        totalStored,
        totalSkipped,
        cutoffDate,
      });
    } catch (e) {
      return err('INGESTION_ERROR', `Failed to ingest channel ${channel.id}`, e);
    }
  }

  /**
   * Process a batch of messages.
   * @private
   */
  async _processBatch(messages, guildId, optedOutUsers, generateEmbeddings) {
    const documents = [];
    let skipped = 0;

    for (const msg of messages) {
      // Skip bot messages
      if (msg.author.bot) {
        skipped++;
        continue;
      }

      // Skip empty messages
      if (!msg.content && msg.attachments.size === 0) {
        skipped++;
        continue;
      }

      // Check privacy opt-out
      const isOptedOut = optedOutUsers.has(msg.author.id);

      const doc = {
        messageId: msg.id,
        guildId: guildId,
        channelId: msg.channel.id,
        authorId: msg.author.id,
        authorTag: msg.author.tag,
        authorName: msg.member?.displayName || msg.author.username,
        content: isOptedOut ? '[OPTED OUT]' : msg.content,
        cleanContent: isOptedOut ? '[OPTED OUT]' : msg.cleanContent,
        timestamp: msg.createdAt,
        editedTimestamp: msg.editedAt,
        attachments: Array.from(msg.attachments.values()).map(a => ({
          id: a.id,
          url: a.url,
          name: a.name,
          contentType: a.contentType,
        })),
        embeds: msg.embeds.map(e => ({
          title: e.title,
          description: e.description,
          url: e.url,
        })),
        referencedMessageId: msg.reference?.messageId || null,
        embedding: null,
        embeddingModel: null,
        optedOut: isOptedOut,
        redacted: false,
        trainingEligible: !isOptedOut && msg.content.length >= 10,
        ingestedAt: new Date(),
        updatedAt: null,
      };

      documents.push(doc);
    }

    if (documents.length === 0) {
      return { stored: 0, skipped };
    }

    // Bulk upsert to MongoDB
    const bulkOps = documents.map(doc => ({
      updateOne: {
        filter: { messageId: doc.messageId },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    }));

    const result = await this.db.collection(COLLECTION).bulkWrite(bulkOps, {
      ordered: false,
    });

    const stored = result.upsertedCount;

    // Generate embeddings for new documents if enabled
    if (generateEmbeddings && this.aiClient && stored > 0) {
      await this._generateEmbeddings(documents.filter(d => !d.optedOut));
    }

    return { stored, skipped };
  }

  /**
   * Generate embeddings for messages.
   * @private
   */
  async _generateEmbeddings(documents) {
    if (!this.aiClient) return;

    try {
      const texts = documents.map(d => d.cleanContent || d.content);
      const response = await this.aiClient.embedTexts(texts);

      if (response.ok && response.data.embeddings) {
        const embeddings = response.data.embeddings;
        const model = response.data.model || 'unknown';

        const bulkOps = documents.map((doc, i) => ({
          updateOne: {
            filter: { messageId: doc.messageId },
            update: {
              $set: {
                embedding: embeddings[i],
                embeddingModel: model,
                updatedAt: new Date(),
              },
            },
          },
        }));

        await this.db.collection(COLLECTION).bulkWrite(bulkOps, { ordered: false });
      }
    } catch (e) {
      console.error('[ChannelHistoryIngestion] Embedding generation failed:', e);
    }
  }

  /**
   * Ingest messages from multiple channels.
   * @param {TextChannel[]} channels - Array of Discord.js channel objects
   * @param {object} options - Ingestion options
   */
  async ingestChannels(channels, options = {}) {
    const results = [];

    for (const channel of channels) {
      const result = await this.ingestChannel(channel, options);
      results.push({
        channelId: channel.id,
        channelName: channel.name,
        ...result,
      });
    }

    const summary = {
      totalChannels: channels.length,
      successCount: results.filter(r => r.ok).length,
      totalFetched: results.reduce((sum, r) => sum + (r.data?.totalFetched || 0), 0),
      totalStored: results.reduce((sum, r) => sum + (r.data?.totalStored || 0), 0),
      results,
    };

    return ok(summary);
  }

  /**
   * Ingest all text channels from a guild.
   * @param {Guild} guild - Discord.js guild object
   * @param {object} options - Ingestion options
   * @param {string[]} [options.excludeChannels=[]] - Channel IDs to exclude
   * @param {string[]} [options.includeChannels=null] - Only include these channel IDs
   */
  async ingestGuild(guild, options = {}) {
    const { excludeChannels = [], includeChannels = null, ...ingestionOptions } = options;

    try {
      // Get all text channels
      let channels = guild.channels.cache
        .filter(c => c.type === 0) // GUILD_TEXT
        .filter(c => !excludeChannels.includes(c.id));

      // Filter to specific channels if provided
      if (includeChannels) {
        channels = channels.filter(c => includeChannels.includes(c.id));
      }

      // Check bot permissions for each channel
      const accessibleChannels = channels.filter(c => {
        const permissions = c.permissionsFor(guild.members.me);
        return permissions?.has('ViewChannel') && permissions?.has('ReadMessageHistory');
      });

      return this.ingestChannels(Array.from(accessibleChannels.values()), ingestionOptions);
    } catch (e) {
      return err('GUILD_INGESTION_ERROR', `Failed to ingest guild ${guild.id}`, e);
    }
  }

  /**
   * Get ingestion statistics for a guild.
   */
  async getStats(guildId = null) {
    try {
      const matchStage = guildId ? { guildId } : {};

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            uniqueAuthors: { $addToSet: '$authorId' },
            uniqueChannels: { $addToSet: '$channelId' },
            oldestMessage: { $min: '$timestamp' },
            newestMessage: { $max: '$timestamp' },
            optedOutCount: {
              $sum: { $cond: ['$optedOut', 1, 0] },
            },
            trainingEligibleCount: {
              $sum: { $cond: ['$trainingEligible', 1, 0] },
            },
            withEmbeddingsCount: {
              $sum: { $cond: [{ $ne: ['$embedding', null] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalMessages: 1,
            uniqueAuthors: { $size: '$uniqueAuthors' },
            uniqueChannels: { $size: '$uniqueChannels' },
            oldestMessage: 1,
            newestMessage: 1,
            optedOutCount: 1,
            trainingEligibleCount: 1,
            withEmbeddingsCount: 1,
          },
        },
      ];

      const result = await this.db.collection(COLLECTION).aggregate(pipeline).toArray();

      return ok(result[0] || {
        totalMessages: 0,
        uniqueAuthors: 0,
        uniqueChannels: 0,
        oldestMessage: null,
        newestMessage: null,
        optedOutCount: 0,
        trainingEligibleCount: 0,
        withEmbeddingsCount: 0,
      });
    } catch (e) {
      return err('STATS_ERROR', 'Failed to get ingestion stats', e);
    }
  }

  /**
   * Get messages by channel with pagination.
   */
  async getMessagesByChannel(channelId, options = {}) {
    const { limit = 50, skip = 0, includeOptedOut = false } = options;

    try {
      const query = { channelId };
      if (!includeOptedOut) {
        query.optedOut = { $ne: true };
      }

      const messages = await this.db.collection(COLLECTION)
        .find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      return ok(messages);
    } catch (e) {
      return err('FETCH_ERROR', 'Failed to fetch messages', e);
    }
  }

  /**
   * Get recent messages for conversation context.
   * @param {string} channelId - Channel ID
   * @param {number} limit - Number of messages
   * @param {Date} [before=null] - Get messages before this date
   */
  async getRecentContext(channelId, limit = 20, before = null) {
    try {
      const query = {
        channelId,
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };

      if (before) {
        query.timestamp = { $lt: before };
      }

      const messages = await this.db.collection(COLLECTION)
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      // Return in chronological order
      return ok(messages.reverse());
    } catch (e) {
      return err('CONTEXT_ERROR', 'Failed to get context', e);
    }
  }

  /**
   * Get training-eligible messages.
   */
  async getTrainingEligibleMessages(options = {}) {
    const { limit = 1000, minLength = 10, guildId = null } = options;

    try {
      const query = {
        trainingEligible: true,
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };

      if (guildId) {
        query.guildId = guildId;
      }

      const messages = await this.db.collection(COLLECTION)
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      // Filter by content length
      const filtered = messages.filter(m =>
        (m.cleanContent || m.content || '').length >= minLength
      );

      return ok(filtered);
    } catch (e) {
      return err('TRAINING_FETCH_ERROR', 'Failed to get training messages', e);
    }
  }

  /**
   * Delete old messages (beyond retention period).
   * Note: TTL index handles this automatically, but this can be used for manual cleanup.
   */
  async cleanupOldMessages(retentionDays = 90) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);

      const result = await this.db.collection(COLLECTION).deleteMany({
        ingestedAt: { $lt: cutoff },
      });

      return ok({ deletedCount: result.deletedCount });
    } catch (e) {
      return err('CLEANUP_ERROR', 'Failed to cleanup old messages', e);
    }
  }
}

export default ChannelHistoryIngestion;
