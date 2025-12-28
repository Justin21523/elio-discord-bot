// /src/services/webhooks.js
// English-only code & comments.
// Resilient webhook sender for persona messages:
// - get or create webhook per channel
// - on send failure (unknown/invalid webhook or missing permissions), recreate once
// - final fallback: channel.send() with embed for persona appearance
// - DMs and Threads use embed-based fallback (webhooks not supported)

import { logger } from "../util/logger.js";
import { EmbedBuilder, ChannelType } from "discord.js";

const log = logger.child({ svc: "webhooks" });

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; cause?: unknown; details?: unknown } };

type PersonaIdentity = {
  name: string;
  avatar?: string | null;
  avatarUrl?: string | null;
  image?: string | null;
  color?: number | string | null;
};

type PersonaPayload = {
  content?: string;
  embeds?: any[];
  components?: any[];
};

let _client: any = null;
export function setClient(client: any) { _client = client; }

function ok<T>(data: T): Result<T> { return { ok: true, data }; }
function err(code: string, message: string, cause?: unknown, details?: unknown): Result<never> {
  return { ok: false, error: { code, message, cause, details } };
}

const WEBHOOK_NAME_PREFIX = "ElioVerse Persona";

/**
 * Check if a channel supports webhooks
 * Only regular guild text channels support webhooks
 * DMs, Threads, Forum posts, Voice channels, etc. do NOT support webhooks
 */
function channelSupportsWebhooks(channel: any): boolean {
  if (!channel) return false;

  // Webhooks are only supported in:
  // - GUILD_TEXT (0)
  // - GUILD_NEWS (5)
  // - GUILD_FORUM (15) - parent only, not thread posts
  const supportedTypes = [
    ChannelType.GuildText,     // 0
    ChannelType.GuildAnnouncement, // 5 (formerly GuildNews)
  ];

  // Check if it's a guild channel (not DM)
  const isGuildChannel = !!channel.guild;

  // Check if it's NOT a thread
  const isThread = channel.isThread?.() || false;

  return isGuildChannel && supportedTypes.includes(channel.type) && !isThread;
}

async function getOrCreateWebhook(channelId: string): Promise<any> {
  if (!_client) throw new Error("client not set");
  const ch = await _client.channels.fetch(channelId);
  if (!ch || !ch.isTextBased()) throw new Error("Channel not text-based");

  // Check if channel supports webhooks
  if (!channelSupportsWebhooks(ch)) {
    throw new Error("Channel does not support webhooks (DM, Thread, or unsupported type)");
  }

  const all = await ch.fetchWebhooks().catch(() => null);
  const found = all?.find((w: any) => w.name?.startsWith(WEBHOOK_NAME_PREFIX));
  if (found) return found;

  // Create new webhook
  const created = await ch.createWebhook({
    name: `${WEBHOOK_NAME_PREFIX} · ${ch.id}`,
    reason: "Persona speak",
  });
  return created;
}

function isWebhookInvalidError(e: unknown): boolean {
  const eAny = e as any;
  const code = eAny?.rawError?.code ?? eAny?.code;
  // 10015: Unknown Webhook, 50027: Invalid Webhook Token, 50013: Missing Permissions
  return code === 10015 || code === 50027 || code === 50013;
}

/**
 * Post a message in persona style via webhook. Fallback to channel.send() on repeated failure.
 * @param {string} channelId
 * @param {{name:string, avatar?:string}} persona
 * @param {{content?:string, embeds?:any[]}} payload
 */
export async function personaSay(
  channelId: string,
  persona: PersonaIdentity,
  payload: PersonaPayload = {}
): Promise<Result<{ via: string; messageId?: string }>> {
  try {
    if (!persona?.name) return err("BAD_REQUEST", "persona.name required");

    // Get avatar URL - support multiple field names
    const avatarUrl = persona.avatar || persona.avatarUrl || persona.image;

    // 1st try
    try {
      const wh = await getOrCreateWebhook(channelId);
      const sent = await wh.send({
        username: persona.name,
        avatarURL: avatarUrl || undefined,
        content: payload?.content,
        embeds: payload?.embeds || [],
        components: payload?.components || [],
        allowedMentions: { parse: ['users'] },
      });
      return ok({ via: "webhook", messageId: sent?.id });
    } catch (e1: unknown) {
      const e1Any = e1 as any;
      if (!isWebhookInvalidError(e1Any)) {
        log.error("[ERR] webhook send failed (non-retryable)", { channelId, e: String(e1) });
        throw e1;
      }
      log.warn("[INT] webhook invalid, recreating…", { channelId, code: e1Any?.rawError?.code || e1Any?.code });

      // Retry once with a fresh webhook
      const ch = await _client.channels.fetch(channelId);
      const all = await ch.fetchWebhooks().catch(() => null);
      // Try to delete old broken ones
      if (all?.size) {
        for (const w of all.values()) {
          if (w.name?.startsWith(WEBHOOK_NAME_PREFIX)) {
            try { await w.delete("Recreate broken webhook"); } catch {}
          }
        }
      }
      const wh2 = await ch.createWebhook({ name: `${WEBHOOK_NAME_PREFIX} · ${ch.id}`, reason: "Persona recreate" });
      const sent2 = await wh2.send({
        username: persona.name,
        avatarURL: avatarUrl || undefined,
        content: payload?.content,
        embeds: payload?.embeds || [],
        components: payload?.components || [],
        allowedMentions: { parse: ['users'] },
      });
      return ok({ via: "webhook_recreated", messageId: sent2?.id });
    }
  } catch (e2: unknown) {
    log.warn("[INT] webhook path failed, falling back to embed-based message", { channelId, e: String(e2) });
    try {
      const ch = await _client.channels.fetch(channelId);

      // Use embed-based approach to simulate persona appearance
      // This works in DMs, Threads, and channels without webhook permissions
      const fallbackAvatarUrl = persona.avatar || persona.avatarUrl || persona.image;

      // Handle color format (string or number)
      let embedColor = persona.color || 0x5865f2;
      if (typeof embedColor === "string") {
        embedColor = parseInt(embedColor.replace("#", ""), 16);
      }

      const personaEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({
          name: persona.name,
          ...(fallbackAvatarUrl ? { iconURL: fallbackAvatarUrl } : {}),
        });

      // If there's text content, add it to the embed
      if (payload?.content) {
        personaEmbed.setDescription(payload.content);
      }

      // Combine with any existing embeds
      const embeds = [personaEmbed, ...(payload?.embeds || [])];

      // Add thumbnail for more visual presence
      if (fallbackAvatarUrl && !payload?.embeds?.length) {
        personaEmbed.setThumbnail(fallbackAvatarUrl);
      }

      const sent3 = await ch.send({
        embeds,
        components: payload?.components || [],
        allowedMentions: { parse: ['users'] },
      });
      return ok({ via: "embed_fallback", messageId: sent3?.id });
    } catch (e3: unknown) {
      log.error("[ERR] fallback send also failed", { channelId, e: String(e3) });
      return err("DISCORD_API_ERROR", "Failed to send webhook message", e3);
    }
  }
}

// Alias export for backward compatibility
export const sendAsPersona = personaSay;

export default { setClient, personaSay, sendAsPersona, channelSupportsWebhooks };
