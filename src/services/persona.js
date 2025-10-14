// Domain Service: Personas (lightweight, delegates heavy-lifting to AI Facade persona.compose).
// English-only.

import * as AI from './ai/index.js';

const _config = new Map(); // key guildId -> { name, style, memoryOptIn }

export async function getConfig(guildId) {
  return { ok: true, data: _config.get(guildId) || { name: 'Elio', style: 'playful, warm', memoryOptIn: false } };
}

export async function setConfig(guildId, cfg) {
  _config.set(guildId, { ...(_config.get(guildId) || {}), ...cfg });
  return { ok: true, data: _config.get(guildId) };
}

export async function keywordTriggersEnabled(guildId) {
  const cfg = _config.get(guildId) || {};
  return { ok: true, data: !!cfg.keywordTriggersEnabled };
}

export async function meet({ guildId, userId, text }) {
  const cfg = (await getConfig(guildId)).data;
  const res = await AI.persona.compose(text, cfg, 180);
  return res;
}

export async function act({ guildId, userId, text }) {
  const cfg = (await getConfig(guildId)).data;
  const res = await AI.persona.compose(text, cfg, 220);
  return res;
}
