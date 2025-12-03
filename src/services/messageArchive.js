/**
 * Message Archive Service
 *
 * Provides query and search capabilities for archived channel messages.
 * Used for:
 * - RAG context retrieval
 * - Conversation history lookup
 * - Training data extraction
 * - Analytics and reporting
 */

import { ok, err } from '../util/result.js';

const COLLECTION = 'channel_messages';

export class MessageArchive {
  constructor(db, aiClient = null) {
    this.db = db;
    this.aiClient = aiClient;
  }

  /**
   * Search messages by text (uses MongoDB text index).
   * @param {string} query - Search query
   * @param {object} options - Search options
   */
  async searchText(query, options = {}) {
    const {
      guildId = null,
      channelId = null,
      limit = 20,
      includeOptedOut = false,
    } = options;

    try {
      const filter = {
        $text: { $search: query },
      };

      if (guildId) filter.guildId = guildId;
      if (channelId) filter.channelId = channelId;
      if (!includeOptedOut) {
        filter.optedOut = { $ne: true };
        filter.redacted = { $ne: true };
      }

      const messages = await this.db.collection(COLLECTION)
        .find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .toArray();

      return ok(messages);
    } catch (e) {
      return err('SEARCH_ERROR', 'Text search failed', e);
    }
  }

  /**
   * Search messages by semantic similarity (requires embeddings).
   * @param {string} query - Query text
   * @param {object} options - Search options
   */
  async searchSemantic(query, options = {}) {
    const {
      guildId = null,
      channelId = null,
      limit = 10,
      minSimilarity = 0.7,
    } = options;

    if (!this.aiClient) {
      return err('NO_AI_CLIENT', 'AI client required for semantic search');
    }

    try {
      // Generate embedding for query
      const embedResult = await this.aiClient.embedTexts([query]);
      if (!embedResult.ok) {
        return err('EMBEDDING_ERROR', 'Failed to generate query embedding');
      }

      const queryEmbedding = embedResult.data.embeddings[0];

      // Build aggregation pipeline for vector search
      // Note: This uses Atlas vector search. For local MongoDB, use cosine similarity calculation.
      const pipeline = [];

      // Match stage for filters
      const matchStage = {
        embedding: { $ne: null },
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };
      if (guildId) matchStage.guildId = guildId;
      if (channelId) matchStage.channelId = channelId;

      pipeline.push({ $match: matchStage });

      // For non-Atlas MongoDB, compute cosine similarity manually
      // This is less efficient but works without Atlas
      pipeline.push({
        $addFields: {
          similarity: {
            $let: {
              vars: {
                dotProduct: {
                  $reduce: {
                    input: { $range: [0, { $size: '$embedding' }] },
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        {
                          $multiply: [
                            { $arrayElemAt: ['$embedding', '$$this'] },
                            { $arrayElemAt: [queryEmbedding, '$$this'] },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              in: '$$dotProduct',
            },
          },
        },
      });

      pipeline.push({ $match: { similarity: { $gte: minSimilarity } } });
      pipeline.push({ $sort: { similarity: -1 } });
      pipeline.push({ $limit: limit });

      const messages = await this.db.collection(COLLECTION)
        .aggregate(pipeline)
        .toArray();

      return ok(messages);
    } catch (e) {
      return err('SEMANTIC_SEARCH_ERROR', 'Semantic search failed', e);
    }
  }

  /**
   * Get conversation thread (message and replies).
   * @param {string} messageId - Root message ID
   */
  async getThread(messageId) {
    try {
      // Get the root message
      const rootMessage = await this.db.collection(COLLECTION).findOne({
        messageId,
        optedOut: { $ne: true },
      });

      if (!rootMessage) {
        return ok({ root: null, replies: [] });
      }

      // Find replies to this message
      const replies = await this.db.collection(COLLECTION)
        .find({
          referencedMessageId: messageId,
          optedOut: { $ne: true },
        })
        .sort({ timestamp: 1 })
        .toArray();

      return ok({ root: rootMessage, replies });
    } catch (e) {
      return err('THREAD_ERROR', 'Failed to get thread', e);
    }
  }

  /**
   * Get messages from a specific author.
   * @param {string} authorId - Discord user ID
   * @param {object} options - Query options
   */
  async getByAuthor(authorId, options = {}) {
    const { guildId = null, limit = 100, skip = 0 } = options;

    try {
      const query = {
        authorId,
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };

      if (guildId) query.guildId = guildId;

      const messages = await this.db.collection(COLLECTION)
        .find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      return ok(messages);
    } catch (e) {
      return err('AUTHOR_QUERY_ERROR', 'Failed to query by author', e);
    }
  }

  /**
   * Get messages in a time range.
   * @param {Date} start - Start date
   * @param {Date} end - End date
   * @param {object} options - Query options
   */
  async getByTimeRange(start, end, options = {}) {
    const { guildId = null, channelId = null, limit = 500 } = options;

    try {
      const query = {
        timestamp: { $gte: start, $lte: end },
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };

      if (guildId) query.guildId = guildId;
      if (channelId) query.channelId = channelId;

      const messages = await this.db.collection(COLLECTION)
        .find(query)
        .sort({ timestamp: 1 })
        .limit(limit)
        .toArray();

      return ok(messages);
    } catch (e) {
      return err('TIME_RANGE_ERROR', 'Failed to query by time range', e);
    }
  }

  /**
   * Get channel activity summary.
   * @param {string} channelId - Channel ID
   * @param {number} days - Number of days to analyze
   */
  async getChannelActivity(channelId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const pipeline = [
        {
          $match: {
            channelId,
            timestamp: { $gte: startDate },
            optedOut: { $ne: true },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            },
            messageCount: { $sum: 1 },
            uniqueAuthors: { $addToSet: '$authorId' },
          },
        },
        {
          $project: {
            _id: 0,
            date: '$_id.date',
            messageCount: 1,
            uniqueAuthors: { $size: '$uniqueAuthors' },
          },
        },
        { $sort: { date: 1 } },
      ];

      const activity = await this.db.collection(COLLECTION)
        .aggregate(pipeline)
        .toArray();

      return ok(activity);
    } catch (e) {
      return err('ACTIVITY_ERROR', 'Failed to get channel activity', e);
    }
  }

  /**
   * Get top authors by message count.
   * @param {object} options - Query options
   */
  async getTopAuthors(options = {}) {
    const { guildId = null, channelId = null, days = 30, limit = 10 } = options;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const matchStage = {
        timestamp: { $gte: startDate },
        optedOut: { $ne: true },
      };

      if (guildId) matchStage.guildId = guildId;
      if (channelId) matchStage.channelId = channelId;

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: '$authorId',
            authorName: { $first: '$authorName' },
            authorTag: { $first: '$authorTag' },
            messageCount: { $sum: 1 },
            lastActive: { $max: '$timestamp' },
          },
        },
        { $sort: { messageCount: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            authorId: '$_id',
            authorName: 1,
            authorTag: 1,
            messageCount: 1,
            lastActive: 1,
          },
        },
      ];

      const authors = await this.db.collection(COLLECTION)
        .aggregate(pipeline)
        .toArray();

      return ok(authors);
    } catch (e) {
      return err('TOP_AUTHORS_ERROR', 'Failed to get top authors', e);
    }
  }

  /**
   * Get conversation context for RAG.
   * Combines recent messages with semantically similar historical messages.
   * @param {string} channelId - Channel ID
   * @param {string} query - Current user query
   * @param {object} options - Context options
   */
  async getRAGContext(channelId, query, options = {}) {
    const {
      recentLimit = 10,
      semanticLimit = 5,
      maxTokens = 2000,
    } = options;

    try {
      // Get recent messages
      const recentResult = await this.db.collection(COLLECTION)
        .find({
          channelId,
          optedOut: { $ne: true },
          redacted: { $ne: true },
        })
        .sort({ timestamp: -1 })
        .limit(recentLimit)
        .toArray();

      const recentMessages = recentResult.reverse();

      // Get semantically similar messages if AI client available
      let semanticMessages = [];
      if (this.aiClient && query) {
        const semanticResult = await this.searchSemantic(query, {
          channelId,
          limit: semanticLimit,
          minSimilarity: 0.6,
        });

        if (semanticResult.ok) {
          // Filter out messages already in recent
          const recentIds = new Set(recentMessages.map(m => m.messageId));
          semanticMessages = semanticResult.data.filter(m => !recentIds.has(m.messageId));
        }
      }

      // Combine and format context
      const context = {
        recent: recentMessages.map(m => ({
          author: m.authorName || m.authorTag,
          content: m.cleanContent || m.content,
          timestamp: m.timestamp,
        })),
        relevant: semanticMessages.map(m => ({
          author: m.authorName || m.authorTag,
          content: m.cleanContent || m.content,
          timestamp: m.timestamp,
          similarity: m.similarity,
        })),
      };

      // Estimate token count (rough: 4 chars per token)
      const totalChars = JSON.stringify(context).length;
      const estimatedTokens = Math.ceil(totalChars / 4);

      return ok({
        context,
        estimatedTokens,
        truncated: estimatedTokens > maxTokens,
      });
    } catch (e) {
      return err('RAG_CONTEXT_ERROR', 'Failed to get RAG context', e);
    }
  }

  /**
   * Export messages for training data.
   * @param {object} options - Export options
   */
  async exportForTraining(options = {}) {
    const {
      guildId = null,
      minLength = 20,
      maxLength = 500,
      limit = 5000,
      format = 'jsonl',
    } = options;

    try {
      const query = {
        trainingEligible: true,
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };

      if (guildId) query.guildId = guildId;

      const messages = await this.db.collection(COLLECTION)
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      // Filter by length and format
      const filtered = messages
        .filter(m => {
          const content = m.cleanContent || m.content || '';
          return content.length >= minLength && content.length <= maxLength;
        })
        .map(m => ({
          text: m.cleanContent || m.content,
          author: m.authorName,
          channelId: m.channelId,
          timestamp: m.timestamp.toISOString(),
        }));

      if (format === 'jsonl') {
        const jsonl = filtered.map(item => JSON.stringify(item)).join('\n');
        return ok({ data: jsonl, count: filtered.length, format: 'jsonl' });
      }

      return ok({ data: filtered, count: filtered.length, format: 'json' });
    } catch (e) {
      return err('EXPORT_ERROR', 'Failed to export training data', e);
    }
  }

  /**
   * Get message by ID.
   */
  async getById(messageId) {
    try {
      const message = await this.db.collection(COLLECTION).findOne({
        messageId,
      });

      return ok(message);
    } catch (e) {
      return err('FETCH_ERROR', 'Failed to fetch message', e);
    }
  }

  /**
   * Count messages matching criteria.
   */
  async count(options = {}) {
    const { guildId = null, channelId = null, authorId = null } = options;

    try {
      const query = {
        optedOut: { $ne: true },
        redacted: { $ne: true },
      };

      if (guildId) query.guildId = guildId;
      if (channelId) query.channelId = channelId;
      if (authorId) query.authorId = authorId;

      const count = await this.db.collection(COLLECTION).countDocuments(query);

      return ok({ count });
    } catch (e) {
      return err('COUNT_ERROR', 'Failed to count messages', e);
    }
  }
}

export default MessageArchive;
