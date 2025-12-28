/**
 * services/mediaRepo.ts
 * Media repository service with tag filtering, NSFW checks, and resilient operations.
 * Follows MODULE_INTERFACES.md exactly.
 */

import { getDb as getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCodes as ErrorCode } from "../config.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

type AppError = {
  code: (typeof ErrorCode)[keyof typeof ErrorCode] | string;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

type MediaDoc = {
  _id: any;
  type: "gif" | "image" | string;
  url: string;
  tags?: string[];
  nsfw?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
};

/**
 * Pick a random enabled media item
 */
export async function pickRandom({
  nsfwAllowed = false,
  tags = null,
  guildId = null,
}: {
  nsfwAllowed?: boolean;
  tags?: string[] | null;
  guildId?: string | null;
}): Promise<Result<MediaDoc>> {
  try {
    const db = getDB();

    // Build query
    const query: Record<string, any> = {
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
      logger.warn("[MediaRepo] No media found matching criteria", { nsfwAllowed, tags, guildId });
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "No media available matching the criteria",
          details: { nsfwAllowed, tags: tags ?? undefined },
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

    const picked = (result as any[])[0] as any;
    if (!picked) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Failed to pick random media",
        },
      };
    }

    logger.info("[MediaRepo] Picked random media", {
      mediaId: picked._id?.toString?.(),
      type: picked.type,
      tags: picked.tags,
      guildId,
    });

    return { ok: true, data: picked as MediaDoc };
  } catch (error) {
    logger.error("[MediaRepo] pickRandom failed", {
      error: getErrorMessage(error),
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
 */
export async function add({
  type,
  url,
  tags = [],
  nsfw = false,
  addedByUserId = null,
}: {
  type: string;
  url: string;
  tags?: string[];
  nsfw?: boolean;
  addedByUserId?: string | null;
}): Promise<Result<{ _id: string }>> {
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

    return { ok: true, data: { _id: result.insertedId.toString() } };
  } catch (error) {
    logger.error("[MediaRepo] add failed", { error: getErrorMessage(error), type, url });
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
 */
export async function disable(mediaId: string): Promise<Result<{ disabled: boolean }>> {
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
    logger.error("[MediaRepo] disable failed", { error: getErrorMessage(error), mediaId });
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
 */
export async function list({
  includeDisabled = false,
  tags = null,
  limit = 50,
  skip = 0,
}: {
  includeDisabled?: boolean;
  tags?: string[] | null;
  limit?: number;
  skip?: number;
} = {}): Promise<Result<{ items: MediaDoc[]; total: number }>> {
  try {
    const db = getDB();

    const query: Record<string, any> = {};
    if (!includeDisabled) {
      query.enabled = true;
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    const [items, total] = await Promise.all([
      db.collection("media").find(query).sort({ addedAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection("media").countDocuments(query),
    ]);

    logger.info("[MediaRepo] Listed media", { count: items.length, total, includeDisabled, tags });

    return { ok: true, data: { items: items as MediaDoc[], total } };
  } catch (error) {
    logger.error("[MediaRepo] list failed", { error: getErrorMessage(error) });
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
 */
export async function getStats(): Promise<Result<Record<string, unknown>>> {
  try {
    const db = getDB();

    const stats = await db
      .collection("media")
      .aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            enabled: { $sum: { $cond: ["$enabled", 1, 0] } },
            nsfw: { $sum: { $cond: ["$nsfw", 1, 0] } },
            gifs: { $sum: { $cond: [{ $eq: ["$type", "gif"] }, 1, 0] } },
            images: { $sum: { $cond: [{ $eq: ["$type", "image"] }, 1, 0] } },
          },
        },
      ])
      .toArray();

    const result = (stats as any[])[0] || {
      total: 0,
      enabled: 0,
      nsfw: 0,
      gifs: 0,
      images: 0,
    };

    return { ok: true, data: result };
  } catch (error) {
    logger.error("[MediaRepo] getStats failed", { error: getErrorMessage(error) });
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

/** Validate minimal shape for add() */
function validateNewItem(item: any) {
  if (!item || typeof item !== "object") return "item required";
  if (!["gif", "image"].includes(item.type)) return 'type must be "gif"|"image"';
  if (!item.url || typeof item.url !== "string" || item.url.length < 5) return "url invalid";
  return null;
}

/**
 * Execute a media drop - pick and post random media to a channel
 */
export async function executeDrop({
  client,
  channelId,
  guildId,
  nsfwAllowed = false,
}: {
  client: any;
  channelId: string;
  guildId: string;
  nsfwAllowed?: boolean;
}): Promise<Result<{ mediaId: string; url: string; type: string }>> {
  try {
    // Pick random media
    const pickResult = await pickRandom({ nsfwAllowed, guildId });

    if (!pickResult.ok) {
      return pickResult;
    }

    const media = pickResult.data;

    // Get channel
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "Channel not found or not text-based",
        },
      };
    }

    // Post media
    await channel.send({
      content: media.tags && media.tags.length > 0 ? `**Tags**: ${media.tags.join(", ")}` : "",
      files: [media.url],
    });

    logger.info("[MediaRepo] Drop executed successfully", {
      guildId,
      channelId,
      mediaId: media._id?.toString?.(),
      type: media.type,
    });

    return {
      ok: true,
      data: {
        mediaId: media._id?.toString?.() ?? String(media._id ?? ""),
        url: media.url,
        type: media.type,
      },
    };
  } catch (error) {
    logger.error("[MediaRepo] executeDrop failed", { error: getErrorMessage(error), guildId, channelId });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to execute drop",
        cause: error,
      },
    };
  }
}

/**
 * Notify about drop failure
 */
export async function notifyDropFailure({
  client,
  guildId,
  channelId,
  error,
}: {
  client: any;
  guildId: string;
  channelId: string;
  error: { message: string };
}): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send({
        content: `⚠️ **Scheduled drop failed**: ${error.message}\nPlease check media availability or bot permissions.`,
      });
    }
  } catch (notifyError) {
    logger.error("[MediaRepo] Failed to notify about drop failure", {
      error: getErrorMessage(notifyError),
      guildId,
      channelId,
      originalError: error.message,
    });
  }
}

// Legacy default export for backward compatibility
export default {
  pickRandom,
  add,
  disable,
  list,
  getStats,
  executeDrop,
  notifyDropFailure,
};
