<<<<<<< HEAD
// src/services/ai/rag.js
// ============================================================================
// RAG Service - Retrieval-Augmented Generation
// Integrates with Python AI service for RAG operations
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";
import { RAG_TOP_K, RAG_MIN_SCORE, ErrorCodes } from "../../config.js";

/**
 * Search for relevant documents using RAG
 * @param {object} params
 * @param {string} params.query - Search query
 * @param {string} [params.guildId] - Filter by guild ID
 * @param {number} [params.topK] - Number of results to return
 * @param {number} [params.mmrLambda] - MMR diversity parameter (0-1)
 * @param {boolean} [params.generateAnswer] - Whether to generate an answer
 * @returns {Promise<{ok: true, data: {hits: Array, answer: string, citations: Array, query: string, totalHits: number}} | {ok: false, error: object}>}
 */
export async function search(params) {
  const {
    query,
    guildId,
    topK = RAG_TOP_K,
    mmrLambda = 0.3,
    generateAnswer = true,
  } = params;

  try {
    logger.info("[RAG] Search request", {
      query: query.substring(0, 100),
      guildId,
      topK,
      generateAnswer,
    });

    const result = await post("/rag/search", {
      query,
      guild_id: guildId,
      top_k: topK,
      mmr_lambda: mmrLambda,
      generate_answer: generateAnswer,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        hits: result.data.hits || [],
        answer: result.data.answer,
        citations: result.data.citations || [],
        query: result.data.query,
        totalHits: result.data.total_hits || 0,
      },
    };
  } catch (error) {
    logger.error("[RAG] Search error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "RAG search failed",
        details: { cause: error.message },
      },
    };
=======
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
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
  }
}

/**
<<<<<<< HEAD
 * Insert a document into RAG knowledge base
 * @param {object} params
 * @param {string} params.text - Document text content
 * @param {string} params.source - Source/title of the document
 * @param {string} [params.guildId] - Guild ID for filtering
 * @param {object} [params.metadata] - Additional metadata
 * @param {string} [params.url] - Optional URL reference
 * @returns {Promise<{ok: true, data: {docId: string, source: string}} | {ok: false, error: object}>}
 */
export async function insert(params) {
  const {
    text,
    source,
    guildId,
    metadata = {},
    url,
  } = params;

  try {
    if (!text || !source) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "text and source are required",
        },
      };
    }

    logger.info("[RAG] Insert request", {
      textLength: text.length,
      source,
      guildId,
    });

    const result = await post("/rag/insert", {
      text,
      source,
      guild_id: guildId,
      metadata,
      url,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        docId: result.data.doc_id,
        source: result.data.source,
      },
    };
  } catch (error) {
    logger.error("[RAG] Insert error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.DB_ERROR,
        message: "Failed to insert document",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Add a document to the RAG knowledge base (alias for insert)
 * @param {object} params
 * @returns {Promise<{ok: true, data: {id: string}} | {ok: false, error: object}>}
 */
export async function addDocument(params) {
  const result = await insert({
    text: params.content,
    source: params.metadata?.title || "Untitled",
    guildId: params.guildId,
    metadata: params.metadata,
    url: params.metadata?.url,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      id: result.data.docId,
    },
  };
=======
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
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
}
