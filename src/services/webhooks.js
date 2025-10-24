// /src/services/webhooks.js
// English-only code & comments.
// Resilient webhook sender for persona messages:
// - get or create webhook per channel
// - on send failure (unknown/invalid webhook or missing permissions), recreate once
// - final fallback: channel.send()

import { logger } from "../util/logger.js";

const log = logger.child({ svc: "webhooks" });

let _client = null;
export function setClient(client) { _client = client; }

function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

const WEBHOOK_NAME_PREFIX = "ElioVerse Persona";

async function getOrCreateWebhook(channelId) {
  if (!_client) throw new Error("client not set");
  const ch = await _client.channels.fetch(channelId);
  if (!ch || !ch.isTextBased()) throw new Error("Channel not text-based");

  const all = await ch.fetchWebhooks().catch(() => null);
  const found = all?.find(w => w.name?.startsWith(WEBHOOK_NAME_PREFIX));
  if (found) return found;

  // Create new webhook
  const created = await ch.createWebhook({
    name: `${WEBHOOK_NAME_PREFIX} · ${ch.id}`,
    reason: "Persona speak",
  });
  return created;
}

function isWebhookInvalidError(e) {
  const code = e?.rawError?.code ?? e?.code;
  // 10015: Unknown Webhook, 50027: Invalid Webhook Token, 50013: Missing Permissions
  return code === 10015 || code === 50027 || code === 50013;
}

/**
 * Post a message in persona style via webhook. Fallback to channel.send() on repeated failure.
 * @param {string} channelId
 * @param {{name:string, avatar?:string}} persona
 * @param {{content?:string, embeds?:any[]}} payload
 */
export async function personaSay(channelId, persona, payload) {
  try {
    if (!persona?.name) return err("BAD_REQUEST", "persona.name required");

    // 1st try
    try {
      const wh = await getOrCreateWebhook(channelId);
      await wh.send({
        username: persona.name,
        avatarURL: persona.avatar || undefined,
        content: payload?.content,
        embeds: payload?.embeds || [],
        allowedMentions: { parse: [] },
      });
      return ok({ via: "webhook" });
    } catch (e1) {
      if (!isWebhookInvalidError(e1)) {
        log.error("[ERR] webhook send failed (non-retryable)", { channelId, e: String(e1) });
        throw e1;
      }
      log.warn("[INT] webhook invalid, recreating…", { channelId, code: e1?.rawError?.code || e1?.code });

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
      await wh2.send({
        username: persona.name,
        avatarURL: persona.avatar || undefined,
        content: payload?.content,
        embeds: payload?.embeds || [],
        allowedMentions: { parse: [] },
      });
      return ok({ via: "webhook_recreated" });
    }
  } catch (e2) {
    log.warn("[INT] webhook path failed, falling back to channel.send()", { channelId, e: String(e2) });
    try {
      const ch = await _client.channels.fetch(channelId);
      await ch.send({
        content: payload?.content || `**${persona?.name || "Persona"}**`,
        embeds: payload?.embeds || [],
        allowedMentions: { parse: [] },
      });
      return ok({ via: "fallback_message" });
    } catch (e3) {
      log.error("[ERR] fallback send also failed", { channelId, e: String(e3) });
      return err("DISCORD_API_ERROR", "Failed to send webhook message", e3);
    }
  }
}

// Alias export for backward compatibility
export const sendAsPersona = personaSay;

export default { setClient, personaSay, sendAsPersona };
