// src/services/ai/moderation.js
// ============================================================================
// Moderation Service - Content safety and filtering
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}

/**
 * Scan content for safety issues
 * @param {object} params
 * @param {string} params.content - Content to scan
 * @param {string[]} [params.categories] - Categories to check
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function scan(params: any): Promise<any> {
  const { content, categories } = params;

  try {
    logger.info("[MODERATION] Scan request", {
      contentLength: content.length,
      categories,
    });

    const result = await post("/moderation/scan", {
      content,
      categories,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        flagged: result.data.flagged,
        categories: result.data.categories || [],
        scores: result.data.scores || {},
        action: result.data.action,
      },
    };
  } catch (error) {
    logger.error("[MODERATION] Scan error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Content moderation scan failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}

/**
 * Rewrite content to be safer
 * @param {object} params
 * @param {string} params.content - Content to rewrite
 * @param {string[]} params.flaggedCategories - Categories that were flagged
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function rewrite(params: any): Promise<any> {
  const { content, flaggedCategories } = params;

  try {
    logger.info("[MODERATION] Rewrite request", {
      contentLength: content.length,
      flaggedCategories,
    });

    const result = await post("/moderation/rewrite", {
      content,
      flagged_categories: flaggedCategories,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        rewrittenContent: result.data.rewritten_content,
        changes: result.data.changes || [],
      },
    };
  } catch (error) {
    logger.error("[MODERATION] Rewrite error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Content rewrite failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}

/**
 * Batch scan multiple contents
 * @param {object} params
 * @param {string[]} params.contents - Array of content strings
 * @param {string[]} [params.categories] - Categories to check
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function batchScan(params: any): Promise<any> {
  const { contents, categories } = params;

  try {
    logger.info("[MODERATION] Batch scan request", {
      count: contents.length,
      categories,
    });

    const result = await post("/moderation/batch-scan", {
      contents,
      categories,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        results: result.data.results || [],
        totalFlagged: result.data.total_flagged || 0,
      },
    };
  } catch (error) {
    logger.error("[MODERATION] Batch scan error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Batch moderation scan failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}
