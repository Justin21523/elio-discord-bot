// src/services/ai/adapters/llmAdapter.js
// ============================================================================
// LLM Adapter - Abstracts text generation models
// Supports: DeepSeek, Llama-3.x, Qwen-2.5, Mistral
// Can connect to HuggingFace Inference API or custom microservice
// ============================================================================

import {
  AI_SERVICE_URL,
  AI_TIMEOUT_MS,
  AI_MAX_TOKENS,
  AI_MODEL_TEXT,
  ErrorCodes,
} from "../../../config.js";
import { logger } from "../../../util/logger.js";

/**
 * @typedef {Object} LLMOptions
 * @property {number} [maxTokens] - Max tokens to generate
 * @property {number} [temperature] - Sampling temperature (0-2)
 * @property {number} [topP] - Nucleus sampling parameter
 * @property {string[]} [stopSequences] - Stop sequences
 * @property {string} [systemPrompt] - System prompt
 */

/**
 * @typedef {Object} LLMResponse
 * @property {string} text - Generated text
 * @property {number} tokensUsed - Total tokens used
 * @property {string} model - Model name used
 * @property {number} latencyMs - Generation latency
 */

/**
 * Generate text completion using configured LLM
 * @param {string} prompt - User prompt
 * @param {LLMOptions} [options={}] - Generation options
 * @returns {Promise<{ok: true, data: LLMResponse} | {ok: false, error: object}>}
 */
export async function generateText(prompt, options = {}) {
  const startTime = Date.now();

  try {
    logger.info("[AI] LLM generation requested", {
      model: AI_MODEL_TEXT,
      promptLength: prompt.length,
      options,
    });

    // Prepare request payload
    const payload = {
      model: AI_MODEL_TEXT,
      prompt,
      max_tokens: options.maxTokens || AI_MAX_TOKENS,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      stop_sequences: options.stopSequences || [],
      system_prompt: options.systemPrompt || "",
    };

    // Call AI microservice
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch(`${AI_SERVICE_URL}/v1/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[AI] LLM generation failed", {
        status: response.status,
        error: errorText,
      });

      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_MODEL_ERROR,
          message: `LLM generation failed: ${response.statusText}`,
          details: { status: response.status, body: errorText },
        },
      };
    }

    const result = await response.json();
    const latencyMs = Date.now() - startTime;

    logger.info("[AI] LLM generation succeeded", {
      model: AI_MODEL_TEXT,
      tokensUsed: result.tokens_used || 0,
      latencyMs,
    });

    return {
      ok: true,
      data: {
        text: result.text || "",
        tokensUsed: result.tokens_used || 0,
        model: AI_MODEL_TEXT,
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error.name === "AbortError") {
      logger.error("[AI] LLM generation timeout", { latencyMs });
      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_TIMEOUT,
          message: "LLM generation timed out",
          details: { timeoutMs: AI_TIMEOUT_MS },
        },
      };
    }

    logger.error("[AI] LLM generation error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "LLM generation failed",
        cause: error,
      },
    };
  }
}

/**
 * Generate chat completion with conversation history
 * @param {Array<{role: 'user'|'assistant'|'system', content: string}>} messages
 * @param {LLMOptions} [options={}]
 * @returns {Promise<{ok: true, data: LLMResponse} | {ok: false, error: object}>}
 */
export async function generateChat(messages, options = {}) {
  const startTime = Date.now();

  try {
    logger.info("[AI] LLM chat generation requested", {
      model: AI_MODEL_TEXT,
      messageCount: messages.length,
      options,
    });

    const payload = {
      model: AI_MODEL_TEXT,
      messages,
      max_tokens: options.maxTokens || AI_MAX_TOKENS,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      stop_sequences: options.stopSequences || [],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch(`${AI_SERVICE_URL}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[AI] LLM chat generation failed", {
        status: response.status,
        error: errorText,
      });

      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_MODEL_ERROR,
          message: `LLM chat generation failed: ${response.statusText}`,
          details: { status: response.status, body: errorText },
        },
      };
    }

    const result = await response.json();
    const latencyMs = Date.now() - startTime;

    logger.info("[AI] LLM chat generation succeeded", {
      model: AI_MODEL_TEXT,
      tokensUsed: result.tokens_used || 0,
      latencyMs,
    });

    return {
      ok: true,
      data: {
        text: result.text || "",
        tokensUsed: result.tokens_used || 0,
        model: AI_MODEL_TEXT,
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error.name === "AbortError") {
      logger.error("[AI] LLM chat generation timeout", { latencyMs });
      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_TIMEOUT,
          message: "LLM chat generation timed out",
          details: { timeoutMs: AI_TIMEOUT_MS },
        },
      };
    }

    logger.error("[AI] LLM chat generation error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "LLM chat generation failed",
        cause: error,
      },
    };
  }
}
