/**
 * autoMemeDrop.js
 * Automatically search web for relevant memes/posts and drop them into Discord channels
 */

import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";

/**
 * Search for relevant memes/images and post them to channels
 */
export async function run(client) {
  try {
    logger.info("[JOB] autoMemeDrop started");

    const config = await getAutoMemeConfig();

    if (!config.enabled) {
      logger.info("[JOB] autoMemeDrop is disabled");
      return;
    }

    // Get AI service
    const { default: ai } = await import("../services/ai/index.js");

    // Search for trending topics related to our themes
    const searchQueries = [
      "space memes",
      "alien memes",
      "sci-fi funny",
      "galaxy humor",
      "astronaut memes",
    ];

    const randomQuery =
      searchQueries[Math.floor(Math.random() * searchQueries.length)];

    logger.info(`[JOB] Searching for: ${randomQuery}`);

    // Use AI Agent to orchestrate search strategy
    const agentTask = {
      goal: `Find trending, funny ${randomQuery} that would entertain a sci-fi community`,
      context: {
        searchQuery: randomQuery,
        preferences: ["high engagement", "family-friendly", "visually appealing"],
      },
    };

    const agentResult = await ai.agent.orchestrate(agentTask);

    let imageUrl = null;
    let searchResult = null;

    // Try agent-suggested approach first
    if (agentResult.ok && agentResult.data.suggestedQuery) {
      searchResult = await ai.web.search(agentResult.data.suggestedQuery, 15);
    } else {
      // Fallback to direct search
      searchResult = await ai.web.search(randomQuery, 15);
    }

    if (!searchResult.ok || !searchResult.data.results?.length) {
      logger.warn("[JOB] No search results found");
      return;
    }

    // Filter for image results
    const imageResults = searchResult.data.results.filter(
      (r) => r.image_url || r.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );

    if (imageResults.length === 0) {
      logger.warn("[JOB] No image results found");
      return;
    }

    // Use RAG to check if similar content was already posted
    const recentDrops = await getCollection("meme_drops")
      .find({})
      .sort({ droppedAt: -1 })
      .limit(20)
      .toArray();

    const recentCaptions = recentDrops.map((d) => d.caption || "").join(" ");

    // Pick best image using AI scoring
    let bestImage = null;
    let bestScore = -1;

    for (const result of imageResults.slice(0, 5)) {
      const testUrl = result.image_url || result.url;
      const caption = result.title || result.snippet || "";

      // Simple novelty check
      const similarity = calculateSimilarity(caption, recentCaptions);
      const noveltyScore = 1 - similarity;

      if (noveltyScore > bestScore) {
        bestScore = noveltyScore;
        bestImage = result;
      }
    }

    if (!bestImage) {
      logger.warn("[JOB] No suitable image found");
      return;
    }

    const selectedResult = bestImage;
    imageUrl = selectedResult.image_url || selectedResult.url;

    // Use VLM to analyze if the image is appropriate
    const captionResult = await ai.images.captionUrl(imageUrl, 200);

    if (!captionResult.ok) {
      logger.warn("[JOB] Failed to analyze image");
      return;
    }

    const caption = captionResult.data.caption;

    // Use moderation to check if content is safe
    const moderationResult = await ai.moderation.check(caption);

    if (!moderationResult.ok || !moderationResult.data.safe) {
      logger.warn("[JOB] Image failed moderation check");
      return;
    }

    // Generate a fun comment using persona
    const personas = await getCollection("personas").find({}).toArray();
    const randomPersona = personas[Math.floor(Math.random() * personas.length)];

    const commentPrompt = `You are ${randomPersona.name}. You just found this image online: "${caption}".

Write a short, fun comment (1-2 sentences) to share it with your community. Be in character and relate it to space/sci-fi if possible.`;

    const commentResult = await ai.llm.generate(commentPrompt, {
      system: randomPersona.prompt || "",
      maxTokens: 100,
      temperature: 0.9,
    });

    const comment = commentResult.ok
      ? commentResult.data.text
      : "Check out what I found! 🚀";

    // Post to configured channels
    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel) {
          logger.warn(`[JOB] Channel ${channelId} not found`);
          continue;
        }

        // Use webhook to post as persona
        const { default: webhooks } = await import("../services/webhooks.js");

        await webhooks.sendAsPersona(
          channel,
          {
            name: randomPersona.name,
            avatar: randomPersona.avatar,
            color: randomPersona.color,
          },
          `${comment}\n\n${imageUrl}`
        );

        logger.info(
          `[JOB] Posted meme to ${channel.name} as ${randomPersona.name}`
        );

        // Track in database
        await getCollection("meme_drops").insertOne({
          channelId,
          imageUrl,
          caption,
          persona: randomPersona.name,
          comment,
          searchQuery: randomQuery,
          droppedAt: new Date(),
        });
      } catch (error) {
        logger.error(`[JOB] Failed to post to channel ${channelId}`, {
          error: error.message,
        });
      }
    }

    logger.info("[JOB] autoMemeDrop completed");
  } catch (error) {
    logger.error("[JOB] autoMemeDrop failed", { error: error.message });
  }
}

/**
 * Get auto meme drop configuration
 */
async function getAutoMemeConfig() {
  try {
    const configCol = getCollection("bot_config");
    let config = await configCol.findOne({ key: "auto_meme_drop" });

    if (!config) {
      // Create default config
      config = {
        key: "auto_meme_drop",
        enabled: true,
        channelIds: [],
        frequency: "0 */6 * * *", // Every 6 hours
        searchQueries: [
          "space memes",
          "alien memes",
          "sci-fi funny",
          "galaxy humor",
          "astronaut memes",
        ],
        updatedAt: new Date(),
      };

      await configCol.insertOne(config);
    }

    return config;
  } catch (error) {
    logger.error("[JOB] Failed to get auto meme config", {
      error: error.message,
    });
    return { enabled: false, channelIds: [] };
  }
}

/**
 * Update auto meme drop configuration
 */
export async function updateConfig(updates) {
  try {
    const configCol = getCollection("bot_config");

    await configCol.updateOne(
      { key: "auto_meme_drop" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info("[JOB] Auto meme drop config updated");
  } catch (error) {
    logger.error("[JOB] Failed to update auto meme config", {
      error: error.message,
    });
  }
}

/**
 * Calculate simple text similarity (Jaccard similarity on words)
 */
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}
