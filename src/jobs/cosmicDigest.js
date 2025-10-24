/**
 * jobs/cosmicDigest.js
 * Daily Elio news digest in persona voice
 */

import { logger } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";
import { summarizeNews } from "../services/ai/llm.js";
import { generate as llmGenerate } from "../services/ai/llm.js";
import webhooks from "../services/webhooks.js";
import personas from "../services/persona.js";
import { getCollection } from "../db/mongo.js";

/**
 * Cosmic digest job: fetch news and post in persona voice
 */
export async function run(client) {
  try {
    logger.info("[JOB:CosmicDigest] Running cosmic digest...");

    // Fetch news
    const newsResult = await summarizeNews({
      topics: [
        "Elio Pixar reviews",
        "Elio box office",
        "Communiverse Pixar",
      ],
      locale: "en",
      maxItems: 6,
      style: "concise-bullet",
    });

    if (!newsResult.ok || !newsResult.data.digest) {
      logger.warn("[JOB:CosmicDigest] No news found");
      return;
    }

    const newsDigest = newsResult.data.digest;
    logger.info(`[JOB:CosmicDigest] Retrieved news digest (${newsDigest.length} chars)`);

    // Get Elio persona
    const elioPersona = await personas.getByName("Elio");
    if (!elioPersona) {
      logger.warn("[JOB:CosmicDigest] Elio persona not found");
      return;
    }

    // Rewrite in Elio's voice
    const rewritePrompt = `Here's a news summary about Elio and the Communiverse:\n\n${newsDigest}\n\nRewrite this in Elio's enthusiastic, space-obsessed voice. Keep it under 500 words.`;

    const rewriteResult = await llmGenerate({
      prompt: rewritePrompt,
      system: elioPersona.prompt || "You are Elio, an enthusiastic 11-year-old who loves space and aliens.",
      maxTokens: 600,
      temperature: 0.8,
    });

    if (!rewriteResult.ok) {
      logger.error("[JOB:CosmicDigest] LLM rewrite failed:", rewriteResult.error);
      return;
    }

    const personaDigest = rewriteResult.data.text.trim();

    // Post to configured news channel
    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      logger.warn("[JOB:CosmicDigest] No guilds available");
      return;
    }

    const guild = guilds.first();
    const schedulesCol = getCollection("schedules");
    const schedule = await schedulesCol.findOne({
      guildId: guild.id,
      kind: "cosmic_digest",
      enabled: true,
    });

    if (!schedule || !schedule.channelId) {
      logger.info("[JOB:CosmicDigest] No digest channel configured");
      return;
    }

    const channel = await client.channels.fetch(schedule.channelId);
    if (!channel) {
      logger.warn(`[JOB:CosmicDigest] Channel ${schedule.channelId} not found`);
      return;
    }

    const message = `🌌 **Cosmic Digest** 🌌\n\n${personaDigest}\n\n---\n*Your daily update from the Communiverse!*`;
    await webhooks.personaSay(channel.id, elioPersona, { content: message });

    incCounter("cosmic_digest_posted_total", { guild: guild.id });
    logger.info(`[JOB:CosmicDigest] ✅ Posted digest to ${channel.name}`);
  } catch (error) {
    logger.error("[JOB:CosmicDigest] Error:", error);
    incCounter("cosmic_digest_errors_total");
  }
}

export default { run };
