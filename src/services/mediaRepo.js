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
}
