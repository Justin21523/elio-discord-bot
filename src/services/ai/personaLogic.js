// Persona logic (non-LLM) client.
import { httpPostJson } from "./_client.js";

export async function reply({ persona, message, history = [], topK = 5, maxLen = 80 }) {
  const res = await httpPostJson("/persona/logic/reply", {
    persona,
    message,
    history,
    top_k: topK,
    max_len: maxLen,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "persona logic failed" } };
  }

  return { ok: true, data: res.json.data };
}

export default { reply };
