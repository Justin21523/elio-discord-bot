/**
 * admin-data.js
 * Admin commands for data management - manual triggers for dynamic updates
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { triggerManualDataUpdate } from "../jobs/scheduleDataUpdates.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("admin-data")
  .setDescription("Admin commands for data management")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("update")
      .setDescription("Manually trigger dynamic data update (generates new personas, scenarios, greetings)")
  )
  .addSubcommand(sub =>
    sub
      .setName("status")
      .setDescription("View status of dynamic data update system")
  );

export async function execute(interaction: any, services: any) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "update":
        await handleUpdate(interaction, services);
        break;
      case "status":
        await handleStatus(interaction, services);
        break;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("[ADMIN-DATA] Command error", { error: msg, stack });
    await interaction.editReply({
      content: `❌ Error: ${msg}`
    });
  }
}

/**
 * Manually trigger dynamic data update
 */
async function handleUpdate(interaction: any, services: any) {
  await interaction.editReply({
    content: "🔄 Starting dynamic data update...\n\nThis will:\n- Analyze RAG resources for new characters\n- Generate new personas using AI\n- Create new scenarios and greetings\n- Update database\n\nPlease wait..."
  });

  try {
    const result = await triggerManualDataUpdate(services.ai);

    if (result.success) {
      let response = "✅ **Dynamic Data Update Complete**\n\n";
      response += `📊 **Results:**\n`;
      response += `• New Personas: ${result.newPersonas || 0}\n`;
      response += `• New Scenarios: ${result.newScenarios || 0}\n`;
      response += `• New Greetings: ${result.newGreetings || 0}\n\n`;
      response += `_All data has been validated and inserted into the database._`;

      await interaction.editReply({ content: response });

      logger.info("[ADMIN-DATA] Manual data update completed", {
        user: interaction.user.username,
        result
      });
    } else {
      await interaction.editReply({
        content: `❌ **Dynamic Data Update Failed**\n\nError: ${result.error}\n\nPlease check logs for details.`
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[ADMIN-DATA] Update failed", { error: msg });
    await interaction.editReply({
      content: `❌ **Update Failed**\n\n${msg}\n\nPlease check bot logs for details.`
    });
  }
}

/**
 * View status of dynamic data update system
 */
async function handleStatus(interaction: any, services: any) {
  const { withCollection } = await import("../db/mongo.js");

  // Get counts of current data
  const personaCount = await withCollection("personas", col => col.countDocuments());
  const scenarioCount = await withCollection("scenarios", col => col.countDocuments());
  const greetingCount = await withCollection("greetings", col => col.countDocuments());

  // Check if RAG directory exists and count character files
  let ragCharacterFiles = 0;
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const ragDir = path.join(process.cwd(), "data/rag-resources");

    async function countCharacterFiles(dir: string): Promise<number> {
      let count = 0;
      try {
        const entries = (await fs.readdir(dir, { withFileTypes: true })) as any[];
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            count += await countCharacterFiles(fullPath);
          } else if (entry.name.includes("character") && entry.name.endsWith(".md")) {
            count++;
          }
        }
      } catch (err) {
        // Ignore errors
      }
      return count;
    }

    ragCharacterFiles = await countCharacterFiles(ragDir);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.debug("[ADMIN-DATA] Failed to count RAG files", { error: msg });
  }

  let response = "**🤖 Dynamic Data Update System Status**\n\n";

  response += "**📊 Current Data:**\n";
  response += `• Personas: ${personaCount}\n`;
  response += `• Scenarios: ${scenarioCount}\n`;
  response += `• Greetings: ${greetingCount}\n\n`;

  response += "**📁 RAG Resources:**\n";
  response += `• Character Files: ${ragCharacterFiles}\n\n`;

  response += "**⏰ Schedule:**\n";
  response += `• Weekly Updates: Sundays at 3:00 AM\n`;
  response += `• Next Update: Next Sunday at 03:00\n\n`;

  response += "**🔧 Features:**\n";
  response += `• AI analyzes RAG resources for new characters\n`;
  response += `• Automatically generates personas with personalities\n`;
  response += `• Creates scenarios and greetings\n`;
  response += `• Validates and inserts to database\n\n`;

  response += "**💡 Manual Trigger:**\n";
  response += `Use \`/admin-data update\` to trigger update now`;

  await interaction.editReply({ content: response });

  logger.info("[ADMIN-DATA] Status viewed", { user: interaction.user.username });
}
