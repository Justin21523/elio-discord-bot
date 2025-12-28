// src/services/ai/embeddings.js
// ============================================================================
// Embeddings Service - Text vectorization
// ============================================================================

import { post, get } from "./client.js";
import { logger } from "../../util/logger.js";
import { ErrorCodes } from "../../config.js";

type EmbedOptions = {
  langHint?: string;
  normalize?: boolean;
};

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
 * Generate embeddings for one or more texts
 * @param {Array<string>} texts - Texts to embed
 * @param {object} [options={}] - Embedding options
 * @param {string} [options.langHint] - Language hint (e.g., 'en', 'zh')
 * @param {boolean} [options.normalize] - Whether to normalize vectors (default: true)
 * @returns {Promise<{ok: true, data: {vectors: Array<Array<number>>, dim: number, model: string, count: number}} | {ok: false, error: object}>}
 */
export async function embed(texts: any, options: EmbedOptions = {}): Promise<any> {
  const {
    langHint,
    normalize = true,
  } = options;

  try {
    if (!Array.isArray(texts) || texts.length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "texts must be a non-empty array",
        },
      };
    }

    logger.info("[EMBED] Embedding request", {
      textCount: texts.length,
      langHint,
      normalize,
    });

    const result = await post("/embed/text", {
      texts,
      lang_hint: langHint,
      normalize,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        vectors: result.data.vectors,
        dim: result.data.dim,
        model: result.data.model,
        count: result.data.count,
      },
    };
  } catch (error) {
    logger.error("[EMBED] Embedding error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Embedding generation failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}

/**
 * Get embeddings model information
 * @returns {Promise<{ok: true, data: {model: string, dimension: number, maxLength: number, supportsMultilingual: boolean}} | {ok: false, error: object}>}
 */
export async function getModelInfo(): Promise<any> {
  try {
    logger.info("[EMBED] Getting model info");

    const result = await get("/embed/model-info");

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        model: result.data.model,
        dimension: result.data.dimension,
        maxLength: result.data.max_length,
        supportsMultilingual: result.data.supports_multilingual,
      },
    };
  } catch (error) {
    logger.error("[EMBED] Model info error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Failed to get model info",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}
