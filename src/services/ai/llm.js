// /src/services/ai/llm.js
// English-only code & comments.
//
// LLM adapter facade for the bot. We do not call any model SDKs here;
// we only talk to our AI sidecar (Python) via HTTP. The sidecar selects
// the concrete backend (TGI/vLLM/Ollama/mock) and model according to
// CONFIG and availability.
//
// All exported functions return Result<T> and never throw across module boundaries.

import { httpPostJson } from './_client.js';
import { CONFIG } from '../../config.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

/**
 * Send a chat-style request with messages history.
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {object} opts
 * @returns {Promise<Result>}
 */
export async function chat(messages, opts = {}) {
  const payload = {
    messages,
    adapter: CONFIG.llm.adapter,                // tgi | vllm | ollama | mock
    model: opts.model || CONFIG.llm.model,
    reasoning_model: opts.reasoning_model || CONFIG.llm.reasoningModel || undefined,
    max_new_tokens: opts.max_new_tokens ?? CONFIG.llm.maxNewTokens,
    temperature: opts.temperature ?? CONFIG.llm.temperature,
    top_p: opts.top_p ?? CONFIG.llm.topP,
    top_k: opts.top_k ?? CONFIG.llm.topK,
    stream: Boolean(opts.stream ?? false),      // bot uses non-streaming currently
    safety: {                                   // safety hints (handled in sidecar)
      moderation: true,
      rewrite_toxic: true,
    },
  };

  try {
    const res = await httpPostJson('/llm/chat', payload, CONFIG.llm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'LLM chat failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'LLM chat timed out', cause: err } };
  }
}

/**
 * One-shot text generation without history.
 * @param {string} prompt
 * @param {object} opts
 * @returns {Promise<Result>}
 */
export async function generate(prompt, opts = {}) {
  const payload = {
    prompt,
    adapter: CONFIG.llm.adapter,
    model: opts.model || CONFIG.llm.model,
    max_new_tokens: opts.max_new_tokens ?? 256,
    temperature: opts.temperature ?? CONFIG.llm.temperature,
    top_p: opts.top_p ?? CONFIG.llm.topP,
    top_k: opts.top_k ?? CONFIG.llm.topK,
    repetition_penalty: opts.repetition_penalty ?? 1.1,
    // Optional system prompt to steer outputs for personas
    system_prompt: opts.system_prompt,
    safety: { moderation: true, rewrite_toxic: true },
  };

  try {
    const res = await httpPostJson('/llm/generate', payload, CONFIG.llm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'LLM generate failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'LLM generate timed out', cause: err } };
  }
}
