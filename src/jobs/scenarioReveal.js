/**
 * jobs/scenarioReveal.js
 * Auto-reveal scenario sessions when time is up
 * Runs every minute to check for expired sessions
 */

import { logger } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";
import { getCollection } from "../db/mongo.js";
import { reveal } from "../services/scenario.js";
import webhooks from "../services/webhooks.js";
import { successEmbed } from "../util/replies.js";

/**
 * Auto-reveal expired scenario sessions
 */
export async function run(client) {
  try {
    logger.debug("[JOB:ScenarioReveal] Checking for expired sessions...");

    const sessionsCol = getCollection("scenario_sessions");
    const now = new Date();

    // Find sessions that need to be revealed
    const expiredSessions = await sessionsCol
      .find({
        active: true,
        revealAt: { $lte: now },
      })
      .toArray();

    if (expiredSessions.length === 0) {
      logger.debug("[JOB:ScenarioReveal] No expired sessions found");
      return;
    }

    logger.info(`[JOB:ScenarioReveal] Found ${expiredSessions.length} expired sessions`);

    for (const session of expiredSessions) {
      try {
        // Reveal the session
        const revealResult = await reveal({
          sessionId: session._id,
          guildId: session.guildId,
        });

        if (!revealResult.ok) {
          logger.error(`[JOB:ScenarioReveal] Failed to reveal session ${session._id}:`, revealResult.error);
          continue;
        }

        const { prompt, options, correctIndex, totalAnswers, correctCount } = revealResult.data;

        // Post results to the channel
        const channel = await client.channels.fetch(session.channelId).catch(() => null);
        if (!channel) {
          logger.warn(`[JOB:ScenarioReveal] Channel ${session.channelId} not found`);
          continue;
        }

        // Build reveal message
        let description = `⏰ **Time's Up!**\n\n`;
        description += `**Question:** ${prompt}\n\n`;
        description += `**Correct Answer:** ${options[correctIndex]}\n\n`;
        description += `**Results:**\n`;
        description += `- Total Answers: ${totalAnswers}\n`;
        description += `- Correct: ${correctCount} (${totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0}%)\n`;
        description += `- Incorrect: ${totalAnswers - correctCount}\n\n`;

        description += `\n**Session ID:** \`${session._id}\``;

        // Post results to channel
        await channel.send({
          embeds: [successEmbed("🎯 Scenario Results", description)],
        });

        logger.info(`[JOB:ScenarioReveal] ✅ Revealed session ${session._id}`);
        incCounter("scenario_auto_reveal_total", { guild: session.guildId });
      } catch (error) {
        logger.error(`[JOB:ScenarioReveal] Error revealing session ${session._id}:`, error);
        incCounter("scenario_auto_reveal_errors_total");
      }
    }

    logger.info(`[JOB:ScenarioReveal] ✅ Processed ${expiredSessions.length} expired sessions`);
  } catch (error) {
    logger.error("[JOB:ScenarioReveal] Error:", error);
    incCounter("scenario_reveal_job_errors_total");
  }
}

export default { run };
