/**
 * jobs/channelSummary.js
 * Daily/weekly channel summary using conversation memory
 */

import { logger } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";
import { generate as llmGenerate } from "../services/ai/llm.js";
import { getCollection } from "../db/mongo.js";
import webhooks from "../services/webhooks.js";

const SUMMARY_LOOKBACK_HOURS = 24;
const MAX_MESSAGES_TO_SUMMARIZE = 100;

/**
 * Channel summary job: summarize recent channel activity
 */
export async function run(client) {
  try {
    logger.info("[JOB:ChannelSummary] Running channel summary...");

    // Get all guilds
    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      logger.warn("[JOB:ChannelSummary] No guilds available");
      return;
    }

    const memoryCol = getCollection("conversation_memory");
    const proactiveFeaturesCol = getCollection("proactive_features");

    for (const guild of guilds.values()) {
      // Find channel summary configuration
      const config = await proactiveFeaturesCol.findOne({
        guildId: guild.id,
        feature: "channel_summary",
        enabled: true,
      });

      if (!config || !config.config?.channelIds) {
        logger.debug(`[JOB:ChannelSummary] No channel summary config for guild ${guild.id}`);
        continue;
      }

      const channelIds = config.config.channelIds;
      const schedules = channelIds.map(channelId => ({ channelId }));

      for (const schedule of schedules) {
        const channelId = schedule.channelId;
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel) {
          logger.warn(`[JOB:ChannelSummary] Channel ${channelId} not found`);
          continue;
        }

        // Fetch recent messages from conversation memory
        const since = new Date(Date.now() - SUMMARY_LOOKBACK_HOURS * 60 * 60 * 1000);
        const messages = await memoryCol
          .find({
            guildId: guild.id,
            channelId,
            timestamp: { $gte: since },
          })
          .sort({ timestamp: 1 })
          .limit(MAX_MESSAGES_TO_SUMMARIZE)
          .toArray();

        if (messages.length < 10) {
          logger.info(`[JOB:ChannelSummary] Not enough messages in ${channel.name} (${messages.length})`);
          continue;
        }

        // Build context for summarization
        const messageText = messages
          .map((m) => `${m.authorTag}: ${m.content}`)
          .join("\n");

        const summarizePrompt = `Summarize the following Discord channel conversation into 3-5 key bullet points. Focus on main topics, decisions, and interesting moments:\n\n${messageText}`;

        const summaryResult = await llmGenerate({
          prompt: summarizePrompt,
          system: "You are a helpful assistant that creates concise, accurate summaries of Discord conversations.",
          maxTokens: 400,
          temperature: 0.5,
        });

        if (!summaryResult.ok) {
          logger.error(`[JOB:ChannelSummary] Summary generation failed for ${channel.name}:`, summaryResult.error);
          continue;
        }

        const summary = summaryResult.data.text.trim();

        // Post summary
        const summaryMessage = `📊 **Daily Channel Summary** (last ${SUMMARY_LOOKBACK_HOURS}h)\n\n${summary}\n\n*${messages.length} messages reviewed*`;
        await channel.send(summaryMessage);

        // Store summary in memory
        await memoryCol.insertOne({
          guildId: guild.id,
          channelId,
          type: "summary",
          content: summary,
          messageCount: messages.length,
          timestamp: new Date(),
        });

        incCounter("channel_summaries_posted_total", { guild: guild.id, channel: channelId });
        logger.info(`[JOB:ChannelSummary] ✅ Posted summary to ${channel.name}`);
      }
    }

    logger.info("[JOB:ChannelSummary] Completed");
  } catch (error) {
    logger.error("[JOB:ChannelSummary] Error:", error);
    incCounter("channel_summary_errors_total");
  }
}

export default { run };
