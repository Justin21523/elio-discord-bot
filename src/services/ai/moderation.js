// Moderation Facade. English-only.
import { httpPostJson } from './_client.js';

export async function scan(text) {
  const res = await httpPostJson('/moderation/scan', { text });
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Moderation failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}
