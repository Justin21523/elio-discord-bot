// /src/services/ai/status.js
// English-only code & comments.
//
// Sidecar status facade. Queries /health and normalizes to Result<T>.

import { httpGet } from './_client.js';
import { CONFIG } from '../../config.js';

/**
 * @typedef {{ code: string, message: string, cause?: unknown, details?: Record<string, unknown> }} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

export async function health() {
  try {
    const res = await httpGet('/health', CONFIG.ai.timeoutMs);
    if (res.status >= 400 || !res.json) {
      return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Health check failed', cause: res } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Sidecar not reachable', cause: err } };
  }
}
