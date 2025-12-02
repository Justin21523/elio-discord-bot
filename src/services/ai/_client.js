// Shared HTTP client for AI sidecar. English-only code/comments.
import { AI_SERVICE_URL, AI_SERVICE_TIMEOUT_MS, AI_MOCK_MODE } from '../../config.js';
import { mockFetch } from './mock.js';

const BASE = () => (AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export async function httpPostJson(path, body, timeoutMs = AI_SERVICE_TIMEOUT_MS) {
  if (AI_MOCK_MODE) {
    return mockFetch(path, body, 'POST');
  }

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
  if (AI_MOCK_MODE) {
    const payload =
      formData && typeof formData.entries === 'function'
        ? Object.fromEntries(formData.entries())
        : {};
    return mockFetch(path, payload, 'POST');
  }

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
  if (AI_MOCK_MODE) {
    return mockFetch(path, {}, 'GET');
  }

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

// Alias for httpGet (returns JSON)
export const httpGetJson = httpGet;
