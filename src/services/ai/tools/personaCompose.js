// src/services/ai/tools/personaCompose.js
// ============================================================================
// Persona Compose Tool - Generate persona-styled responses
// ============================================================================

import { generateText } from "../adapters/llmAdapter.js";
import { logger } from "../../../util/logger.js";
import { ErrorCodes } from "../../../config.js";

/**
 * Compose a response in a specific persona's style
 * @param {object} params
 * @param {string} params.persona - Persona name
 * @param {string} params.personaTraits - Persona traits/style description
 * @param {string} params.context - Context or prompt
 * @param {string} [params.userMessage] - Optional user message to respond to
 * @returns {Promise<{ok: true, data: {response: string}} | {ok: false, error: object}>}
 */
export async function compose(params) {
  const { persona, personaTraits, context, userMessage } = params;

  try {
    logger.info("[TOOL] Persona compose requested", {
      persona,
      hasUserMessage: !!userMessage,
    });

    // Build persona-specific system prompt
    const systemPrompt = `You are ${persona}. ${personaTraits}

Important rules:
- Stay strictly in character
- Match the persona's speaking style, vocabulary, and tone
- Keep responses concise (1-3 sentences unless asked for more)
- Be engaging and authentic to the character`;

    // Build user prompt
    let prompt = context;
    if (userMessage) {
      prompt += `\n\nUser message: "${userMessage}"`;
    }
    prompt += "\n\nRespond in character:";

    // Generate response
    const result = await generateText(prompt, {
      systemPrompt,
      temperature: 0.8, // Higher temperature for more personality
      maxTokens: 512,
    });

    if (!result.ok) {
      return result;
    }

    logger.info("[TOOL] Persona compose completed", {
      persona,
      responseLength: result.data.text.length,
    });

    return {
      ok: true,
      data: {
        response: result.data.text,
      },
    };
  } catch (error) {
    logger.error("[TOOL] Persona compose error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Persona compose failed",
        cause: error,
      },
    };
  }
}
