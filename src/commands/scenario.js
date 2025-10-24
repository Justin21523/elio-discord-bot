/**
 * commands/scenario.js
 * Scenario quiz command handlers: /scenario start, /scenario reveal, /scenario stats
 */

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../util/logger.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { successEmbed, errorEmbed, infoEmbed } from "../util/replies.js";
import {
  startSession,
  answer,
  reveal,
  getSessionStats,
  cancel,
} from "../services/scenario.js";

export const data = new SlashCommandBuilder()
  .setName("scenario")
  .setDescription("Interactive scenario quizzes")
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Start a scenario quiz")
      .addIntegerOption((opt) =>
        opt
          .setName("reveal-after")
          .setDescription("Minutes until reveal (default: 3)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(30)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancel active scenario in this channel")
  )
  .addSubcommand((sub) =>
    sub
      .setName("reveal")
      .setDescription("Reveal scenario results early")
      .addStringOption((opt) =>
        opt
          .setName("session-id")
          .setDescription("Session ID to reveal")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("View scenario session statistics")
      .addStringOption((opt) =>
        opt
          .setName("session-id")
          .setDescription("Session ID to view")
          .setRequired(true)
      )
  );

/**
 * Main scenario command router
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function execute(interaction) {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "start":
      return await handleScenarioStart(interaction);
    case "cancel":
      return await handleScenarioCancel(interaction);
    case "reveal":
      return await handleScenarioReveal(interaction);
    case "stats":
      return await handleScenarioStats(interaction);
    default:
      return {
        ok: false,
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: "Unknown subcommand",
        },
      };
  }
}

/**
 * Handle /scenario start
 */
async function handleScenarioStart(interaction) {
  try {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const revealAfterMinutes = interaction.options.getInteger("reveal-after") || 5;

    // Start session
    const result = await startSession({
      guildId,
      channelId,
      revealAfterMinutes,
    });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Scenario Start Failed",
            result.error.message || "Could not start scenario"
          ),
        ],
      });
      return result;
    }

    const { sessionId, scenario, question, revealAt } = result.data;

    // Build option buttons
    const buttons = scenario.options.map((opt, i) =>
      new ButtonBuilder()
        .setCustomId(`scenario_answer_${sessionId}_${i}`)
        .setLabel(opt)
        .setStyle(ButtonStyle.Primary)
    );

    const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 2));
    const row2 = new ActionRowBuilder().addComponents(buttons.slice(2, 4));

    // Send scenario message (use question from result.data with fallback)
    const displayQuestion = question || scenario.question || "What will you do?";
    await interaction.editReply({
      embeds: [
        infoEmbed(
          "Scenario Quiz",
          `${displayQuestion}\n\n` +
            `**Options:**\n` +
            scenario.options.map((opt, i) => `${i + 1}. ${opt}`).join("\n") +
            `\n\n**Session ID:** \`${sessionId}\`\n` +
            `**Reveal Time:** <t:${Math.floor(revealAt.getTime() / 1000)}:R>`
        ),
      ],
      components: [row1, row2],
    });

    logger.command("/scenario start success", {
      guildId,
      channelId,
      sessionId,
      scenarioId: scenario._id.toString(),
    });

    return { ok: true, data: { sessionId } };
  } catch (error) {
    logger.error("[CMD] /scenario start failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to start scenario",
        cause: error,
      },
    };
  }
}

/**
 * Handle /scenario cancel
 */
async function handleScenarioCancel(interaction) {
  try {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    logger.info("[CMD] /scenario cancel called", {
      guildId,
      channelId,
      guildIdType: typeof guildId,
      channelIdType: typeof channelId
    });

    // Cancel session
    const result = await cancel({ guildId, channelId });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Cancel Failed",
            result.error.message || "Could not cancel scenario"
          ),
        ],
      });
      return result;
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Scenario Canceled",
          "The active scenario in this channel has been canceled."
        ),
      ],
    });

    logger.command("/scenario cancel success", {
      guildId,
      channelId,
    });

    return { ok: true };
  } catch (error) {
    logger.error("[CMD] /scenario cancel failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to cancel scenario",
        cause: error,
      },
    };
  }
}

/**
 * Handle /scenario reveal
 */
async function handleScenarioReveal(interaction) {
  try {
    const sessionIdStr = interaction.options.getString("session-id", true);

    // Convert sessionId string to ObjectId
    const { ObjectId } = await import("mongodb");
    const sessionId = new ObjectId(sessionIdStr);

    // Reveal results
    const result = await reveal({ sessionId });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Reveal Failed",
            result.error.message || "Could not reveal scenario"
          ),
        ],
      });
      return result;
    }

    const { scenario, correctIndex, totalAnswers, correctCount, awarded } =
      result.data;

    let description = `**Question:** ${scenario.question}\n\n`;
    description += `**Correct Answer:** ${scenario.options[correctIndex]}\n\n`;
    description += `**Results:**\n`;
    description += `- Total Answers: ${totalAnswers}\n`;
    description += `- Correct: ${correctCount} (${
      totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0
    }%)\n`;
    description += `- Incorrect: ${totalAnswers - correctCount}\n\n`;

    if (awarded.length > 0) {
      description += `**Points Awarded:**\n`;
      for (const a of awarded.slice(0, 5)) {
        description += `- <@${a.userId}>: ${a.points} pts (${
          a.correct ? "correct" : "participation"
        })\n`;
      }
      if (awarded.length > 5) {
        description += `...and ${awarded.length - 5} more`;
      }
    }

    await interaction.editReply({
      embeds: [successEmbed("Scenario Revealed!", description)],
    });

    logger.command("/scenario reveal success", {
      guildId,
      sessionId,
      totalAnswers,
      correctCount,
    });

    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("[CMD] /scenario reveal failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to reveal scenario",
        cause: error,
      },
    };
  }
}

/**
 * Handle /scenario stats
 */
async function handleScenarioStats(interaction) {
  try {
    const sessionIdStr = interaction.options.getString("session-id", true);

    // Convert sessionId string to ObjectId
    const { ObjectId } = await import("mongodb");
    const sessionId = new ObjectId(sessionIdStr);

    // Get stats
    const result = await getSessionStats({ sessionId });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Stats Failed",
            result.error.message || "Could not get stats"
          ),
        ],
      });
      return result;
    }

    const stats = result.data;

    let description = `**Session ID:** \`${sessionId}\`\n\n`;
    description += `**Status:** ${stats.revealed ? "Revealed" : "Active"}\n`;
    if (!stats.revealed) {
      description += `**Reveal At:** <t:${Math.floor(
        new Date(stats.revealAt).getTime() / 1000
      )}:R>\n`;
    }
    description += `\n**Answers:**\n`;
    description += `- Total: ${stats.totalAnswers}\n`;
    if (stats.revealed) {
      description += `- Correct: ${stats.correctCount}\n`;
      description += `- Incorrect: ${stats.incorrectCount}\n`;
      if (stats.answerDistribution) {
        description += `\n**Distribution:**\n`;
        stats.answerDistribution.forEach((count, i) => {
          description += `- Option ${i + 1}: ${count} (${
            stats.totalAnswers > 0
              ? Math.round((count / stats.totalAnswers) * 100)
              : 0
          }%)\n`;
        });
      }
    }

    await interaction.editReply({
      embeds: [infoEmbed("Scenario Statistics", description)],
    });

    logger.command("/scenario stats success", {
      guildId: interaction.guildId,
      sessionId,
    });

    return { ok: true, data: stats };
  } catch (error) {
    logger.error("[CMD] /scenario stats failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to get scenario stats",
        cause: error,
      },
    };
  }
}

/**
 * Handle scenario answer button click
 * @param {ButtonInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function handleScenarioAnswer(interaction) {
  try {
    const customId = interaction.customId;
    const [, , sessionIdStr, answerIndexStr] = customId.split("_");
    const answerIndex = parseInt(answerIndexStr, 10);
    const userId = interaction.user.id;

    // Convert sessionId string to ObjectId
    const { ObjectId } = await import("mongodb");
    const sessionId = new ObjectId(sessionIdStr);

    // Record answer
    const result = await answer({ sessionId, userId, answerIndex });

    if (!result.ok) {
      await interaction.reply({
        content: `❌ ${result.error.message}`,
        ephemeral: true,
      });
      return result;
    }

    await interaction.reply({
      content: result.data.correct
        ? "✅ Answer recorded! You'll see results when revealed."
        : "📝 Answer recorded! You'll see results when revealed.",
      ephemeral: true,
    });

    logger.interaction("Scenario answer", {
      sessionId,
      userId,
      answerIndex,
      correct: result.data.correct,
    });

    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("[INT] Scenario answer failed", {
      customId: interaction.customId,
      userId: interaction.user.id,
      error: error.message,
    });

    try {
      await interaction.reply({
        content: "❌ Something went wrong. Please try again.",
        ephemeral: true,
      });
    } catch (replyError) {
      // Ignore reply errors
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to process answer",
        cause: error,
      },
    };
  }
}
