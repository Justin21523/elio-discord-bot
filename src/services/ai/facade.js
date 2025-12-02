// src/services/ai/facade.js
// ============================================================================
// AI Facade - Unified interface for all AI capabilities
// This is the ONLY entry point for commands/services to access AI features
// ============================================================================

import { run as runAgent } from "./agent.js";
import { AI_ENABLED, AI_MOCK_MODE, ErrorCodes } from "../../config.js";
import { logger } from "../../util/logger.js";

/**
 * Generate a daily/weekly news digest
 * @param {object} params
 * @param {string} params.topic - News topic to search for
 * @param {string} params.guildId - Guild ID
 * @returns {Promise<{ok: true, data: string} | {ok: false, error: object}>}
 */
export async function summarizeNews(params) {
  if (!AI_ENABLED && !AI_MOCK_MODE) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "AI features are disabled",
      },
    };
  }

  logger.info("[AI] News summarization requested", params);

  const result = await runAgent("news_digest", params);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: result.data.finalResponse,
  };
}

/**
 * Generate a persona-styled reply
 * @param {object} params
 * @param {string} params.persona - Persona name
 * @param {string} params.personaTraits - Persona personality traits
 * @param {string} params.userMessage - User's message to respond to
 * @param {string} params.guildId - Guild ID
 * @returns {Promise<{ok: true, data: string} | {ok: false, error: object}>}
 */
export async function personaReply(params) {
  if (!AI_ENABLED && !AI_MOCK_MODE) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "AI features are disabled",
      },
    };
  }

  logger.info("[AI] Persona reply requested", {
    persona: params.persona,
    guildId: params.guildId,
  });

  const result = await runAgent("persona_reply", params);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: result.data.finalResponse,
  };
}

/**
 * Generate a reaction to an image (meme, artwork, etc.)
 * @param {object} params
 * @param {string} params.imageUrl - Image URL or data URI
 * @param {string} [params.persona] - Optional persona name
 * @param {string} [params.personaTraits] - Optional persona traits
 * @returns {Promise<{ok: true, data: string} | {ok: false, error: object}>}
 */
export async function imageReact(params) {
  if (!AI_ENABLED && !AI_MOCK_MODE) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "AI features are disabled",
      },
    };
  }

  logger.info("[AI] Image reaction requested");

  const result = await runAgent("image_react", params);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: result.data.finalResponse,
  };
}

/**
 * Execute a custom agentic task
 * @param {string} kind - Task kind identifier
 * @param {object} params - Task parameters
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function agentTask(kind, params) {
  if (!AI_ENABLED && !AI_MOCK_MODE) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "AI features are disabled",
      },
    };
  }

  logger.info("[AI] Custom agent task requested", { kind });

  return await runAgent(kind, params);
}
