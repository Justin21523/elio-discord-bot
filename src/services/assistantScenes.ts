/**
 * services/assistantScenes.ts
 * Thread-based "scene" tracking for RP / full auto-replies.
 * All code/comments in English only.
 */

import { withCollection } from "../db/mongo.js";
import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";

export type AssistantScene = {
  guildId: string;
  threadId: string;
  parentChannelId?: string | null;
  title?: string | null;
  active: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt?: Date | null;
  endedAt?: Date | null;
  endedByUserId?: string | null;
  recap?: string | null;
  recapStatus?: "pending" | "done" | "failed" | null;
  recapRequestedAt?: Date | null;
  recapAt?: Date | null;
  recapModel?: string | null;
  recapMessageCount?: number | null;
  recapAttempts?: number | null;
  recapError?: string | null;
};

const COLLECTION = "assistant_scenes";

const CACHE_TTL_MS = 60_000;
const activeCache = new Map<string, { active: boolean; expiresAt: number }>();

function makeKey(guildId: string, threadId: string): string {
  return `${guildId}:${threadId}`;
}

export async function isSceneActive(
  guildId: string,
  threadId: string
): Promise<Result<{ active: boolean }>> {
  try {
    if (!guildId || !threadId) return err("BAD_REQUEST", "guildId/threadId is required");

    const key = makeKey(guildId, threadId);
    const now = Date.now();
    const cached = activeCache.get(key);
    if (cached && cached.expiresAt > now) return ok({ active: cached.active });

    const doc = await withCollection(COLLECTION, (col) =>
      col.findOne(
        { guildId: String(guildId), threadId: String(threadId) },
        { projection: { active: 1 } }
      )
    );

    const active = doc?.active === true;
    activeCache.set(key, { active, expiresAt: now + CACHE_TTL_MS });
    return ok({ active });
  } catch (cause) {
    return err("DB_ERROR", "Failed to check scene status", cause);
  }
}

export async function getScene(
  guildId: string,
  threadId: string
): Promise<Result<AssistantScene | null>> {
  try {
    if (!guildId || !threadId) return err("BAD_REQUEST", "guildId/threadId is required");
    const doc = await withCollection(COLLECTION, (col) =>
      col.findOne({ guildId: String(guildId), threadId: String(threadId) })
    );
    return ok((doc ? (doc as unknown as AssistantScene) : null));
  } catch (cause) {
    return err("DB_ERROR", "Failed to get scene", cause);
  }
}

export async function createScene(params: {
  guildId: string;
  threadId: string;
  parentChannelId?: string | null;
  title?: string | null;
  createdByUserId: string;
}): Promise<Result<{ scene: AssistantScene }>> {
  try {
    const { guildId, threadId, parentChannelId, title, createdByUserId } = params;
    if (!guildId || !threadId || !createdByUserId) {
      return err("BAD_REQUEST", "guildId/threadId/createdByUserId is required");
    }

    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId), threadId: String(threadId) },
        {
          $set: {
            active: true,
            parentChannelId: parentChannelId ? String(parentChannelId) : null,
            title: title ? String(title) : null,
            updatedAt: now,
            endedAt: null,
            endedByUserId: null,
            recap: null,
            recapStatus: null,
            recapRequestedAt: null,
            recapAt: null,
            recapModel: null,
            recapMessageCount: null,
            recapAttempts: 0,
            recapError: null,
          },
          $setOnInsert: {
            guildId: String(guildId),
            threadId: String(threadId),
            createdByUserId: String(createdByUserId),
            createdAt: now,
          },
        },
        { upsert: true }
      )
    );

    activeCache.set(makeKey(guildId, threadId), { active: true, expiresAt: Date.now() + CACHE_TTL_MS });

    const sceneRes = await getScene(guildId, threadId);
    if (!sceneRes.ok) return err(sceneRes.error.code, sceneRes.error.message, sceneRes.error.cause);
    if (!sceneRes.data) return err("DB_ERROR", "Failed to load created scene");

    return ok({ scene: sceneRes.data });
  } catch (cause) {
    return err("DB_ERROR", "Failed to create scene", cause);
  }
}

export async function adoptScene(params: {
  guildId: string;
  threadId: string;
  parentChannelId?: string | null;
  title?: string | null;
  adoptedByUserId: string;
}): Promise<Result<{ scene: AssistantScene }>> {
  try {
    const { guildId, threadId, parentChannelId, title, adoptedByUserId } = params;
    if (!guildId || !threadId || !adoptedByUserId) {
      return err("BAD_REQUEST", "guildId/threadId/adoptedByUserId is required");
    }

    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId), threadId: String(threadId) },
        {
          $set: {
            active: true,
            parentChannelId: parentChannelId ? String(parentChannelId) : null,
            title: title ? String(title) : null,
            createdByUserId: String(adoptedByUserId),
            createdAt: now,
            updatedAt: now,
            endedAt: null,
            endedByUserId: null,
            recap: null,
            recapStatus: null,
            recapRequestedAt: null,
            recapAt: null,
            recapModel: null,
            recapMessageCount: null,
            recapAttempts: 0,
            recapError: null,
          },
        },
        { upsert: true }
      )
    );

    activeCache.set(makeKey(guildId, threadId), { active: true, expiresAt: Date.now() + CACHE_TTL_MS });

    const sceneRes = await getScene(guildId, threadId);
    if (!sceneRes.ok) return err(sceneRes.error.code, sceneRes.error.message, sceneRes.error.cause);
    if (!sceneRes.data) return err("DB_ERROR", "Failed to load adopted scene");

    return ok({ scene: sceneRes.data });
  } catch (cause) {
    return err("DB_ERROR", "Failed to adopt scene", cause);
  }
}

export async function endScene(params: {
  guildId: string;
  threadId: string;
  endedByUserId: string;
}): Promise<Result<{ ended: boolean }>> {
  try {
    const { guildId, threadId, endedByUserId } = params;
    if (!guildId || !threadId || !endedByUserId) {
      return err("BAD_REQUEST", "guildId/threadId/endedByUserId is required");
    }

    const now = new Date();
    const res = await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId), threadId: String(threadId), active: true },
        {
          $set: {
            active: false,
            endedAt: now,
            endedByUserId: String(endedByUserId),
            updatedAt: now,
            recapStatus: "pending",
            recapRequestedAt: now,
            recapError: null,
          },
          $inc: { recapAttempts: 1 },
        }
      )
    );

    const ended = (res?.modifiedCount ?? 0) > 0;
    activeCache.set(makeKey(guildId, threadId), { active: false, expiresAt: Date.now() + CACHE_TTL_MS });
    return ok({ ended });
  } catch (cause) {
    return err("DB_ERROR", "Failed to end scene", cause);
  }
}

export async function listActiveScenes(
  guildId: string,
  limit = 10
): Promise<Result<{ scenes: AssistantScene[] }>> {
  try {
    if (!guildId) return err("BAD_REQUEST", "guildId is required");

    const scenes = await withCollection(COLLECTION, (col) =>
      col
        .find({ guildId: String(guildId), active: true })
        .sort({ createdAt: -1 })
        .limit(Math.max(1, Math.min(200, limit)))
        .toArray()
    );

    return ok({ scenes: (scenes as unknown as AssistantScene[]) ?? [] });
  } catch (cause) {
    return err("DB_ERROR", "Failed to list scenes", cause);
  }
}

export async function listScenesNeedingRecap(
  guildId: string,
  limit = 10
): Promise<Result<{ scenes: AssistantScene[] }>> {
  try {
    if (!guildId) return err("BAD_REQUEST", "guildId is required");

    const MAX_ATTEMPTS = 3;
    const scenes = await withCollection(COLLECTION, (col) =>
      col
        .find({
          guildId: String(guildId),
          active: false,
          endedAt: { $ne: null },
          $and: [
            {
              $or: [
                { recapStatus: "pending" },
                { recapStatus: "failed" },
                { recapStatus: { $exists: false } },
                { recapStatus: null },
              ],
            },
            {
              $or: [
                { recapAttempts: { $lt: MAX_ATTEMPTS } },
                { recapAttempts: { $exists: false } },
                { recapAttempts: null },
              ],
            },
          ],
        })
        .sort({ endedAt: -1 })
        .limit(Math.max(1, Math.min(50, limit)))
        .toArray()
    );

    return ok({ scenes: (scenes as unknown as AssistantScene[]) ?? [] });
  } catch (cause) {
    return err("DB_ERROR", "Failed to list scenes needing recap", cause);
  }
}

export async function bumpSceneRecapAttempt(params: {
  guildId: string;
  threadId: string;
}): Promise<Result<{ attempts: number }>> {
  try {
    const { guildId, threadId } = params;
    if (!guildId || !threadId) return err("BAD_REQUEST", "guildId/threadId is required");

    const now = new Date();
    const res = await withCollection(COLLECTION, (col) =>
      col.findOneAndUpdate(
        { guildId: String(guildId), threadId: String(threadId), recapStatus: { $ne: "done" } },
        {
          $inc: { recapAttempts: 1 },
          $set: { recapStatus: "pending", recapRequestedAt: now, updatedAt: now },
        },
        { returnDocument: "after" }
      )
    );

    const attempts = Number(res?.recapAttempts ?? 0);
    return ok({ attempts: Number.isFinite(attempts) ? attempts : 0 });
  } catch (cause) {
    return err("DB_ERROR", "Failed to bump scene recap attempt", cause);
  }
}

export async function setSceneRecap(params: {
  guildId: string;
  threadId: string;
  recap: string;
  messageCount: number;
  model?: string | null;
}): Promise<Result<{ saved: boolean }>> {
  try {
    const { guildId, threadId, recap, messageCount, model } = params;
    if (!guildId || !threadId) return err("BAD_REQUEST", "guildId/threadId is required");
    if (!recap) return err("VALIDATION_FAILED", "recap is required");

    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId), threadId: String(threadId) },
        {
          $set: {
            recap: String(recap),
            recapStatus: "done",
            recapAt: now,
            recapModel: model ? String(model) : null,
            recapMessageCount: Number.isFinite(messageCount) ? Math.max(0, Math.floor(messageCount)) : 0,
            recapError: null,
            updatedAt: now,
          },
        }
      )
    );
    return ok({ saved: true });
  } catch (cause) {
    return err("DB_ERROR", "Failed to save scene recap", cause);
  }
}

export async function markSceneRecapFailed(params: {
  guildId: string;
  threadId: string;
  errorMessage: string;
}): Promise<Result<{ saved: boolean }>> {
  try {
    const { guildId, threadId, errorMessage } = params;
    if (!guildId || !threadId) return err("BAD_REQUEST", "guildId/threadId is required");

    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId), threadId: String(threadId) },
        {
          $set: {
            recapStatus: "failed",
            recapError: String(errorMessage || "Unknown error"),
            updatedAt: now,
          },
        }
      )
    );
    return ok({ saved: true });
  } catch (cause) {
    return err("DB_ERROR", "Failed to mark scene recap failed", cause);
  }
}

export default {
  isSceneActive,
  getScene,
  createScene,
  adoptScene,
  endScene,
  listActiveScenes,
  listScenesNeedingRecap,
  bumpSceneRecapAttempt,
  setSceneRecap,
  markSceneRecapFailed,
};
