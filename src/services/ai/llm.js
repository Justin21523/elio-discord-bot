<<<<<<< HEAD
// src/services/ai/llm.js
// ============================================================================
// LLM Service - Text generation using AI service
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";
import { AI_MAX_TOKENS } from "../../config.js";

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
export async function generate(params) {
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
      promptLength: prompt?.length || 0,
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
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "LLM generation failed",
        details: { cause: error.message },
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
export async function personaReply(params) {
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
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Persona reply generation failed",
        details: { cause: error.message },
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
export async function summarizeNews(params) {
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
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "News summarization failed",
        details: { cause: error.message },
      },
    };
  }
}

=======
// /src/services/ai/llm.js
// English-only code & comments.
//
// LLM adapter facade for the bot. We do not call any model SDKs here;
// we only talk to our AI sidecar (Python) via HTTP. The sidecar selects
// the concrete backend (TGI/vLLM/Ollama/mock) and model according to
// CONFIG and availability.
//
// All exported functions return Result<T> and never throw across module boundaries.

import { httpPostJson } from './_client.js';
import { CONFIG } from '../../config.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

/**
 * Send a chat-style request with messages history.
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {object} opts
 * @returns {Promise<Result>}
 */
export async function chat(messages, opts = {}) {
  const payload = {
    messages,
    adapter: CONFIG.llm.adapter,                // tgi | vllm | ollama | mock
    model: opts.model || CONFIG.llm.model,
    reasoning_model: opts.reasoning_model || CONFIG.llm.reasoningModel || undefined,
    max_new_tokens: opts.max_new_tokens ?? CONFIG.llm.maxNewTokens,
    temperature: opts.temperature ?? CONFIG.llm.temperature,
    top_p: opts.top_p ?? CONFIG.llm.topP,
    top_k: opts.top_k ?? CONFIG.llm.topK,
    stream: Boolean(opts.stream ?? false),      // bot uses non-streaming currently
    safety: {                                   // safety hints (handled in sidecar)
      moderation: true,
      rewrite_toxic: true,
    },
  };

  try {
    const res = await httpPostJson('/llm/chat', payload, CONFIG.llm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'LLM chat failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'LLM chat timed out', cause: err } };
  }
}

/**
 * One-shot text generation without history.
 * @param {string} prompt
 * @param {object} opts
 * @returns {Promise<Result>}
 */
export async function generate(prompt, opts = {}) {
  const payload = {
    prompt,
    adapter: CONFIG.llm.adapter,
    model: opts.model || CONFIG.llm.model,
    max_new_tokens: opts.max_new_tokens ?? 256,
    temperature: opts.temperature ?? CONFIG.llm.temperature,
    top_p: opts.top_p ?? CONFIG.llm.topP,
    top_k: opts.top_k ?? CONFIG.llm.topK,
    repetition_penalty: opts.repetition_penalty ?? 1.1,
    // Optional system prompt to steer outputs for personas
    system_prompt: opts.system_prompt,
    safety: { moderation: true, rewrite_toxic: true },
  };

  try {
    const res = await httpPostJson('/llm/generate', payload, CONFIG.llm.timeoutMs);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'LLM generate failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'AI_TIMEOUT', message: 'LLM generate timed out', cause: err } };
  }
}
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
