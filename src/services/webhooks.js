// Domain Service: Webhooks-style persona speaking.
// English-only. Uses client to send with persona-prefix (no real webhook yet).

import { EmbedBuilder } from 'discord.js';

let _client = null;
export function setClient(client) { _client = client; }

/** Post using a persona (name/avatar color simulated with embed). */
export async function personaSay(channelId, persona, content) {
  if (!_client) return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'client not attached' } };
  try {
    const ch = await _client.channels.fetch(channelId);
    if (!ch?.isTextBased()) return { ok: false, error: { code: 'BAD_REQUEST', message: 'channel not text-based' } };
    const embed = new EmbedBuilder()
      .setAuthor({ name: persona?.name || 'Persona' })
      .setDescription(content)
      .setColor(persona?.color || 0x00bcd4);
    await ch.send({ embeds: [embed] });
    return { ok: true, data: { posted: true } };
  } catch (e) {
    return { ok: false, error: { code: 'DISCORD_API_ERROR', message: 'failed to post', cause: String(e) } };
  }
}
