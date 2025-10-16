// src/commands/rag.js
// ============================================================================
// RAG Commands - Manage RAG knowledge base
// ============================================================================

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { addDocument, deleteDocuments, search } from "../services/ai/rag.js";
import { logger } from "../util/logger.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";
import { incrementCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("rag")
  .setDescription("Manage RAG knowledge base")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a document to knowledge base")
      .addStringOption((opt) =>
        opt
          .setName("content")
          .setDescription("Document content")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Document category")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("search")
      .setDescription("Search knowledge base")
      .addStringOption((opt) =>
        opt.setName("query").setDescription("Search query").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("clear")
      .setDescription("Clear all documents for this server")
      .addStringOption((opt) =>
        opt
          .setName("confirm")
          .setDescription('Type "confirm" to proceed')
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  const startTime = Date.now();
  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply({ ephemeral: true });

  logger.info("[CMD] /rag command invoked", {
    subcommand,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });

  incrementCounter("commands_total", { command: "rag", subcommand });

  try {
    if (subcommand === "add") {
      const content = interaction.options.getString("content");
      const category = interaction.options.getString("category") || "general";

      const result = await addDocument({
        content,
        category,
        guildId: interaction.guildId,
        metadata: {
          added_by: interaction.user.id,
          added_in_channel: interaction.channelId,
        },
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "📚 Document Added",
        description: `Successfully added document to knowledge base.\n\n**ID:** ${result.data.id}\n**Category:** ${category}`,
      });
    } else if (subcommand === "search") {
      const query = interaction.options.getString("query");

      const result = await search(query, {
        guildId: interaction.guildId,
        topK: 3,
      });

      if (!result.ok) {
        if (result.error.code === "RAG_EMPTY") {
          await sendSuccessReply(interaction, {
            title: "🔍 Search Results",
            description: "No relevant documents found for your query.",
          });
          return;
        }
        await sendErrorReply(interaction, result.error);
        return;
      }

      const docs = result.data;
      const description = docs
        .map((doc, i) => {
          const preview = doc.content.substring(0, 150);
          const score = (doc.score * 100).toFixed(1);
          return `**${i + 1}.** (${score}% match)\n${preview}${
            doc.content.length > 150 ? "..." : ""
          }`;
        })
        .join("\n\n");

      await sendSuccessReply(interaction, {
        title: `🔍 Search Results (${docs.length})`,
        description,
      });
    } else if (subcommand === "clear") {
      const confirm = interaction.options.getString("confirm");

      if (confirm !== "confirm") {
        await sendErrorReply(interaction, {
          code: "BAD_REQUEST",
          message: 'Please type "confirm" to clear all documents',
        });
        return;
      }

      const result = await deleteDocuments({
        guild_id: interaction.guildId,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "🗑️ Knowledge Base Cleared",
        description: `Deleted ${result.data.deletedCount} document(s) from this server's knowledge base.`,
      });
    }

    const latency = Date.now() - startTime;
    observeHistogram("command_latency_seconds", latency / 1000, {
      command: "rag",
      subcommand,
    });

    logger.info("[CMD] /rag command succeeded", {
      subcommand,
      guildId: interaction.guildId,
      latencyMs: latency,
    });
  } catch (error) {
    logger.error("[ERR] /rag command failed", {
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
