/**
 * User Interaction Model
 * Stores bot-user conversations for continuous learning and concept drift mitigation
 */

import { getDb } from '../mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'user_interactions';

/**
 * Schema:
 * {
 *   _id: ObjectId,
 *   guildId: string,
 *   channelId: string,
 *   userId: string,
 *   username: string,
 *   persona: string,
 *   userMessage: string,
 *   botResponse: string,
 *   responseSource: 'personaLogic' | 'llm' | 'rag' | 'fallback',
 *   similarity: number,  // TF-IDF similarity score if applicable
 *   timestamp: Date,
 *   feedback: {
 *     rating: number,    // 1-5 scale (optional)
 *     thumbsUp: boolean, // Positive feedback
 *     thumbsDown: boolean, // Negative feedback
 *     feedbackAt: Date
 *   },
 *   exported: boolean,   // Whether included in training export
 *   exportedAt: Date
 * }
 */

/**
 * Ensure indexes for the collection
 */
export async function ensureIndexes() {
  const db = getDb();
  const col = db.collection(COLLECTION);

  await col.createIndex({ guildId: 1, channelId: 1 });
  await col.createIndex({ persona: 1 });
  await col.createIndex({ timestamp: -1 });
  await col.createIndex({ 'feedback.rating': 1 });
  await col.createIndex({ exported: 1 });
  // TTL index: auto-delete after 180 days if not exported
  await col.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 180 * 24 * 60 * 60, partialFilterExpression: { exported: false } }
  );
}

/**
 * Log a user-bot interaction
 */
export async function logInteraction({
  guildId,
  channelId,
  userId,
  username,
  persona,
  userMessage,
  botResponse,
  responseSource = 'personaLogic',
  similarity = null,
  strategy = null,
}) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const doc = {
    guildId,
    channelId,
    userId,
    username,
    persona,
    userMessage,
    botResponse,
    responseSource,
    similarity,
    strategy,  // ML strategy used (for bandit feedback)
    timestamp: new Date(),
    feedback: {
      rating: null,
      thumbsUp: false,
      thumbsDown: false,
      feedbackAt: null,
    },
    exported: false,
    exportedAt: null,
  };

  const result = await col.insertOne(doc);
  return { ok: true, data: { _id: result.insertedId, id: result.insertedId.toString() } };
}

/**
 * Record user feedback for an interaction
 */
export async function recordFeedback(interactionId, { rating, thumbsUp, thumbsDown }) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const update = {
    $set: {
      'feedback.feedbackAt': new Date(),
    },
  };

  if (rating !== undefined) update.$set['feedback.rating'] = rating;
  if (thumbsUp !== undefined) update.$set['feedback.thumbsUp'] = thumbsUp;
  if (thumbsDown !== undefined) update.$set['feedback.thumbsDown'] = thumbsDown;

  const result = await col.updateOne({ _id: new ObjectId(interactionId) }, update);

  return { ok: result.modifiedCount > 0, data: { modified: result.modifiedCount } };
}

/**
 * Get high-quality interactions for training export
 * Criteria:
 * - Has positive feedback (thumbsUp or rating >= 4)
 * - Not yet exported
 * - Not flagged as negative
 */
export async function getQualityInteractions({ limit = 1000, minRating = 4 } = {}) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const query = {
    exported: false,
    $or: [{ 'feedback.thumbsUp': true }, { 'feedback.rating': { $gte: minRating } }],
    'feedback.thumbsDown': { $ne: true },
  };

  const interactions = await col.find(query).sort({ timestamp: -1 }).limit(limit).toArray();

  return { ok: true, data: interactions };
}

/**
 * Get all unexported interactions (regardless of feedback)
 * Useful for bulk export when feedback is sparse
 */
export async function getUnexportedInteractions({ limit = 5000, persona = null } = {}) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const query = {
    exported: false,
    'feedback.thumbsDown': { $ne: true }, // Exclude explicitly negative
  };

  if (persona) {
    query.persona = persona;
  }

  const interactions = await col.find(query).sort({ timestamp: -1 }).limit(limit).toArray();

  return { ok: true, data: interactions };
}

/**
 * Mark interactions as exported
 */
export async function markExported(interactionIds) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const objectIds = interactionIds.map((id) => new ObjectId(id));

  const result = await col.updateMany(
    { _id: { $in: objectIds } },
    { $set: { exported: true, exportedAt: new Date() } }
  );

  return { ok: true, data: { modified: result.modifiedCount } };
}

/**
 * Get interaction statistics
 */
export async function getStats() {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const pipeline = [
    {
      $group: {
        _id: '$persona',
        total: { $sum: 1 },
        exported: { $sum: { $cond: ['$exported', 1, 0] } },
        thumbsUp: { $sum: { $cond: ['$feedback.thumbsUp', 1, 0] } },
        thumbsDown: { $sum: { $cond: ['$feedback.thumbsDown', 1, 0] } },
        avgRating: { $avg: '$feedback.rating' },
      },
    },
    { $sort: { total: -1 } },
  ];

  const stats = await col.aggregate(pipeline).toArray();

  return { ok: true, data: stats };
}

/**
 * Find recent interaction by userId for feedback lookup
 */
export async function findRecentInteraction(userId, { maxAgeMs = 5 * 60 * 1000 } = {}) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  const cutoff = new Date(Date.now() - maxAgeMs);

  const interaction = await col.findOne(
    { userId, timestamp: { $gte: cutoff } },
    { sort: { timestamp: -1 } }
  );

  return { ok: !!interaction, data: interaction };
}

/**
 * Get interaction by ID
 */
export async function getInteractionById(interactionId) {
  const db = getDb();
  const col = db.collection(COLLECTION);

  try {
    const interaction = await col.findOne({ _id: new ObjectId(interactionId) });
    return { ok: !!interaction, data: interaction };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
