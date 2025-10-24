/**
 * jobs/aiContentExpand.js
 * AI-driven content expansion: automatically generate greetings, media, and scenarios
 * Calls ai-service endpoints to generate fresh content every 6 hours
 */

import { logger } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";
import { getCollection } from "../db/mongo.js";
import { httpPostJson } from "../services/ai/_client.js";

/**
 * Generate greetings via AI service
 * @returns {Promise<{ok: boolean, data?: {items: Array}, error?: object}>}
 */
async function generateGreetings() {
  try {
    logger.info("[JOB:ContentExpand] Generating greetings via AI...");

    const { status, json } = await httpPostJson("/gen/greetings", {
      count: 5,
      themes: ["space", "communiverse", "elio", "friendly"],
      tone: "welcoming",
    });

    const result = status === 200 && json.ok ? json : { ok: false, error: json.error || { message: "Request failed" } };

    if (!result.ok) {
      logger.error("[JOB:ContentExpand] Greetings generation failed:", result.error);
      return result;
    }

    return {
      ok: true,
      data: result.data,
    };
  } catch (error) {
    logger.error("[JOB:ContentExpand] Greetings generation error:", error);
    return {
      ok: false,
      error: {
        code: "AI_GENERATION_ERROR",
        message: "Failed to generate greetings",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Generate media items via AI service
 * @returns {Promise<{ok: boolean, data?: {items: Array}, error?: object}>}
 */
async function generateMedia() {
  try {
    logger.info("[JOB:ContentExpand] Generating media via AI...");

    const { status, json } = await httpPostJson("/gen/media", {
      count: 3,
      types: ["concept_art", "character", "location"],
      style: "pixar_elio",
    });

    const result = status === 200 && json.ok ? json : { ok: false, error: json.error || { message: "Request failed" } };

    if (!result.ok) {
      logger.error("[JOB:ContentExpand] Media generation failed:", result.error);
      return result;
    }

    return {
      ok: true,
      data: result.data,
    };
  } catch (error) {
    logger.error("[JOB:ContentExpand] Media generation error:", error);
    return {
      ok: false,
      error: {
        code: "AI_GENERATION_ERROR",
        message: "Failed to generate media",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Generate scenarios via AI service
 * @returns {Promise<{ok: boolean, data?: {items: Array}, error?: object}>}
 */
async function generateScenarios() {
  try {
    logger.info("[JOB:ContentExpand] Generating scenarios via AI...");

    const { status, json } = await httpPostJson("/gen/scenarios", {
      count: 2,
      difficulty: "medium",
      categories: ["lore", "characters", "plot"],
    });

    const result = status === 200 && json.ok ? json : { ok: false, error: json.error || { message: "Request failed" } };

    if (!result.ok) {
      logger.error("[JOB:ContentExpand] Scenarios generation failed:", result.error);
      return result;
    }

    return {
      ok: true,
      data: result.data,
    };
  } catch (error) {
    logger.error("[JOB:ContentExpand] Scenarios generation error:", error);
    return {
      ok: false,
      error: {
        code: "AI_GENERATION_ERROR",
        message: "Failed to generate scenarios",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Upsert greetings to database
 * @param {Array<{text: string, tags?: Array<string>}>} items
 * @returns {Promise<number>} - Number of items upserted
 */
async function upsertGreetings(items) {
  const collection = getCollection("greetings");
  let upsertCount = 0;

  for (const item of items) {
    const doc = {
      text: item.text,
      tags: item.tags || [],
      enabled: true,
      weight: 1.0,
      aiGenerated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.updateOne(
      { text: item.text },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      upsertCount++;
    }
  }

  logger.info(`[JOB:ContentExpand] Upserted ${upsertCount} greetings`);
  return upsertCount;
}

/**
 * Upsert media items to database
 * @param {Array<{url: string, caption: string, tags?: Array<string>}>} items
 * @returns {Promise<number>} - Number of items upserted
 */
async function upsertMedia(items) {
  const collection = getCollection("media");
  let upsertCount = 0;

  for (const item of items) {
    const doc = {
      url: item.url,
      caption: item.caption || "",
      tags: item.tags || [],
      type: item.type || "image",
      enabled: true,
      weight: 1.0,
      aiGenerated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.updateOne(
      { url: item.url },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      upsertCount++;
    }
  }

  logger.info(`[JOB:ContentExpand] Upserted ${upsertCount} media items`);
  return upsertCount;
}

/**
 * Upsert scenarios to database
 * @param {Array<{id?: string, title: string, question: string, options: Array<string>, tags?: Array<string>}>} items
 * @returns {Promise<number>} - Number of items upserted
 */
async function upsertScenarios(items) {
  const collection = getCollection("scenarios");
  let upsertCount = 0;

  for (const item of items) {
    // Ensure we have required fields
    if (!item.question || !item.options || item.options.length < 4) {
      logger.warn("[JOB:ContentExpand] Skipping invalid scenario:", item);
      continue;
    }

    const doc = {
      title: item.title || item.question.substring(0, 60) + "...",
      question: item.question,
      prompt: item.question, // Alias for compatibility
      options: item.options.slice(0, 4), // Ensure exactly 4 options
      correctIndex: item.correctIndex || 0,
      tags: item.tags || [],
      enabled: true,
      weight: 1.0,
      hostPersonaName: item.hostPersonaName || "Elio",
      aiGenerated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Use title or question as unique key
    const uniqueKey = item.id || item.title || item.question;
    const result = await collection.updateOne(
      { $or: [{ title: uniqueKey }, { question: item.question }] },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      upsertCount++;
    }
  }

  logger.info(`[JOB:ContentExpand] Upserted ${upsertCount} scenarios`);
  return upsertCount;
}

/**
 * Main AI content expansion job
 * Runs periodically (every 6 hours) to generate fresh content
 */
export async function run(client) {
  try {
    logger.info("[JOB:ContentExpand] Starting AI content expansion...");

    const stats = {
      greetings: 0,
      media: 0,
      scenarios: 0,
    };

    // Generate greetings
    const greetingsResult = await generateGreetings();
    if (greetingsResult.ok && greetingsResult.data?.items) {
      stats.greetings = await upsertGreetings(greetingsResult.data.items);
      incCounter("ai_content_generated_total", { type: "greetings", count: stats.greetings });
    }

    // Generate media
    const mediaResult = await generateMedia();
    if (mediaResult.ok && mediaResult.data?.items) {
      stats.media = await upsertMedia(mediaResult.data.items);
      incCounter("ai_content_generated_total", { type: "media", count: stats.media });
    }

    // Generate scenarios
    const scenariosResult = await generateScenarios();
    if (scenariosResult.ok && scenariosResult.data?.items) {
      stats.scenarios = await upsertScenarios(scenariosResult.data.items);
      incCounter("ai_content_generated_total", { type: "scenarios", count: stats.scenarios });
    }

    logger.info("[JOB:ContentExpand] ✅ Content expansion complete", {
      greetings: stats.greetings,
      media: stats.media,
      scenarios: stats.scenarios,
    });

    incCounter("ai_content_expand_runs_total");
  } catch (error) {
    logger.error("[JOB:ContentExpand] Error:", error);
    incCounter("ai_content_expand_errors_total");
  }
}

export default { run };
