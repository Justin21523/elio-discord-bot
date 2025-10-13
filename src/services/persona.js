// src/services/persona.js (after applyAction success)
// Service for persona meet/act/stats.

import { collections } from "../db/mongo.js";

function mulDelta(delta, m) {
  return {
    friendship: Math.round((delta.friendship || 0) * m),
    trust: Math.round((delta.trust || 0) * m),
    dependence: Math.round((delta.dependence || 0) * m),
  };
}

export async function applyAction({ guildId, userId, personaName, action }) {
  const { personas, persona_config, persona_affinity } = collections();
  const p = await personas.findOne({
    name: personaName,
    enabled: { $ne: false },
  });
  if (!p) throw new Error(`Persona "${personaName}" not found`);

  const cfg = await persona_config.findOne({ _id: "global" });
  const base = cfg?.actions?.[action];
  if (!base) throw new Error(`Unknown action "${action}"`);

  const cooldownSeconds = Number.isFinite(cfg?.cooldownSeconds)
    ? cfg.cooldownSeconds
    : 180;

  // Ensure affinity doc
  const key = { guildId, userId, personaId: p._id };
  const existing = await persona_affinity.findOne(key);

  // Cooldown
  const now = new Date();
  if (existing?.lastInteractAt) {
    const diffSec = Math.floor((now - existing.lastInteractAt) / 1000);
    if (diffSec < cooldownSeconds) {
      return {
        ok: false,
        message: `Cooldown active. Try again in ${cooldownSeconds - diffSec}s.`,
      };
    }
  }

  // sanitize deltas
  const safe = (n) => (Number.isFinite(n) ? Math.trunc(n) : 0);
  let delta = {
    friendship: safe(base.friendship),
    trust: safe(base.trust),
    dependence: safe(base.dependence),
  };
  for (const m of cfg?.modifiers || []) {
    if (m.persona === p.name && m.action === action) {
      const mul = Number.isFinite(m.multiplier) ? m.multiplier : 1;
      delta = {
        friendship: safe(delta.friendship * mul),
        trust: safe(delta.trust * mul),
        dependence: safe(delta.dependence * mul),
      };
    }
  }

  const res = await persona_affinity.findOneAndUpdate(
    { guildId, userId, personaId: p._id },
    {
      $setOnInsert: {
        guildId,
        userId,
        personaId: p._id,
        createdAt: now,
      },
      $inc: {
        friendship: delta.friendship,
        trust: delta.trust,
        dependence: delta.dependence,
      },
      $set: { lastInteractAt: now },
    },
    { upsert: true, returnDocument: "after" }
  );

  const doc = res.value || (await persona_affinity.findOne(key));
  const reply = [
    `You interacted with **${p.name}** using **${action}**.`,
    `Δ Friendship: ${delta.friendship}, Trust: ${delta.trust}, Dependence: ${delta.dependence}`,
    `Now → Friendship: **${doc.friendship}**, Trust: **${doc.trust}**, Dependence: **${doc.dependence}**`,
  ].join("\n");

  return { ok: true, message: reply };
}
