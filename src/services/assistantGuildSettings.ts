/**
 * services/assistantGuildSettings.ts
 * Guild-level settings for assistant auto-replies and scene threads.
 * All code/comments in English only.
 */

import { withCollection } from "../db/mongo.js";
import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";

export type AssistantGuildSettings = {
  fullModeWhitelistEnabled: boolean;
  fullModeChannelIds: string[];
  scenesEnabled: boolean;
  sceneAutoArchiveDurationMinutes: number;
};

export const DEFAULT_ASSISTANT_GUILD_SETTINGS: AssistantGuildSettings = {
  fullModeWhitelistEnabled: false,
  fullModeChannelIds: [],
  scenesEnabled: true,
  sceneAutoArchiveDurationMinutes: 1440, // 24h
};

const COLLECTION = "guild_config";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: AssistantGuildSettings; expiresAt: number }>();

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function readSettings(doc: any): AssistantGuildSettings {
  const assistant = doc?.assistant ?? {};
  const fullModeWhitelistEnabled = assistant.fullModeWhitelistEnabled === true;
  const fullModeChannelIds = normalizeStringArray(assistant.fullModeChannelIds);

  const scenesEnabled = assistant.scenesEnabled !== false;
  const rawMinutes = assistant.sceneAutoArchiveDurationMinutes;
  const sceneAutoArchiveDurationMinutes =
    Number.isFinite(rawMinutes) && Number(rawMinutes) > 0
      ? Number(rawMinutes)
      : DEFAULT_ASSISTANT_GUILD_SETTINGS.sceneAutoArchiveDurationMinutes;

  return {
    fullModeWhitelistEnabled,
    fullModeChannelIds,
    scenesEnabled,
    sceneAutoArchiveDurationMinutes,
  };
}

export async function getAssistantGuildSettings(
  guildId: string
): Promise<Result<AssistantGuildSettings>> {
  try {
    if (!guildId) return err("BAD_REQUEST", "guildId is required");

    const cached = cache.get(guildId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return ok(cached.data);

    const doc = await withCollection(COLLECTION, (col) =>
      col.findOne({ guildId: String(guildId) }, { projection: { assistant: 1 } })
    );

    const data = readSettings(doc);
    cache.set(guildId, { data, expiresAt: now + CACHE_TTL_MS });
    return ok(data);
  } catch (cause) {
    return err("DB_ERROR", "Failed to get assistant guild settings", cause);
  }
}

async function writeAssistantPatch(
  guildId: string,
  update: Record<string, unknown>
): Promise<Result<AssistantGuildSettings>> {
  try {
    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId) },
        { $set: { ...update, updatedAt: now }, $setOnInsert: { guildId: String(guildId), createdAt: now } },
        { upsert: true }
      )
    );
    cache.delete(guildId);
    return getAssistantGuildSettings(guildId);
  } catch (cause) {
    return err("DB_ERROR", "Failed to update assistant guild settings", cause);
  }
}

export async function setFullModeWhitelistEnabled(
  guildId: string,
  enabled: boolean
): Promise<Result<AssistantGuildSettings>> {
  return writeAssistantPatch(guildId, { "assistant.fullModeWhitelistEnabled": !!enabled });
}

export async function addFullModeChannel(
  guildId: string,
  channelId: string
): Promise<Result<AssistantGuildSettings>> {
  try {
    if (!guildId || !channelId) return err("BAD_REQUEST", "guildId/channelId is required");
    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId) },
        {
          $addToSet: { "assistant.fullModeChannelIds": String(channelId) },
          $set: { updatedAt: now },
          $setOnInsert: { guildId: String(guildId), createdAt: now },
        },
        { upsert: true }
      )
    );
    cache.delete(guildId);
    return getAssistantGuildSettings(guildId);
  } catch (cause) {
    return err("DB_ERROR", "Failed to add full-mode channel", cause);
  }
}

export async function removeFullModeChannel(
  guildId: string,
  channelId: string
): Promise<Result<AssistantGuildSettings>> {
  try {
    if (!guildId || !channelId) return err("BAD_REQUEST", "guildId/channelId is required");
    const now = new Date();
    await withCollection(COLLECTION, (col) =>
      col.updateOne(
        { guildId: String(guildId) },
        ({ $pull: { "assistant.fullModeChannelIds": String(channelId) }, $set: { updatedAt: now } } as any)
      )
    );
    cache.delete(guildId);
    return getAssistantGuildSettings(guildId);
  } catch (cause) {
    return err("DB_ERROR", "Failed to remove full-mode channel", cause);
  }
}

export async function clearFullModeChannels(
  guildId: string
): Promise<Result<AssistantGuildSettings>> {
  return writeAssistantPatch(guildId, { "assistant.fullModeChannelIds": [] });
}

export async function setScenesEnabled(
  guildId: string,
  enabled: boolean
): Promise<Result<AssistantGuildSettings>> {
  return writeAssistantPatch(guildId, { "assistant.scenesEnabled": !!enabled });
}

export async function setSceneAutoArchiveDurationMinutes(
  guildId: string,
  minutes: number
): Promise<Result<AssistantGuildSettings>> {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return err("VALIDATION_FAILED", "minutes must be a positive number");
  }
  return writeAssistantPatch(guildId, { "assistant.sceneAutoArchiveDurationMinutes": Math.floor(minutes) });
}

export default {
  getAssistantGuildSettings,
  setFullModeWhitelistEnabled,
  addFullModeChannel,
  removeFullModeChannel,
  clearFullModeChannels,
  setScenesEnabled,
  setSceneAutoArchiveDurationMinutes,
};
