// Shared HTTP client for AI sidecar. English-only code/comments.
import { CONFIG } from '../../config.js';

const BASE = () => CONFIG.ai.baseUrl.replace(/\/+$/, '');

export async function httpPostJson(path, body, timeoutMs = CONFIG.ai.timeoutMs) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(to);
  }
}

export async function httpPostForm(path, formData, timeoutMs = CONFIG.ai.timeoutMs) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(to);
  }
}

export async function httpGet(path, timeoutMs = CONFIG.ai.timeoutMs) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(`${BASE()}${path}`, { signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(to);
  }
}
