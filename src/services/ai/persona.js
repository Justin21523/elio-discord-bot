// Persona compose Facade. English-only.
import { httpPostJson } from './_client.js';

export async function compose(text, persona = { name: 'Elio', style: 'playful, supportive' }, max_length = 180) {
  const res = await httpPostJson('/persona/compose', { text, persona, max_length });
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'Persona compose failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}
