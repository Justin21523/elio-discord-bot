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

export async function execute(interaction: any) {
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

      const result: any = await addDocument({
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

      // Send progress update after 5 seconds
      const progressTimeout = setTimeout(async () => {
        try {
          await interaction.editReply("🔍 Searching knowledge base...");
        } catch (e) {
          // Ignore if already replied
        }
      }, 5000);

      try {
        const result: any = await search({
          query,
          guildId: interaction.guildId,
          topK: 5,
          generateAnswer: true,
        });

        clearTimeout(progressTimeout);

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

        const { hits, answer, totalHits } = result.data as any;
        const hitDocs = (hits as any[]) || [];

        // Build answer section
        let description = "";
        if (answer) {
          description += `**🤖 AI Answer:**\n${answer}\n\n`;
        }

        // Build sources section
        if (hitDocs.length > 0) {
          description += `**📚 Sources (${totalHits}):**\n`;
          description += hitDocs
            .slice(0, 3)
            .map((doc: any, i: number) => {
              const preview = doc.chunk.substring(0, 120);
              const score = (doc.score * 100).toFixed(1);
              return `${i + 1}. (${score}%) ${preview}${
                doc.chunk.length > 120 ? "..." : ""
              }`;
            })
          .join("\n\n");
        }

        await sendSuccessReply(interaction, {
          title: `🔍 RAG Search: "${query}"`,
          description: description || "No results found.",
        });
      } catch (error) {
        clearTimeout(progressTimeout);
        throw error;
      }
    } else if (subcommand === "clear") {
      const confirm = interaction.options.getString("confirm");

      if (confirm !== "confirm") {
        await sendErrorReply(interaction, {
          code: "BAD_REQUEST",
          message: 'Please type "confirm" to clear all documents',
        });
        return;
      }

      const result: any = await deleteDocuments({
        guildId: interaction.guildId,
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("[ERR] /rag command failed", {
      error: msg,
      stack,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });

    await sendErrorReply(interaction, {
      code: "UNKNOWN",
      message: "An unexpected error occurred",
    });
  }
}
