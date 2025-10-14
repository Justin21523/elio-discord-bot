// /src/services/ai/rag.js
// English-only code & comments.
//
// Retrieval facade. JS selects sensible defaults (hybrid + MMR).
// The AI sidecar implements Atlas Vector Search (primary) and FAISS fallback.
// All exported functions return Result<T>.

import { httpPostJson } from './_client.js';
import { CONFIG } from '../../config.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

export async function upsertText(text, metadata = {}, doc_id = undefined) {
  // Keep for backward compatibility; delegate to dataset.js under the hood in sidecar.
  const payload = {
    text, doc_id, metadata,
    chunk: { size: CONFIG.rag.chunkSize, overlap: CONFIG.rag.chunkOverlap },
    embed: { model: CONFIG.embeddings.model, dim: CONFIG.embeddings.dim, normalize: true },
    index: { name: CONFIG.rag.indexName, provider: CONFIG.rag.provider },
  };
  try {
    const res = await httpPostJson('/rag/upsert_text', payload, CONFIG.embeddings.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DB_ERROR', message: 'RAG upsert failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Sidecar unreachable for rag upsert', cause: err } };
  }
}

/**
 * Semantic/Hybrid search with MMR and optional rerank.
 * @param {string} query
 * @param {{ mode?: 'hybrid'|'semantic'|'bm25'|'cosine', top_k?: number, alpha?: number, provider?: 'atlas'|'faiss' }} opts
 */
export async function searchQuery(query, opts = {}) {
  const payload = {
    query,
    mode: (opts.mode || CONFIG.rag.defaultMode),
    top_k: Number.isFinite(opts.top_k) ? opts.top_k : CONFIG.rag.topK,
    alpha: Number.isFinite(opts.alpha) ? opts.alpha : CONFIG.rag.mmrAlpha,
    provider: opts.provider || CONFIG.rag.provider,
    index: { name: CONFIG.rag.indexName },
    embed: { model: CONFIG.embeddings.model, dim: CONFIG.embeddings.dim },
    rerank: { enabled: true, top_k: Math.max(CONFIG.rag.topK, 50) },
  };

  try {
    const res = await httpPostJson('/rag/search', payload, CONFIG.embeddings.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      // Standardized error when nothing was retrieved
      const code = res.json?.error?.code || 'RAG_EMPTY';
      return { ok: false, error: { code, message: 'RAG search failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'RAG search unavailable', cause: err } };
  }
}

/**
 * Full RAG answer (retrieve -> synthesize). The sidecar decides Atlas VS vs FAISS,
 * and when Atlas is unavailable it falls back to a cosine-faiss pipeline.
 * @param {string} question
 * @param {{ top_k?: number, mode?: 'hybrid'|'semantic'|'bm25'|'cosine', advanced?: boolean }} opts
 */
export async function answer(question, { top_k = 8, mode = 'advanced' } = {}) {
  const payload = {
    question,
    top_k,
    mode: mode === 'advanced' ? CONFIG.rag.defaultMode : mode, // 'advanced' maps to configured default
    provider: CONFIG.rag.provider,
    index: { name: CONFIG.rag.indexName },
    embed: { model: CONFIG.embeddings.model, dim: CONFIG.embeddings.dim },
    rerank: { enabled: true, top_k: Math.max(CONFIG.rag.topK, 50) },
    synthesize: { // LLM synthesis hints
      model: CONFIG.llm.model,
      temperature: CONFIG.llm.temperature,
      cite_sources: true,
    },
  };

  try {
    const res = await httpPostJson('/rag/answer', payload, Math.max(CONFIG.llm.timeoutMs, 45000));
    if (res.status >= 400 || !res.json?.ok) {
      const code = res.json?.error?.code || 'AI_MODEL_ERROR';
      return { ok: false, error: { code, message: 'RAG answer failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'RAG answer unavailable', cause: err } };
  }
}
