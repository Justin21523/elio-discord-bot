// src/services/ai/story.js
// ============================================================================
// Story Service - Story generation, continuation, dialogue
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";

/**
 * Generate a complete story
 * @param {object} params
 * @param {string} params.prompt - Story prompt/theme
 * @param {string} [params.genre] - Story genre
 * @param {string} [params.length] - "short", "medium", or "long"
 * @param {string} [params.style] - Writing style
 * @param {string[]} [params.characters] - Character names
 * @param {string} [params.setting] - Story setting
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function generate(params) {
  const {
    prompt,
    genre,
    length = "medium",
    style,
    characters,
    setting,
  } = params;

  try {
    logger.info("[STORY] Generate request", {
      prompt: prompt.substring(0, 50) + "...",
      genre,
      length,
    });

    const result = await post("/story/generate", {
      prompt,
      genre,
      length,
      style,
      characters,
      setting,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        story: result.data.story,
        wordCount: result.data.word_count,
        paragraphCount: result.data.paragraph_count,
        genre: result.data.genre,
        tokensUsed: result.data.tokens?.total || 0,
      },
    };
  } catch (error) {
    logger.error("[STORY] Generate error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Story generation failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Continue an existing story
 * @param {object} params
 * @param {string} params.existingStory - Story text so far
 * @param {string} [params.direction] - Direction to take the story
 * @param {number} [params.length] - Words to generate
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function continueStory(params) {
  const {
    existingStory,
    direction,
    length = 500,
  } = params;

  try {
    logger.info("[STORY] Continue request", {
      existingLength: existingStory.length,
      targetLength: length,
    });

    const result = await post("/story/continue", {
      existing_story: existingStory,
      direction,
      length,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        continuation: result.data.continuation,
        fullStory: result.data.full_story,
        continuationWordCount: result.data.continuation_word_count,
        tokensUsed: result.data.tokens?.total || 0,
      },
    };
  } catch (error) {
    logger.error("[STORY] Continue error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Story continuation failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Generate character dialogue
 * @param {object} params
 * @param {string[]} params.characters - Character names (min 2)
 * @param {string} params.context - Dialogue context/scenario
 * @param {string} [params.tone] - Dialogue tone
 * @param {number} [params.turns] - Number of dialogue exchanges (2-20)
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function generateDialogue(params) {
  const {
    characters,
    context,
    tone,
    turns = 5,
  } = params;

  try {
    logger.info("[STORY] Dialogue request", {
      characters,
      turns,
    });

    const result = await post("/story/dialogue", {
      characters,
      context,
      tone,
      turns,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        dialogue: result.data.dialogue,
        lines: result.data.lines,
        characters: result.data.characters,
        totalLines: result.data.total_lines,
        tokensUsed: result.data.tokens?.total || 0,
      },
    };
  } catch (error) {
    logger.error("[STORY] Dialogue error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Dialogue generation failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Develop character profile
 * @param {object} params
 * @param {string} params.characterName - Character name
 * @param {string[]} [params.traits] - Character traits
 * @param {string} [params.background] - Character background
 * @param {string} [params.developmentAspect] - What to develop (personality, backstory, motivations, arc)
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function developCharacter(params) {
  const {
    characterName,
    traits,
    background,
    developmentAspect = "personality",
  } = params;

  try {
    logger.info("[STORY] Character development request", {
      characterName,
      aspect: developmentAspect,
    });

    const result = await post("/story/character-develop", {
      character_name: characterName,
      traits,
      background,
      development_aspect: developmentAspect,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        characterName: result.data.character_name,
        aspect: result.data.aspect,
        development: result.data.development,
        tokensUsed: result.data.tokens?.total || 0,
      },
    };
  } catch (error) {
    logger.error("[STORY] Character development error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Character development failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Analyze story structure, themes, etc.
 * @param {object} params
 * @param {string} params.storyText - Story to analyze
 * @param {string} [params.analysisType] - "structure", "themes", "characters", or "pacing"
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function analyzeStory(params) {
  const {
    storyText,
    analysisType = "structure",
  } = params;

  try {
    logger.info("[STORY] Analysis request", {
      storyLength: storyText.length,
      analysisType,
    });

    const result = await post("/story/analyze", {
      story_text: storyText,
      analysis_type: analysisType,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        analysisType: result.data.analysis_type,
        analysis: result.data.analysis,
        storyLength: result.data.story_length,
        tokensUsed: result.data.tokens?.total || 0,
      },
    };
  } catch (error) {
    logger.error("[STORY] Analysis error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Story analysis failed",
        details: { cause: error.message },
      },
    };
  }
}
