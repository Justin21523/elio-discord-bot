// src/commands/ai.js
// ============================================================================
// AI Commands - Test and interact with AI capabilities
// ============================================================================

import { SlashCommandBuilder } from "discord.js";
import { agentTask } from "../services/ai/facade.js";
import { logger } from "../util/logger.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";
import { incrementCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("ai")
  .setDescription("Test AI capabilities")
  .addSubcommand((sub) =>
    sub
      .setName("chat")
      .setDescription("Chat with AI")
      .addStringOption((opt) =>
        opt.setName("message").setDescription("Your message").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("image")
      .setDescription("Ask AI about an image")
      .addAttachmentOption((opt) =>
        opt
          .setName("image")
          .setDescription("Image to analyze")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("question")
          .setDescription("Question about the image")
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  const startTime = Date.now();
  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply();

  logger.info("[CMD] /ai command invoked", {
    subcommand,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });

  incrementCounter("commands_total", { command: "ai", subcommand });

  try {
    if (subcommand === "chat") {
      const message = interaction.options.getString("message");

      const result = await agentTask("rag_query", {
        query: message,
        guildId: interaction.guildId,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "🤖 AI Response",
        description: result.data.finalResponse,
      });
    } else if (subcommand === "image") {
      const attachment = interaction.options.getAttachment("image");
      const question = interaction.options.getString("question");

      if (!attachment.contentType?.startsWith("image/")) {
        await sendErrorReply(interaction, {
          code: "BAD_REQUEST",
          message: "Please provide a valid image file",
        });
        return;
      }

      const result = await agentTask("image_react", {
        imageUrl: attachment.url,
        persona: null,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "🖼️ Image Analysis",
        description: result.data.finalResponse,
        image: attachment.url,
      });
    }

    const latency = Date.now() - startTime;
    observeHistogram("command_latency_seconds", latency / 1000, {
      command: "ai",
      subcommand,
    });

    logger.info("[CMD] /ai command succeeded", {
      subcommand,
      guildId: interaction.guildId,
      latencyMs: latency,
    });
  } catch (error) {
    logger.error("[ERR] /ai command failed", {
      error: error.message,
      stack: error.stack,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });

    await sendErrorReply(interaction, {
      code: "UNKNOWN",
      message: "An unexpected error occurred",
    });
  }
}
