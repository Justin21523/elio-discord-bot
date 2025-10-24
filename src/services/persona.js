// src/services/persona.js
// Persona affinity service with cooldowns, multipliers and persona catalog integration.
// This version extends your original logic to read avatar/color/openers/actions
// from the `personas` collection while keeping all previous features intact.

import { withCollection } from "../db/mongo.js";
import { logError } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";

// ---------- Result helpers ----------
function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

// ---------- Defaults (kept from your original) ----------
const DEFAULT_CONFIG = {
  language: "en",
  color: 0x6aa7ff,
  cooldownSec: { joke: 15, gift: 30, help: 20, challenge: 25 },
  multipliers: { joke: 1.0, gift: 1.5, help: 1.2, challenge: 1.3 },
  opener: "Hey there! I’m here—what are we playing today?",
};

const ACTION_DELTA = {
  // Base deltas; final = base * multiplier (fallback if persona.actions is missing)
  joke: { friendship: +2, trust: +1, dependence: 0 },
  gift: { friendship: +3, trust: +2, dependence: +1 },
  help: { friendship: +1, trust: +3, dependence: +1 },
  challenge: { friendship: +1, trust: +1, dependence: +2 },
};

// ---------- Public API ----------

/** Meet: have a persona say hello (via WebhooksService). */
export async function meet({ guildId, channelId, persona }) {
  try {
    const personaKey = persona?.id || persona?.name || "default";

    // Load persona document (avatar/color/openers) — NEW
    const pdoc = await getPersonaDoc(personaKey);

    // Load config (to preserve your tone/cooldowns/colors fallback)
    const cfgRes = await getPersonaConfig({ guildId, persona });
    if (!cfgRes.ok) return cfgRes;
    const cfg = cfgRes.data.config;

    // Pick opener: prefer personas.openers; else fallback to config.opener
    const opener = pickOpener(pdoc?.openers) || cfg.opener || DEFAULT_CONFIG.opener;

    // Speak via webhook with persona's avatar/color if available
    const { personaSay } = await import("./webhooks.js");
    const sayRes = await personaSay(
      channelId,
      // merge persona identity for webhook (use avatarUrl from DB)
      { name: pdoc?.name || personaKey, avatar: pdoc?.avatarUrl || pdoc?.avatar, color: pdoc?.color ?? cfg.color },
      opener,
      { color: pdoc?.color ?? cfg.color, language: cfg.language }
    );
    if (!sayRes.ok) return sayRes;

    incCounter("commands_total", { command: "persona.meet" });
    return ok({
      said: true,
      persona: {
        name: pdoc?.name || personaKey,
        avatar: pdoc?.avatarUrl || pdoc?.avatar || null,
        color: pdoc?.color ?? cfg.color
      },
      opener
    });
  } catch (cause) {
    logError(cause, { guildId, channelId, persona });
    return err("UNKNOWN", "Persona meet failed", cause);
  }
}

/** Act: apply affinity deltas with cooldown & multipliers; base deltas come from persona.actions if present. */
export async function act({ guildId, userId, persona, action }) {
  try {
    const personaId = persona?.id || persona?.name || "default";

    // Cooldown gate (kept)
    const cdRes = await getAndBumpCooldown({ guildId, userId, persona, action });
    if (!cdRes.ok) return cdRes;
    if (cdRes.data.cooldownActive) {
      return err("COOLDOWN_ACTIVE", `Action on cooldown. Wait ${cdRes.data.secondsLeft}s.`, null, { secondsLeft: cdRes.data.secondsLeft });
    }

    // Config for multipliers (kept)
    const cfgRes = await getPersonaConfig({ guildId, persona });
    if (!cfgRes.ok) return cfgRes;
    const multiplier = cfgRes.data.config.multipliers?.[action] ?? 1.0;

    // Load persona document to fetch action deltas if available — NEW
    const pdoc = await getPersonaDoc(personaId);

    // Base deltas precedence: persona.actions[action] -> ACTION_DELTA[action] -> default neutral
    const personaBase = pdoc?.actions?.[action];
    const base = personaBase ?? ACTION_DELTA[action] ?? { friendship: +1, trust: 0, dependence: 0 };

    const delta = {
      friendship: Math.round(Number(base.friendship || 0) * multiplier),
      trust: Math.round(Number(base.trust || 0) * multiplier),
      dependence: Math.round(Number(base.dependence || 0) * multiplier),
    };

    // Apply delta atomically (kept)
    const updated = await withCollection("persona_affinity", async (col) => {
      await col.updateOne(
        { guildId, userId, persona: personaId },
        {
          $setOnInsert: { guildId, userId, persona: personaId, friendship: 0, trust: 0, dependence: 0, createdAt: new Date() },
          $inc: { friendship: delta.friendship, trust: delta.trust, dependence: delta.dependence },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );
      return col.findOne({ guildId, userId, persona: personaId });
    });

    incCounter("commands_total", { command: "persona.act" });
    return ok({
      delta,
      profile: decorate(updated),
      persona: { name: pdoc?.name || personaId, avatar: pdoc?.avatarUrl || pdoc?.avatar || null, color: pdoc?.color ?? cfgRes.data.config.color }
    });
  } catch (cause) {
    logError(cause, { guildId, userId, persona, action });
    return err("DB_ERROR", "Persona act failed", cause);
  }
}


/** Get config (with defaults merged). */
export async function getPersonaConfig({ guildId, persona }) {
  try {
    const key = { guildId, persona: persona?.id || persona?.name || "default" };
    const doc = await withCollection("persona_config", (col) => col.findOne(key));
    const cfg = mergeConfig(doc?.config || {});
    return ok({ config: cfg });
  } catch (cause) {
    return err("DB_ERROR", "Get persona config failed", cause);
  }
}

/** Patch config (admin). */
export async function setPersonaConfig({ guildId, persona, patch }) {
  try {
    const key = { guildId, persona: persona?.id || persona?.name || "default" };
    const now = new Date();
    const merged = mergeConfig(patch);
    await withCollection("persona_config", (col) =>
      col.updateOne(key, { $set: { config: merged, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true })
    );
    incCounter("commands_total", { command: "persona.setConfig" });
    return ok({ config: merged });
  } catch (cause) {
    return err("DB_ERROR", "Set persona config failed", cause);
  }
}

/** Get guild-level persona config (for command compatibility) */
export async function getConfig(guildId) {
  try {
    const doc = await withCollection("guild_config", (col) => col.findOne({ guildId }));
    const config = {
      cooldownSec: doc?.persona?.cooldownSec || 30,
      keywordTriggersEnabled: doc?.keywordTriggersEnabled !== false,
      memoryOptIn: doc?.persona?.memoryOptIn || false,
      multipliers: doc?.persona?.multipliers || { meet: 1.0, help: 1.2, gift: 1.5 }
    };
    return ok(config);
  } catch (cause) {
    return err("DB_ERROR", "Get guild config failed", cause);
  }
}

/** Set guild-level persona config (for command compatibility) */
export async function setConfig(guildId, updates) {
  try {
    const now = new Date();
    const setFields = {};

    // Map updates to nested structure
    Object.keys(updates).forEach(key => {
      if (key === 'keywordTriggersEnabled') {
        setFields[key] = updates[key];
      } else {
        setFields[`persona.${key}`] = updates[key];
      }
    });

    await withCollection("guild_config", (col) =>
      col.updateOne(
        { guildId },
        { $set: { ...setFields, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      )
    );

    incCounter("commands_total", { command: "guild.setConfig" });
    return ok({ updated: Object.keys(updates).length });
  } catch (cause) {
    return err("DB_ERROR", "Set guild config failed", cause);
  }
}

/** Whether keyword triggers are enabled for this guild (default: true). */
export async function keywordTriggersEnabled(guildId) {
  try {
    const doc = await withCollection("guild_config", (c) => c.findOne({ guildId }));
    return ok({ enabled: doc?.keywordTriggersEnabled !== false });
  } catch (cause) {
    return err("DB_ERROR", "Get guild config failed", cause);
  }
}

// ---------- Internals ----------

function decorate(p) {
  return {
    guildId: p.guildId,
    userId: p.userId,
    persona: p.persona,
    friendship: p.friendship ?? 0,
    trust: p.trust ?? 0,
    dependence: p.dependence ?? 0,
    levelHint: affinityLevel((p.friendship ?? 0) + (p.trust ?? 0) + (p.dependence ?? 0)),
    updatedAt: p.updatedAt,
  };
}

function affinityLevel(sum) {
  if (sum >= 60) return "BFF";
  if (sum >= 35) return "close";
  if (sum >= 15) return "friendly";
  return "acquaintance";
}

function mergeConfig(patch = {}) {
  return {
    language: patch.language ?? DEFAULT_CONFIG.language,
    color: patch.color ?? DEFAULT_CONFIG.color,
    opener: patch.opener ?? DEFAULT_CONFIG.opener,
    cooldownSec: { ...DEFAULT_CONFIG.cooldownSec, ...(patch.cooldownSec || {}) },
    multipliers: { ...DEFAULT_CONFIG.multipliers, ...(patch.multipliers || {}) },
  };
}

/** Pick a random opener from array; returns null if not available. */
function pickOpener(openers) {
  if (!Array.isArray(openers) || openers.length === 0) return null;
  return openers[Math.floor(Math.random() * openers.length)];
}

/** Load persona catalog doc by name (enabled only). */
async function getPersonaDoc(name) {
  try {
    const doc = await withCollection("personas", (col) => col.findOne({ name, enabled: { $ne: false } }));
    return doc || null;
  } catch {
    return null; // never break main flow
  }
}

/**
 * Cooldown: return whether still active; if not active, bump `lastAt`.
 * Returns secondsLeft if active.
 */
async function getAndBumpCooldown({ guildId, userId, persona, action }) {
  const key = {
    guildId,
    userId,
    persona: persona?.id || persona?.name || "default",
    action,
  };
  const now = Date.now();

  const cfgRes = await getPersonaConfig({ guildId, persona });
  if (!cfgRes.ok) return cfgRes;
  const cdSec = (cfgRes.data.config.cooldownSec?.[action] ?? DEFAULT_CONFIG.cooldownSec[action]) || 0;

  const doc = await withCollection("persona_cooldowns", (col) => col.findOne(key));
  if (doc?.lastAt) {
    const elapsed = Math.floor((now - new Date(doc.lastAt).getTime()) / 1000);
    if (elapsed < cdSec) {
      return ok({ cooldownActive: true, secondsLeft: cdSec - elapsed });
    }
  }
  await withCollection("persona_cooldowns", (col) =>
    col.updateOne(key, { $set: { lastAt: new Date(now) } }, { upsert: true })
  );
  return ok({ cooldownActive: false, secondsLeft: 0 });
}

// ---------- Command Adapters (for persona command compatibility) ----------

/** Get a single persona by name from the catalog */
export async function getPersona(name) {
  try {
    const doc = await withCollection("personas", (col) =>
      col.findOne({ name, enabled: { $ne: false } })
    );
    if (!doc) {
      return err("NOT_FOUND", `Persona "${name}" not found`);
    }
    return ok(doc);
  } catch (cause) {
    return err("DB_ERROR", "Failed to get persona", cause);
  }
}

/** List all enabled personas */
export async function listPersonas() {
  try {
    const docs = await withCollection("personas", (col) =>
      col.find({ enabled: { $ne: false } }).toArray()
    );
    return ok(docs);
  } catch (cause) {
    return err("DB_ERROR", "Failed to list personas", cause);
  }
}

/** Apply affinity delta (adapter for command usage) */
export async function affinityDelta({ guildId, userId, personaId, delta, action }) {
  try {
    const personaKey = personaId || "default";

    // Apply delta atomically
    const updated = await withCollection("persona_affinity", async (col) => {
      await col.updateOne(
        { guildId, userId, persona: personaKey },
        {
          $setOnInsert: {
            guildId,
            userId,
            persona: personaKey,
            friendship: 0,
            trust: 0,
            dependence: 0,
            createdAt: new Date()
          },
          $inc: {
            friendship: delta.friendship || 0,
            trust: delta.trust || 0,
            dependence: delta.dependence || 0
          },
          $set: { updatedAt: new Date(), lastAction: action },
        },
        { upsert: true }
      );
      return col.findOne({ guildId, userId, persona: personaKey });
    });

    incCounter("persona_affinity_total", { action });
    return ok(decorate(updated));
  } catch (cause) {
    logError(cause, { guildId, userId, personaId, action });
    return err("DB_ERROR", "Affinity delta failed", cause);
  }
}

// Default export for backward compatibility
export default {
  meet,
  act,
  getConfig,
  setConfig,
  getPersonaConfig,
  setPersonaConfig,
  keywordTriggersEnabled,
  getPersona,
  listPersonas,
  affinityDelta,
};
