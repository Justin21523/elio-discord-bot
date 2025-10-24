// Shared HTTP client for AI sidecar. English-only code/comments.
import { AI_SERVICE_URL, AI_SERVICE_TIMEOUT_MS } from '../../config.js';

const BASE = () => (AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export async function httpPostJson(path, body, timeoutMs = AI_SERVICE_TIMEOUT_MS) {
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

export async function httpPostForm(path, formData, timeoutMs = AI_SERVICE_TIMEOUT_MS) {
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

export async function httpGet(path, timeoutMs = AI_SERVICE_TIMEOUT_MS) {
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
