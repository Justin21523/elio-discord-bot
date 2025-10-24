/**
 * autoStoryWeave.js
 * Personas collaboratively write episodic stories, expanding the Communiverse lore
 */

import { EmbedBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";

/**
 * Generate and post collaborative story episodes
 */
export async function run(client) {
  try {
    logger.info("[JOB] autoStoryWeave started");

    const config = await getAutoStoryWeaveConfig();

    if (!config.enabled) {
      logger.info("[JOB] autoStoryWeave is disabled");
      return;
    }

    const { default: ai } = await import("../services/ai/index.js");
    const { default: webhooks } = await import("../services/webhooks.js");

    // Get ongoing story or start new one
    const storyCol = getCollection("story_episodes");
    let currentStory = await storyCol.findOne({ status: "ongoing" });

    if (!currentStory) {
      // Use RAG to get lore inspiration
      const loreResult = await ai.rag.search({
        query: "Communiverse characters locations adventures",
        topK: 5,
      });

      let loreContext = "";
      if (loreResult.ok && loreResult.data.hits?.length > 0) {
        loreContext = loreResult.data.hits
          .map((h) => h.chunk)
          .slice(0, 3)
          .join("\n");
      }

      // Use Agent to plan story arc
      const storyPlanTask = {
        goal: "Design a compelling 5-episode story arc set in the Communiverse",
        context: {
          setting: "Communiverse universe with Elio, Glordon, Olga and others",
          lore: loreContext,
          themes: ["adventure", "friendship", "discovery", "humor"],
        },
      };

      const planResult = await ai.agent.orchestrate(storyPlanTask);

      let storyPlan = null;
      if (planResult.ok && planResult.data.plan) {
        storyPlan = planResult.data.plan;
      }

      // Generate first episode using Story API
      const episode1Prompt = `Create episode 1 of a new Communiverse adventure story.

Setting: ${loreContext || "The vast Communiverse with friendly aliens"}

${storyPlan ? `Story arc: ${JSON.stringify(storyPlan)}` : ""}

Write an engaging opening episode (200-300 words) that:
1. Introduces the main characters naturally
2. Sets up an intriguing situation or mystery
3. Ends with a hook for the next episode

Style: Fun, adventurous, suitable for all ages`;

      const episode1Result = await ai.story.generate({
        prompt: episode1Prompt,
        maxTokens: 400,
      });

      if (!episode1Result.ok) {
        logger.warn("[JOB] Failed to generate story episode");
        return;
      }

      const episode1Text = episode1Result.data.text;

      // Create new story document
      currentStory = {
        title: storyPlan?.title || "A New Adventure in the Communiverse",
        status: "ongoing",
        currentEpisode: 1,
        totalEpisodes: 5,
        plan: storyPlan,
        episodes: [
          {
            number: 1,
            text: episode1Text,
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storyCol.insertOne(currentStory);
    } else {
      // Continue existing story with next episode
      const nextEpisodeNum = currentStory.currentEpisode + 1;

      if (nextEpisodeNum > currentStory.totalEpisodes) {
        // Story is complete
        await storyCol.updateOne(
          { _id: currentStory._id },
          { $set: { status: "completed", updatedAt: new Date() } }
        );
        logger.info("[JOB] Story completed!");
        return;
      }

      // Get previous episodes for context
      const previousEpisodes = currentStory.episodes
        .slice(-2)
        .map((ep) => `Episode ${ep.number}:\n${ep.text}`)
        .join("\n\n");

      const nextEpisodePrompt = `Continue this Communiverse story with episode ${nextEpisodeNum}.

${storyPlan ? `Story plan: ${JSON.stringify(currentStory.plan)}` : ""}

Previous episodes:
${previousEpisodes}

Write episode ${nextEpisodeNum} (200-300 words) that:
1. Continues naturally from the previous episode
2. Develops the plot and characters
3. ${nextEpisodeNum === currentStory.totalEpisodes ? "Provides a satisfying conclusion" : "Ends with a hook for the next episode"}

Style: Fun, adventurous, suitable for all ages`;

      const episodeResult = await ai.story.generate({
        prompt: nextEpisodePrompt,
        maxTokens: 400,
      });

      if (!episodeResult.ok) {
        logger.warn("[JOB] Failed to generate story episode");
        return;
      }

      const episodeText = episodeResult.data.text;

      // Update story document
      await storyCol.updateOne(
        { _id: currentStory._id },
        {
          $push: {
            episodes: {
              number: nextEpisodeNum,
              text: episodeText,
              createdAt: new Date(),
            },
          },
          $set: {
            currentEpisode: nextEpisodeNum,
            updatedAt: new Date(),
          },
        }
      );

      currentStory.episodes.push({
        number: nextEpisodeNum,
        text: episodeText,
      });
      currentStory.currentEpisode = nextEpisodeNum;
    }

    // Post the latest episode to configured channels
    const latestEpisode = currentStory.episodes[currentStory.episodes.length - 1];

    // Get a random persona to narrate
    const personas = await getCollection("personas").find({}).toArray();
    const narrator = personas[Math.floor(Math.random() * personas.length)];

    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel?.isTextBased()) {
          logger.warn(`[JOB] Channel ${channelId} not found or not text-based`);
          continue;
        }

        const embed = new EmbedBuilder()
          .setColor(narrator.color || "#5865F2")
          .setAuthor({
            name: `${narrator.name} - Story Time`,
            iconURL: narrator.avatar,
          })
          .setTitle(`📖 ${currentStory.title}`)
          .setDescription(
            `**Episode ${latestEpisode.number} of ${currentStory.totalEpisodes}**\n\n${latestEpisode.text}`
          )
          .setFooter({
            text:
              latestEpisode.number === currentStory.totalEpisodes
                ? "The End! ✨"
                : "To be continued...",
          })
          .setTimestamp();

        await webhooks.sendAsPersona(
          channel,
          {
            name: narrator.name,
            avatar: narrator.avatar,
            color: narrator.color,
          },
          { embeds: [embed] }
        );

        logger.info(
          `[JOB] Posted episode ${latestEpisode.number} to ${channel.name}`
        );
      } catch (error) {
        logger.error(`[JOB] Failed to post to channel ${channelId}`, {
          error: error.message,
        });
      }
    }

    logger.info("[JOB] autoStoryWeave completed");
  } catch (error) {
    logger.error("[JOB] autoStoryWeave failed", { error: error.message });
  }
}

/**
 * Get auto story weave configuration
 */
async function getAutoStoryWeaveConfig() {
  try {
    const configCol = getCollection("bot_config");
    let config = await configCol.findOne({ key: "auto_story_weave" });

    if (!config) {
      config = {
        key: "auto_story_weave",
        enabled: true,
        channelIds: [],
        frequency: "0 12 * * *", // Daily at noon
        episodesPerStory: 5,
        updatedAt: new Date(),
      };

      await configCol.insertOne(config);
    }

    return config;
  } catch (error) {
    logger.error("[JOB] Failed to get auto story weave config", {
      error: error.message,
    });
    return { enabled: false, channelIds: [] };
  }
}

/**
 * Update auto story weave configuration
 */
export async function updateConfig(updates) {
  try {
    const configCol = getCollection("bot_config");

    await configCol.updateOne(
      { key: "auto_story_weave" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info("[JOB] Auto story weave config updated");
  } catch (error) {
    logger.error("[JOB] Failed to update auto story weave config", {
      error: error.message,
    });
  }
}
