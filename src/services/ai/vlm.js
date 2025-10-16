// src/services/ai/vlm.js
// ============================================================================
// VLM Service - Vision-Language Model for image understanding
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";
import { AI_MAX_TOKENS } from "../../config.js";

/**
 * Describe an image with optional question
 * @param {object} params
 * @param {string} params.imageUrl - Image URL
 * @param {string} [params.task] - Task type: 'caption', 'describe', 'react'
 * @param {string} [params.tone] - Tone: 'neutral', 'playful', 'dramatic'
 * @param {string} [params.question] - Optional question about the image
 * @returns {Promise<{ok: true, data: {caption: string, description: string, reaction: string, safety: object, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function describe(params) {
  const {
    imageUrl,
    task = "caption",
    tone = "neutral",
    question,
  } = params;

  try {
    logger.info("[VLM] Describe request", {
      imageUrl: imageUrl.substring(0, 50) + "...",
      task,
      tone,
      hasQuestion: !!question,
    });

    const result = await post("/vlm/describe", {
      image_url: imageUrl,
      task,
      tone,
      question,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        caption: result.data.caption,
        description: result.data.description,
        reaction: result.data.reaction,
        safety: result.data.safety || {},
        tokensUsed: result.data.tokens?.total || 0,
        usage: result.data.tokens,
        model: result.data.model,
      },
    };
  } catch (error) {
    logger.error("[VLM] Describe error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Image description failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Generate persona-specific image reaction
 * @param {object} params
 * @param {string} params.imageUrl - Image URL
 * @param {string} params.personaName - Name of the persona
 * @param {string} [params.context] - Additional context
 * @returns {Promise<{ok: true, data: {reaction: string, persona: string, label: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function imageReact(params) {
  const {
    imageUrl,
    personaName,
    context,
  } = params;

  try {
    logger.info("[VLM] Image react request", {
      imageUrl: imageUrl.substring(0, 50) + "...",
      persona: personaName,
    });

    const result = await post("/vlm/imageReact", {
      image_url: imageUrl,
      persona_name: personaName,
      context,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        reaction: result.data.reaction,
        persona: result.data.persona,
        label: result.data.label,
        tokensUsed: result.data.tokens?.total || 0,
        usage: result.data.tokens,
        model: result.data.model,
      },
    };
  } catch (error) {
    logger.error("[VLM] Image react error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Image reaction generation failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Analyze an image (wrapper for describe with 'describe' task)
 * @param {object} params
 * @param {string} params.imageUrl - Image URL or base64 data URI
 * @param {string} [params.prompt] - Optional prompt/question about image
 * @param {number} [params.maxTokens] - Max tokens to generate
 * @param {number} [params.temperature] - Temperature
 * @returns {Promise<{ok: true, data: {description: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function analyze(params) {
  const {
    imageUrl,
    prompt,
    maxTokens = AI_MAX_TOKENS,
    temperature = 0.7,
  } = params;

  const result = await describe({
    imageUrl,
    task: "describe",
    tone: "neutral",
    question: prompt,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      description: result.data.description || result.data.caption,
      tokensUsed: result.data.tokensUsed,
      usage: result.data.usage,
      model: result.data.model,
    },
  };
}

/**
 * Generate a reaction/comment about an image
 * @param {object} params
 * @param {string} params.imageUrl - Image URL
 * @param {string} [params.persona] - Persona name for styled reaction
 * @param {string} [params.style] - Reaction style (funny, serious, etc.)
 * @returns {Promise<{ok: true, data: {reaction: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function react(params) {
  const {
    imageUrl,
    persona,
    style = "engaging",
  } = params;

  if (persona) {
    // Use persona-specific endpoint
    return imageReact({
      imageUrl,
      personaName: persona,
      context: `React in a ${style} manner.`,
    });
  }

  // Use generic describe endpoint with 'react' task
  const result = await describe({
    imageUrl,
    task: "react",
    tone: style,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      reaction: result.data.reaction || result.data.caption,
      tokensUsed: result.data.tokensUsed,
      usage: result.data.usage,
      model: result.data.model,
    },
  };
}

/**
 * Ask a question about an image
 * @param {object} params
 * @param {string} params.imageUrl - Image URL
 * @param {string} params.question - Question about the image
 * @param {number} [params.maxTokens] - Max tokens
 * @returns {Promise<{ok: true, data: {answer: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function ask(params) {
  const {
    imageUrl,
    question,
    maxTokens = AI_MAX_TOKENS,
  } = params;

  const result = await describe({
    imageUrl,
    task: "describe",
    question,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      answer: result.data.description || result.data.caption,
      tokensUsed: result.data.tokensUsed,
      usage: result.data.usage,
      model: result.data.model,
    },
  };
}
