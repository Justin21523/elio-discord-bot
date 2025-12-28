// src/services/ai/llm.js
// ============================================================================
// LLM Service - Text generation using AI service
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";
import { AI_MAX_TOKENS } from "../../config.js";

type GenerateOptions = {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
};

type GenerateParams = GenerateOptions & {
  prompt: string;
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
 * Generate text using LLM
 * @param {object} params
 * @param {string} params.prompt - User prompt
 * @param {string} [params.system] - System prompt
 * @param {number} [params.maxTokens] - Max tokens to generate
 * @param {number} [params.temperature] - Temperature (0.0-2.0)
 * @param {number} [params.topP] - Top-p sampling
 * @param {Array<string>} [params.stop] - Stop sequences
 * @returns {Promise<{ok: true, data: {text: string, tokensUsed: number, usage: object}} | {ok: false, error: object}>}
 */
export async function generate(
  promptOrParams: string | GenerateParams,
  options: GenerateOptions = {}
): Promise<any> {
  const params: GenerateParams =
    typeof promptOrParams === "string"
      ? { prompt: promptOrParams, ...options }
      : promptOrParams;

  const {
    prompt,
    system,
    maxTokens = AI_MAX_TOKENS,
    temperature = 0.7,
    topP = 0.9,
    stop,
  } = params;

  try {
    logger.info("[LLM] Generate request", {
      promptLength: prompt.length || 0,
      systemLength: system?.length || 0,
      maxTokens,
      temperature,
    });

    const result = await post("/llm/generate", {
      prompt,
      system,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stop,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        text: result.data.text,
        tokensUsed: result.data.usage?.total || 0,
        usage: result.data.usage,
        model: result.data.model,
      },
    };
  } catch (error) {
    logger.error("[LLM] Generate error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "LLM generation failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}

/**
 * Generate persona-specific reply
 * @param {object} params
 * @param {string} params.personaName - Name of the persona
 * @param {string} params.context - Conversation context
 * @param {string} params.userMessage - User's message to respond to
 * @param {string} [params.systemStyle] - Additional system style instructions
 * @param {number} [params.maxTokens] - Max tokens to generate
 * @param {number} [params.temperature] - Temperature
 * @returns {Promise<{ok: true, data: {reply: string, persona: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function personaReply(params: any): Promise<any> {
  const {
    personaName,
    context,
    userMessage,
    systemStyle,
    maxTokens = 512,
    temperature = 0.8,
  } = params;

  try {
    logger.info("[LLM] Persona reply request", {
      persona: personaName,
      userMessageLength: userMessage.length,
    });

    const result = await post("/llm/personaReply", {
      persona_name: personaName,
      context,
      user_message: userMessage,
      system_style: systemStyle,
      max_tokens: maxTokens,
      temperature,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        reply: result.data.reply,
        persona: result.data.persona,
        tokensUsed: result.data.tokens?.total || 0,
        usage: result.data.tokens,
        model: result.data.model,
      },
    };
  } catch (error) {
    logger.error("[LLM] Persona reply error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Persona reply generation failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}

/**
 * Summarize news from multiple topics
 * @param {object} params
 * @param {Array<string>} params.topics - Topics to search for
 * @param {string} [params.locale] - Language locale (e.g., 'en', 'zh')
 * @param {number} [params.maxItems] - Maximum items to fetch per topic
 * @param {string} [params.style] - Summary style (e.g., 'concise-bullet', 'detailed')
 * @returns {Promise<{ok: true, data: {items: Array, digest: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function summarizeNews(params: any): Promise<any> {
  const {
    topics,
    locale = "en",
    maxItems = 6,
    style = "concise-bullet",
  } = params;

  try {
    logger.info("[LLM] News summarization request", {
      topics,
      maxItems,
      locale,
    });

    const result = await post("/llm/summarizeNews", {
      topics,
      locale,
      max_items: maxItems,
      style,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        items: result.data.items || [],
        digest: result.data.digest || "",
        tokensUsed: result.data.tokens?.total || 0,
        usage: result.data.tokens,
        model: result.data.model,
      },
    };
  } catch (error) {
    logger.error("[LLM] News summarization error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "News summarization failed",
        details: { cause: getErrorMessage(error) },
      },
    };
  }
}
