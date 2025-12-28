/**
 * jobs/mediaSweep.js
 * Media sweep job: search for Elio-related images/gifs, describe with VLM, optionally add captions
 */

import { logger } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";
import { describe as vlmDescribe } from "../services/ai/vlm.js";
import { getCollection } from "../db/mongo.js";

type WebSearchResult = { url: string };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Mock web search for now (replace with actual implementation when available)
async function searchWeb(_query: string): Promise<WebSearchResult[]> {
  logger.warn("[JOB:MediaSweep] Web search not implemented, using mock data");
  return [];
}

/**
 * Media sweep job: find and catalog media
 */
export async function run(client: any) {
  try {
    logger.info("[JOB:MediaSweep] Running media sweep...");

    const queries = [
      "Elio Pixar 2025 poster",
      "Elio Pixar character art",
      "Communiverse Elio",
    ];

    const mediaCol = getCollection("media");
    let added = 0;

    for (const query of queries) {
      const results = await searchWeb(query);

      for (const result of results.slice(0, 3)) {
        // Check if already exists
        const existing = await mediaCol.findOne({ url: result.url });
        if (existing) continue;

        // Describe with VLM
        const vlmResult = await vlmDescribe({
          imageUrl: result.url,
          maxTokens: 100,
        });

        if (!vlmResult.ok) {
          logger.warn(`[JOB:MediaSweep] VLM failed for ${result.url}`);
          continue;
        }

        // Insert to media collection
        await mediaCol.insertOne({
          url: result.url,
          type: "image",
          description: vlmResult.data.description,
          source: "auto_sweep",
          tags: ["elio", "pixar"],
          enabled: true,
          nsfw: false,
          addedAt: new Date(),
        });

        added++;
        logger.info(`[JOB:MediaSweep] Added media: ${result.url}`);
      }
    }

    incCounter("media_sweep_added_total", { count: added });
    logger.info(`[JOB:MediaSweep] ✅ Completed, added ${added} new media items`);
  } catch (error) {
    logger.error("[JOB:MediaSweep] Error", {
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    incCounter("media_sweep_errors_total");
  }
}

export default { run };
