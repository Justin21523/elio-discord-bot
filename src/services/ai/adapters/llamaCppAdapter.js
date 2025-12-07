// src/services/ai/adapters/llamaCppAdapter.js
// ============================================================================
// llama.cpp Adapter - Connects to llama.cpp server for local LLM inference
// Supports: Mistral, Llama, Qwen, and other GGUF models
// ============================================================================

import { logger } from "../../../util/logger.js";

// ============================================================================
// Elio Persona System Prompt (Prompt Engineering for Character Roleplay)
// ============================================================================
// Default fallback prompt for Elio (used if persona has no system_prompt)
const ELIO_SYSTEM_PROMPT = `You are Elio Solis, an 11-year-old boy who was mistakenly chosen as Earth's ambassador to the Communiverse.

PERSONALITY: Curious, friendly, enthusiastic about space. Use words like "cosmic", "wow", "cool!"

RULES:
1. First person only (I, me, my) - you ARE Elio
2. Keep responses SHORT - 1-2 sentences max
3. Be casual and fun, like chatting on Discord
4. Use emojis sometimes 🌟
5. Match the vibe - casual question = casual answer`;

/**
 * Discord chat style wrapper - makes any persona feel more casual
 * @param {string} personaPrompt - The persona's original system prompt
 * @param {string} personaName - The persona's name
 * @returns {string} - Enhanced prompt for Discord chat
 */
function wrapForDiscordChat(personaPrompt, personaName) {
  return `${personaPrompt}

---
DISCORD CHAT STYLE (IMPORTANT):
You're chatting casually on Discord. Keep it light and fun!
- Reply in 1-2 SHORT sentences (under 40 words total)
- Be conversational, not formal - like texting a friend
- You can use emojis occasionally
- Match the user's energy - casual = casual, excited = excited
- Can chat about ANY topic - games, food, life, random stuff
- Don't lecture or give long explanations
- If asked something you don't know, just say "idk" or "not sure lol"`;
}
import {
  ErrorCodes,
  LLAMA_SERVER_URL,
  LLAMA_TIMEOUT_MS,
  USE_LLAMA_SERVER,
} from "../../../config.js";

/**
 * @typedef {Object} LlamaOptions
 * @property {number} [maxTokens] - Max tokens to generate (n_predict)
 * @property {number} [temperature] - Sampling temperature (0-2)
 * @property {number} [topP] - Nucleus sampling parameter
 * @property {number} [topK] - Top-K sampling
 * @property {string[]} [stop] - Stop sequences
 * @property {boolean} [stream] - Stream responses (not supported yet)
 */

/**
 * @typedef {Object} LlamaResponse
 * @property {string} text - Generated text
 * @property {number} tokensEvaluated - Prompt tokens
 * @property {number} tokensPredicted - Generated tokens
 * @property {number} latencyMs - Generation latency
 */

/**
 * Check if llama.cpp server is enabled and configured
 * @returns {boolean}
 */
export function isLlamaEnabled() {
  return USE_LLAMA_SERVER && LLAMA_SERVER_URL;
}

/**
 * Get the llama.cpp server URL
 * @returns {string}
 */
export function getLlamaServerUrl() {
  return LLAMA_SERVER_URL;
}

/**
 * Generate text completion using llama.cpp server
 * @param {string} prompt - Full prompt text
 * @param {LlamaOptions} [options={}] - Generation options
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function generateWithLlama(prompt, options = {}) {
  const startTime = Date.now();

  if (!isLlamaEnabled()) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "llama.cpp server is not enabled. Set USE_LLAMA_SERVER=true",
      },
    };
  }

  try {
    logger.info("[LLAMA] Generation requested", {
      serverUrl: LLAMA_SERVER_URL,
      promptLength: prompt.length,
      options: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    // Prepare request payload for llama.cpp /completion endpoint
    const payload = {
      prompt,
      n_predict: options.maxTokens || 512,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      top_k: options.topK ?? 40,
      stop: options.stop || ["</s>", "User:", "\n\nUser:", "Human:"],
      repeat_penalty: 1.1,
      // Disable streaming for now
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLAMA_TIMEOUT_MS);

    const response = await fetch(`${LLAMA_SERVER_URL}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[LLAMA] Generation failed", {
        status: response.status,
        error: errorText,
      });

      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_MODEL_ERROR,
          message: `llama.cpp generation failed: ${response.statusText}`,
          details: { status: response.status, body: errorText },
        },
      };
    }

    const result = await response.json();
    const latencyMs = Date.now() - startTime;

    logger.info("[LLAMA] Generation succeeded", {
      tokensEvaluated: result.tokens_evaluated,
      tokensPredicted: result.tokens_predicted,
      latencyMs,
      generationSpeed: result.tokens_predicted
        ? (result.tokens_predicted / (latencyMs / 1000)).toFixed(1) + " tok/s"
        : "N/A",
    });

    return {
      ok: true,
      data: {
        text: result.content || "",
        tokensEvaluated: result.tokens_evaluated || 0,
        tokensPredicted: result.tokens_predicted || 0,
        tokensUsed: (result.tokens_evaluated || 0) + (result.tokens_predicted || 0),
        model: result.model || "llama.cpp",
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error.name === "AbortError") {
      logger.error("[LLAMA] Generation timeout", { latencyMs, timeoutMs: LLAMA_TIMEOUT_MS });
      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_TIMEOUT,
          message: "llama.cpp generation timed out",
          details: { timeoutMs: LLAMA_TIMEOUT_MS },
        },
      };
    }

    // Check if server is unreachable
    if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
      logger.error("[LLAMA] Server unreachable", {
        serverUrl: LLAMA_SERVER_URL,
        error: error.message,
      });
      return {
        ok: false,
        error: {
          code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
          message: `llama.cpp server unreachable at ${LLAMA_SERVER_URL}`,
          details: { serverUrl: LLAMA_SERVER_URL },
        },
      };
    }

    logger.error("[LLAMA] Generation error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "llama.cpp generation failed",
        cause: error,
      },
    };
  }
}

/**
 * Generate chat completion with conversation history
 * Converts messages array to a single prompt for llama.cpp
 * @param {Array<{role: 'user'|'assistant'|'system', content: string}>} messages
 * @param {LlamaOptions} [options={}]
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function chatWithLlama(messages, options = {}) {
  // Convert chat messages to a single prompt
  // Using Mistral/Llama chat template format
  let prompt = "";

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        prompt += `<s>[INST] <<SYS>>\n${msg.content}\n<</SYS>>\n\n`;
        break;
      case "user":
        if (prompt.includes("[INST]")) {
          prompt += `${msg.content} [/INST]`;
        } else {
          prompt += `<s>[INST] ${msg.content} [/INST]`;
        }
        break;
      case "assistant":
        prompt += ` ${msg.content}</s>`;
        break;
    }
  }

  // If last message was user, we're waiting for assistant response
  // Make sure prompt ends correctly
  if (messages[messages.length - 1]?.role === "user" && !prompt.endsWith("[/INST]")) {
    prompt += " [/INST]";
  }

  return generateWithLlama(prompt, options);
}

/**
 * Check llama.cpp server health
 * @returns {Promise<{ok: boolean, model?: string, status?: string}>}
 */
export async function checkLlamaHealth() {
  if (!isLlamaEnabled()) {
    return { ok: false, status: "disabled" };
  }

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: true,
        status: data.status || "ok",
        model: data.model_name || "unknown",
      };
    }

    return { ok: false, status: `HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      status: error.code === "ECONNREFUSED" ? "unreachable" : error.message,
    };
  }
}

/**
 * Get server slots/queue info (if available)
 * @returns {Promise<object|null>}
 */
export async function getLlamaSlots() {
  if (!isLlamaEnabled()) return null;

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/slots`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Persona Character Reply Generation (Prompt Engineering)
// ============================================================================

/**
 * Generate a reply as a specific persona using prompt engineering
 * Uses the persona's system_prompt from the database/JSON
 * @param {string} userMessage - The user's message
 * @param {object} persona - The persona object with system_prompt
 * @param {Array<{role: 'user'|'assistant', content: string}>} [conversationHistory=[]] - Recent conversation history
 * @param {object} [options={}] - Additional options
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function generatePersonaReply(userMessage, persona, conversationHistory = [], options = {}) {
  // Use persona's system_prompt if available, otherwise use Elio default
  const basePrompt = persona?.system_prompt || ELIO_SYSTEM_PROMPT;
  const personaName = persona?.name || "Elio";

  // Wrap with Discord casual chat style for ALL personas
  const systemPrompt = wrapForDiscordChat(basePrompt, personaName);

  // Build Mistral chat format prompt with system prompt
  let prompt = `<s>[INST] <<SYS>>
${systemPrompt}
<</SYS>>

`;

  // Add conversation history (last 5 messages for context)
  const recentHistory = conversationHistory.slice(-5);

  for (let i = 0; i < recentHistory.length; i++) {
    const msg = recentHistory[i];
    if (msg.role === "user") {
      if (i === 0) {
        // First user message after system prompt
        prompt += `${msg.content} [/INST]`;
      } else {
        // Subsequent user messages
        prompt += `<s>[INST] ${msg.content} [/INST]`;
      }
    } else if (msg.role === "assistant") {
      prompt += ` ${msg.content}</s>`;
    }
  }

  // Add current user message
  if (recentHistory.length === 0) {
    // No history, just add user message
    prompt += `${userMessage} [/INST]`;
  } else if (recentHistory[recentHistory.length - 1]?.role === "assistant") {
    // Last was assistant, start new user turn
    prompt += `<s>[INST] ${userMessage} [/INST]`;
  } else {
    // Last was user (shouldn't happen normally), just add
    prompt += `<s>[INST] ${userMessage} [/INST]`;
  }

  logger.info("[LLAMA] Generating persona reply", {
    persona: personaName,
    userMessage: userMessage.substring(0, 100),
    historyLength: recentHistory.length,
    promptLength: prompt.length,
  });

  return generateWithLlama(prompt, {
    maxTokens: options.maxTokens || 60,  // Shorter responses for casual chat
    temperature: options.temperature ?? 0.9,  // Slightly more creative
    topP: options.topP ?? 0.95,
    topK: options.topK ?? 50,
    stop: ["</s>", "[INST]", "User:", "\n\nUser:", "Human:", "\n\nHuman:", "\n\n"],
  });
}

/**
 * Generate a reply as Elio using prompt engineering (convenience wrapper)
 * @param {string} userMessage - The user's message
 * @param {Array<{role: 'user'|'assistant', content: string}>} [conversationHistory=[]] - Recent conversation history
 * @param {object} [options={}] - Additional options
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function generateElioReply(userMessage, conversationHistory = [], options = {}) {
  return generatePersonaReply(userMessage, { name: "Elio", system_prompt: ELIO_SYSTEM_PROMPT }, conversationHistory, options);
}

/**
 * Get the Elio system prompt (for debugging/testing)
 * @returns {string}
 */
export function getElioSystemPrompt() {
  return ELIO_SYSTEM_PROMPT;
}
