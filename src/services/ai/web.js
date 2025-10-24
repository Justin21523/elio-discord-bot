// /src/services/ai/web.js
// English-only code & comments.
//
// Web search tool facade. The AI sidecar is responsible for rate limiting,
// provider routing (Brave/SearXNG), and result normalization.

import { httpGet, httpPostJson } from './_client.js';
import { AI_SERVICE_TIMEOUT_MS } from '../../config.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

export async function search(query, { top = 6 } = {}) {
  const payload = {
    query,
    top,
    provider: 'brave', // Default provider
    cache_ttl: 3600, // 1 hour cache
  };
  try {
    const res = await httpPostJson('/web/search', payload, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web search failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web search unavailable', cause: err } };
  }
}

export async function fetchUrl(url) {
  try {
    const res = await httpGet(`/web/fetch?url=${encodeURIComponent(url)}`, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web fetch failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web fetch unavailable', cause: err } };
  }
}
