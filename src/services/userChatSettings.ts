/**
 * services/userChatSettings.ts
 * Per-user chat/auto-reply preferences (per guild).
 * All code/comments in English only.
 */

import { withCollection } from "../db/mongo.js";
import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";

export type ChatMode = "off" | "mentions" | "full";

export const DEFAULT_CHAT_MODE: ChatMode = "mentions";

const COLLECTION = "user_chat_settings";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { mode: ChatMode; expiresAt: number }>();

function isChatMode(value: unknown): value is ChatMode {
  return value === "off" || value === "mentions" || value === "full";
}

function makeKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export async function getChatMode(
  guildId: string,
  userId: string
): Promise<Result<{ mode: ChatMode }>> {
  try {
    if (!guildId || !userId) return err("BAD_REQUEST", "guildId/userId is required");

    const key = makeKey(guildId, userId);
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return ok({ mode: cached.mode });
    }

    const doc = await withCollection(COLLECTION, (col) =>
      col.findOne(
        { guildId: String(guildId), userId: String(userId) },
        { projection: { mode: 1 } }
      )
    );

    const mode: ChatMode = isChatMode(doc?.mode) ? doc.mode : DEFAULT_CHAT_MODE;

    cache.set(key, { mode, expiresAt: now + CACHE_TTL_MS });
    return ok({ mode });
  } catch (cause) {
    return err("DB_ERROR", "Failed to get chat mode", cause);
  }
}

export async function setChatMode(
  guildId: string,
  userId: string,
  mode: ChatMode
): Promise<Result<{ mode: ChatMode }>> {
  try {
    if (!guildId || !userId) return err("BAD_REQUEST", "guildId/userId is required");
    if (!isChatMode(mode)) return err("VALIDATION_FAILED", "Invalid chat mode");

    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId), userId: String(userId) },
        {
          $set: { mode, updatedAt: now },
          $setOnInsert: { guildId: String(guildId), userId: String(userId), createdAt: now },
        },
        { upsert: true }
      )
    );

    cache.set(makeKey(guildId, userId), { mode, expiresAt: Date.now() + CACHE_TTL_MS });
    return ok({ mode });
  } catch (cause) {
    return err("DB_ERROR", "Failed to set chat mode", cause);
  }
}

export default {
  getChatMode,
  setChatMode,
};

