// src/services/ai/adapters/vlmAdapter.js
// ============================================================================
// VLM Adapter - Vision-Language Model for image understanding
// Supports: Qwen-VL, LLaVA-Next
// ============================================================================

import {
  AI_SERVICE_URL,
  AI_TIMEOUT_MS,
  AI_MAX_TOKENS,
  AI_MODEL_VLM,
  ErrorCodes,
} from "../../../config.js";
import { logger } from "../../../util/logger.js";

/**
 * @typedef {Object} VLMResponse
 * @property {string} description - Image description
 * @property {string[]} [tags] - Detected tags/labels
 * @property {number} tokensUsed - Tokens used
 * @property {string} model - Model name
 * @property {number} latencyMs - Processing latency
 */

/**
 * Describe an image using VLM
 * @param {string} imageUrl - URL or base64 data URI of the image
 * @param {string} [prompt] - Optional prompt to guide description
 * @returns {Promise<{ok: true, data: VLMResponse} | {ok: false, error: object}>}
 */
export async function describeImage(imageUrl, prompt = "") {
  const startTime = Date.now();

  try {
    logger.info("[AI] VLM image description requested", {
      model: AI_MODEL_VLM,
      hasPrompt: !!prompt,
    });

    const payload = {
      model: AI_MODEL_VLM,
      image_url: imageUrl,
      prompt: prompt || "Describe this image in detail.",
      max_tokens: AI_MAX_TOKENS,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch(`${AI_SERVICE_URL}/v1/vision/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[AI] VLM description failed", {
        status: response.status,
        error: errorText,
      });

      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_MODEL_ERROR,
          message: `VLM description failed: ${response.statusText}`,
          details: { status: response.status, body: errorText },
        },
      };
    }

    const result = await response.json();
    const latencyMs = Date.now() - startTime;

    logger.info("[AI] VLM description succeeded", {
      model: AI_MODEL_VLM,
      tokensUsed: result.tokens_used || 0,
      latencyMs,
    });

    return {
      ok: true,
      data: {
        description: result.description || "",
        tags: result.tags || [],
        tokensUsed: result.tokens_used || 0,
        model: AI_MODEL_VLM,
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error.name === "AbortError") {
      logger.error("[AI] VLM description timeout", { latencyMs });
      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_TIMEOUT,
          message: "VLM description timed out",
          details: { timeoutMs: AI_TIMEOUT_MS },
        },
      };
    }

    logger.error("[AI] VLM description error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "VLM description failed",
        cause: error,
      },
    };
  }
}

/**
 * Generate a reaction/comment for a meme or image
 * @param {string} imageUrl - Image URL or data URI
 * @param {string} [persona] - Optional persona name for styled response
 * @returns {Promise<{ok: true, data: {reaction: string}} | {ok: false, error: object}>}
 */
export async function generateImageReaction(imageUrl, persona = null) {
  const startTime = Date.now();

  try {
    logger.info("[AI] VLM image reaction requested", {
      model: AI_MODEL_VLM,
      persona,
    });

    let prompt =
      "React to this image with a fun, engaging comment. Be witty and brief (1-2 sentences).";

    if (persona) {
      prompt += ` Respond in the style and personality of ${persona}.`;
    }

    const descResult = await describeImage(imageUrl, prompt);

    if (!descResult.ok) {
      return descResult;
    }

    const latencyMs = Date.now() - startTime;

    return {
      ok: true,
      data: {
        reaction: descResult.data.description,
        latencyMs,
      },
    };
  } catch (error) {
    logger.error("[AI] VLM reaction error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "VLM reaction failed",
        cause: error,
      },
    };
  }
}
