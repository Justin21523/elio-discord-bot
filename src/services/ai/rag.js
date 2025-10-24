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
  }
}

/**
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
  const { text, source, guildId, metadata = {}, url } = params;

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
}

/**
 * Delete documents from RAG knowledge base
 * @param {object} params
 * @param {string} [params.docId] - Specific document ID to delete
 * @param {string} [params.source] - Delete all docs from this source
 * @param {string} [params.guildId] - Filter by guild ID
 * @returns {Promise<{ok: true, data: {deletedCount: number}} | {ok: false, error: object}>}
 */
export async function deleteDocuments(params) {
  const { docId, source, guildId } = params;

  try {
    if (!docId && !source && !guildId) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "At least one of docId, source, or guildId is required",
        },
      };
    }

    logger.info("[RAG] Delete request", { docId, source, guildId });

    const result = await post("/rag/delete", {
      doc_id: docId,
      source,
      guild_id: guildId,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        deletedCount: result.data.deleted_count || 0,
      },
    };
  } catch (error) {
    logger.error("[RAG] Delete error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.DB_ERROR,
        message: "Failed to delete documents",
        details: { cause: error.message },
      },
    };
  }
}
