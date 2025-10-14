// /src/services/ai/images.js
// English-only code & comments.
//
// Vision-Language (VLM) facade: caption & VQA via AI sidecar.
// Adds image quality analysis / optional enhancement flags.
// All functions return Result<T>.

import { httpPostJson } from './_client.js';
import { CONFIG } from '../../config.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

const VL_OPTS = () => ({
  model: CONFIG.vlm.model,
  enhance_image: CONFIG.vlm.enhanceImage,
  analyze_quality: CONFIG.vlm.analyzeQuality,
});

export async function captionB64(image_b64, max_length = 80, opts = {}) {
  const payload = {
    image_b64,
    max_length,
    options: { ...VL_OPTS(), ...(opts || {}) },
  };

  try {
    const res = await httpPostJson('/images/caption/b64', payload, CONFIG.vlm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'Caption(b64) failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'VLM caption timeout', cause: err } };
  }
}

export async function vqaB64(image_b64, question, max_length = 128, opts = {}) {
  const payload = {
    image_b64,
    question,
    max_length,
    options: { ...VL_OPTS(), process_question: true, ...(opts || {}) },
  };

  try {
    const res = await httpPostJson('/images/vqa/b64', payload, CONFIG.vlm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'VQA(b64) failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'VLM VQA timeout', cause: err } };
  }
}

export async function captionUrl(url, max_length = 80, opts = {}) {
  const payload = { url, max_length, options: { ...VL_OPTS(), ...(opts || {}) } };
  try {
    const res = await httpPostJson('/images/caption/url', payload, CONFIG.vlm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'Caption(url) failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'VLM caption timeout', cause: err } };
  }
}

export async function vqaUrl(url, question, max_length = 128, opts = {}) {
  const payload = { url, question, max_length, options: { ...VL_OPTS(), process_question: true, ...(opts || {}) } };
  try {
    const res = await httpPostJson('/images/vqa/url', payload, CONFIG.vlm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'VQA(url) failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'VLM VQA timeout', cause: err } };
  }
}

/**
 * Convenience wrapper for agent tool: describe an arbitrary image (b64 or url).
 * @param {{image_b64?: string, url?: string, style?: 'balanced'|'detailed'|'creative'}} input
 */
export async function describe(input) {
  const payload = { ...input, options: VL_OPTS() };
  try {
    const res = await httpPostJson('/images/describe', payload, CONFIG.vlm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'Image describe failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'Image describe timeout', cause: err } };
  }
}
