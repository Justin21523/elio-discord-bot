<<<<<<< HEAD
/**
 * services/mediaRepo.js
 * Media repository service with tag filtering, NSFW checks, and resilient operations.
 * Follows MODULE_INTERFACES.md exactly.
 */

import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";

/**
 * Pick a random enabled media item
 * @param {Object} options
 * @param {boolean} options.nsfwAllowed - Whether NSFW content is allowed
 * @param {string[]} [options.tags] - Optional tag filters (AND logic)
 * @param {string} [options.guildId] - Optional guild context for logging
 * @returns {Promise<{ok: boolean, data?: MediaDoc, error?: AppError}>}
 */
export async function pickRandom({
  nsfwAllowed = false,
  tags = null,
  guildId = null,
}) {
  try {
    const db = getDB();

    // Build query
    const query = {
      enabled: true,
      nsfw: nsfwAllowed ? { $in: [true, false] } : false,
    };

    // Add tag filters if provided (all tags must match)
    if (tags && tags.length > 0) {
      query.tags = { $all: tags };
    }

    // Count matching documents
    const count = await db.collection("media").countDocuments(query);

    if (count === 0) {
      logger.warn("[MediaRepo] No media found matching criteria", {
        nsfwAllowed,
        tags,
        guildId,
      });
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "No media available matching the criteria",
          details: { nsfwAllowed, tags },
        },
      };
    }

    // Pick random document using aggregation
    const result = await db
      .collection("media")
      .aggregate([{ $match: query }, { $sample: { size: 1 } }])
      .toArray();

    if (result.length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Failed to pick random media",
        },
      };
    }

    logger.info("[MediaRepo] Picked random media", {
      mediaId: result[0]._id.toString(),
      type: result[0].type,
      tags: result[0].tags,
      guildId,
    });

    return { ok: true, data: result[0] };
  } catch (error) {
    logger.error("[MediaRepo] pickRandom failed", {
      error: error.message,
      nsfwAllowed,
      tags,
      guildId,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to pick random media",
        cause: error,
      },
    };
  }
}

/**
 * Add new media item
 * @param {Object} params
 * @param {string} params.type - "gif" or "image"
 * @param {string} params.url - Media URL
 * @param {string[]} [params.tags] - Optional tags
 * @param {boolean} [params.nsfw] - Whether content is NSFW (default: false)
 * @param {string} [params.addedByUserId] - User who added this media
 * @returns {Promise<{ok: boolean, data?: {_id: string}, error?: AppError}>}
 */
export async function add({
  type,
  url,
  tags = [],
  nsfw = false,
  addedByUserId = null,
}) {
  try {
    // Validate type
    if (!["gif", "image"].includes(type)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid media type. Must be "gif" or "image"',
        },
      };
    }

    // Validate URL
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Invalid URL format",
        },
      };
    }

    const db = getDB();

    const doc = {
      type,
      url,
      tags: tags || [],
      nsfw: !!nsfw,
      enabled: true,
      addedAt: new Date(),
      addedByUserId,
    };

    const result = await db.collection("media").insertOne(doc);

    logger.info("[MediaRepo] Media added", {
      mediaId: result.insertedId.toString(),
      type,
      tags,
      nsfw,
      addedByUserId,
    });

    return {
      ok: true,
      data: { _id: result.insertedId.toString() },
    };
  } catch (error) {
    logger.error("[MediaRepo] add failed", {
      error: error.message,
      type,
      url,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to add media",
        cause: error,
      },
    };
  }
}

/**
 * Disable media item (soft delete)
 * @param {string} mediaId - Media document ID
 * @returns {Promise<{ok: boolean, data?: {disabled: boolean}, error?: AppError}>}
 */
export async function disable(mediaId) {
  try {
    const db = getDB();
    const { ObjectId } = await import("mongodb");

    const result = await db
      .collection("media")
      .updateOne({ _id: new ObjectId(mediaId) }, { $set: { enabled: false } });

    if (result.matchedCount === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Media not found",
        },
      };
    }

    logger.info("[MediaRepo] Media disabled", { mediaId });

    return { ok: true, data: { disabled: true } };
  } catch (error) {
    logger.error("[MediaRepo] disable failed", {
      error: error.message,
      mediaId,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to disable media",
        cause: error,
      },
    };
  }
}

/**
 * List media with optional filters
 * @param {Object} options
 * @param {boolean} [options.includeDisabled] - Include disabled items
 * @param {string[]} [options.tags] - Filter by tags (OR logic)
 * @param {number} [options.limit] - Max results (default: 50)
 * @param {number} [options.skip] - Skip results for pagination
 * @returns {Promise<{ok: boolean, data?: {items: MediaDoc[], total: number}, error?: AppError}>}
 */
export async function list({
  includeDisabled = false,
  tags = null,
  limit = 50,
  skip = 0,
} = {}) {
  try {
    const db = getDB();

    const query = {};
    if (!includeDisabled) {
      query.enabled = true;
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    const [items, total] = await Promise.all([
      db
        .collection("media")
        .find(query)
        .sort({ addedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection("media").countDocuments(query),
    ]);

    logger.info("[MediaRepo] Listed media", {
      count: items.length,
      total,
      includeDisabled,
      tags,
    });

    return { ok: true, data: { items, total } };
  } catch (error) {
    logger.error("[MediaRepo] list failed", {
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to list media",
        cause: error,
      },
    };
  }
}

/**
 * Get media statistics
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getStats() {
  try {
    const db = getDB();

    const stats = await db
      .collection("media")
      .aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            enabled: {
              $sum: { $cond: ["$enabled", 1, 0] },
            },
            nsfw: {
              $sum: { $cond: ["$nsfw", 1, 0] },
            },
            gifs: {
              $sum: { $cond: [{ $eq: ["$type", "gif"] }, 1, 0] },
            },
            images: {
              $sum: { $cond: [{ $eq: ["$type", "image"] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();

    const result = stats[0] || {
      total: 0,
      enabled: 0,
      nsfw: 0,
      gifs: 0,
      images: 0,
    };

    return { ok: true, data: result };
  } catch (error) {
    logger.error("[MediaRepo] getStats failed", {
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get media statistics",
        cause: error,
      },
    };
  }
=======
// /src/services/mediaRepo.js
// English-only. Media repository for random drops & CRUD.
// Follows MODULE_INTERFACES.md MediaRepo interface.

import { collections } from '../db/mongo.js';
import { logger } from '../util/logger.js';
import metrics, { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';

const log = logger.child({ svc: 'MediaRepo' });

/** Standard error wrapper */
function err(code, message, cause, details) {
  return { ok: false, error: { code, message, cause, details } };
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
}

/** Validate minimal shape for add() */
function validateNewItem(item) {
  if (!item || typeof item !== 'object') return 'item required';
  if (!['gif', 'image'].includes(item.type)) return 'type must be "gif"|"image"';
  if (!item.url || typeof item.url !== 'string' || item.url.length < 5) return 'url invalid';
  return null;
}

export const MediaRepo = {
  /**
   * pickRandom({ nsfwAllowed, tags? })
   * - enabled:true
   * - nsfw filter unless allowed
   * - optional tag intersection
   */
  async pickRandom(filter = { nsfwAllowed: false, tags: undefined }) {
    try {
      const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'media.pickRandom' });
      const q = { enabled: true };
      if (!filter.nsfwAllowed) q.nsfw = { $ne: true };
      if (Array.isArray(filter.tags) && filter.tags.length) {
        q.tags = { $in: filter.tags.map(String) };
      }

      const pipeline = [
        { $match: q },
        { $sample: { size: 1 } },
        { $limit: 1 },
      ];

      const docs = await collections('media').aggregate(pipeline).toArray();
      stop();
      incCounter(METRIC_NAMES.jobs_total, { kind: 'media_pick' }, 1);

      if (!docs || docs.length === 0) return { ok: true, data: null };
      return { ok: true, data: docs[0] };
    } catch (e) {
      log.error('pickRandom failed', { e: String(e) });
      return err('DB_ERROR', 'Failed to pick media', e);
    }
  },

  /** add(item) */
  async add(item) {
    try {
      const v = validateNewItem(item);
      if (v) return err('VALIDATION_FAILED', v);

      const doc = {
        type: item.type,
        url: item.url,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        nsfw: !!item.nsfw,
        enabled: item.enabled !== false,
        addedAt: new Date(),
        addedByUserId: item.addedByUserId ? String(item.addedByUserId) : undefined,
      };

      const res = await collections('media').insertOne(doc);
      incCounter(METRIC_NAMES.jobs_total, { kind: 'media_add' }, 1);
      return { ok: true, data: { insertedId: String(res.insertedId) } };
    } catch (e) {
      // handle duplicate url unique index (if added later)
      return err('DB_ERROR', 'Failed to add media', e);
    }
  },

  /** disable(id) */
  async disable(id) {
    try {
      const { ObjectId } = await import('mongodb');
      const res = await collections('media').updateOne(
        { _id: new ObjectId(String(id)) },
        { $set: { enabled: false, updatedAt: new Date() } }
      );
      return { ok: true, data: { modified: res.modifiedCount > 0 } };
    } catch (e) {
      return err('DB_ERROR', 'Failed to disable media', e);
    }
  },

  /** list({ enabled?, tags?, limit? }) */
  async list(query = {}) {
    try {
      const q = {};
      if (typeof query.enabled === 'boolean') q.enabled = query.enabled;
      if (Array.isArray(query.tags) && query.tags.length) q.tags = { $in: query.tags.map(String) };

      const limit = Number(query.limit || 50);
      const rows = await collections('media')
        .find(q)
        .sort({ addedAt: -1 })
        .limit(limit)
        .toArray();
      return { ok: true, data: rows };
    } catch (e) {
      return err('DB_ERROR', 'Failed to list media', e);
    }
  },
};

export default MediaRepo;
