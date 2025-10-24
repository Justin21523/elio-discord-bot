// RAG admin Facade (docs list/delete, chunks disable, export/import). English-only.
// /src/services/ai/rag_admin.js
// English-only code & comments.
//
// RAG maintenance utilities: export, purge, reindex, etc.
// All functions return Result<T>.

import { httpGet, httpPostJson } from './_client.js';
import { RAG_INDEX_NAME, AI_SERVICE_TIMEOUT_MS } from '../../config.js';

export async function listDocs(namespace) {
  const path = namespace ? `/rag/docs?namespace=${encodeURIComponent(namespace)}` : '/rag/docs';
  const res = await httpGet(path);
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'List docs failed', cause: res.json } };
  }
  return { ok: true, data: res.json.docs ?? [] };
}

export async function deleteDoc(doc_id) {
  const res = await httpPostJson('/rag/delete_doc', { doc_id });
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'Delete doc failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}

export async function disableChunk(chunk_id, disabled = true) {
  const res = await httpPostJson('/rag/disable_chunk', { chunk_id, disabled });
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'Disable chunk failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}

export async function exportIndex() {
  const res = await httpGet('/rag/export');
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Export failed', cause: res.json } };
  }
  return { ok: true, data: res.json.dump };
}

export async function importIndex(dump) {
  const res = await httpPostJson('/rag/import', { dump });
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'Import failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}

/**
 * @typedef {{ code: string, message: string, cause?: unknown, details?: Record<string, unknown> }} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

export async function exportData({ limit = 200, format = 'json' } = {}) {
  const payload = {
    index: { name: RAG_INDEX_NAME, provider: 'atlas' },
    limit, format,
  };
  try {
    const res = await httpPostJson('/rag/export', payload, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DB_ERROR', message: 'RAG export failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Export unavailable', cause: err } };
  }
}

export async function purge({ olderThanDays, source, confirm = false } = {}) {
  const payload = {
    index: { name: RAG_INDEX_NAME, provider: 'atlas' },
    older_than_days: olderThanDays,
    source,
    confirm: Boolean(confirm),
  };
  try {
    const res = await httpPostJson('/rag/purge', payload, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DB_ERROR', message: 'RAG purge failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Purge unavailable', cause: err } };
  }
}