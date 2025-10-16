/**
 * index.js
 * Bot entry point: gateway connection, interaction router, graceful shutdown.
 * All code/comments in English only.
 */

import { Client, GatewayIntentBits, Events } from "discord.js";
import { config, validateConfig } from "./config.js";
import { connectDB, closeDB } from "./db/mongo.js";
import { logger } from "./util/logger.js";
import { bootFromDb as bootScheduler } from "./services/scheduler.js";
import { incCounter, observeHistogram } from "./util/metrics.js";
import { formatErrorReply } from "./util/replies.js";

// Import command handlers
import handleDrop from "./commands/drop.js";
import handleGame, { handleGameClick } from "./commands/game.js";
import handleLeaderboard from "./commands/leaderboard.js";
import handleProfile from "./commands/profile.js";
import handlePersona from "./commands/persona.js";
import handleScenario, { handleScenarioAnswer } from "./commands/scenario.js";

// Add to commands import section:
import * as aiCmd from "./commands/ai.js";
import * as ragCmd from "./commands/rag.js";

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

// Create Discord client with minimal required intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

/**
 * Bot ready handler - runs once on successful connection
 */
client.once(Events.ClientReady, async (readyClient) => {
  logger.info("[BOT] Ready!", {
    tag: readyClient.user.tag,
    guilds: readyClient.guilds.cache.size,
  });

  try {
    // Connect to database
    await connectDB();

    // Boot scheduler from database
    await bootScheduler();

    logger.info("[BOT] All systems operational");
  } catch (error) {
    logger.error("[BOT] Startup failed", { error: error.message });
    process.exit(1);
  }
});

/**
 * Interaction handler - routes all slash commands and components
 */
client.on(Events.InteractionCreate, async (interaction) => {
  const startTime = Date.now();

  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName;

      logger.command(`/${commandName}`, {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
      });

      // Defer reply within 3 seconds (required by SLO)
      await interaction.deferReply({ ephemeral: false });

      // Route to command handler
      const handler = getCommandHandler(commandName);
      if (!handler) {
        await interaction.editReply("❌ Command not implemented yet.");
        return;
      }

      const result = await handler(interaction);

      if (!result.ok) {
        const errorMsg = formatErrorReply(result.error);
        await interaction.editReply(errorMsg);
        logger.error("[CMD] Command failed", {
          command: commandName,
          guildId: interaction.guildId,
          code: result.error.code,
          message: result.error.message,
        });
      }

      // Emit metrics
      const duration = (Date.now() - startTime) / 1000;
      incCounter("commands_total", { command: commandName }, 1);
      observeHistogram("command_latency_seconds", duration, {
        command: commandName,
      });
    }

    // Handle button interactions
    else if (interaction.isButton()) {
      logger.interaction("Button click", {
        customId: interaction.customId,
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });

      const handler = getButtonHandler(interaction.customId);
      if (!handler) {
        await interaction.reply({
          content: "❌ This button is not implemented yet.",
          ephemeral: true,
        });
        return;
      }

      const result = await handler(interaction);

      // Metrics for button clicks
      const duration = (Date.now() - startTime) / 1000;
      incCounter("interactions_total", { type: "button" }, 1);
      observeHistogram("interaction_latency_seconds", duration, {
        type: "button",
      });
    }

    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
      logger.interaction("Select menu", {
        customId: interaction.customId,
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });

      await interaction.deferReply({ ephemeral: true });

      const handler = getSelectHandler(interaction.customId);
      if (!handler) {
        await interaction.editReply("❌ This menu is not implemented yet.");
        return;
      }

      const result = await handler(interaction);

      if (!result.ok) {
        const errorMsg = formatErrorReply(result.error);
        await interaction.editReply(errorMsg);
      }

      // Emit metrics
      const duration = (Date.now() - startTime) / 1000;
      incCounter("interactions_total", { type: "select" }, 1);
      observeHistogram("interaction_latency_seconds", duration, {
        type: "select",
      });
    }
  } catch (error) {
    logger.error("[INT] Interaction handler failed", {
      type: interaction.type,
      error: error.message,
      stack: error.stack,
    });

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(
          "❌ Something went wrong. Please try again."
        );
      } else {
        await interaction.reply({
          content: "❌ Something went wrong. Please try again.",
          ephemeral: true,
        });
      }
    } catch (replyError) {
      logger.error("[INT] Failed to send error reply", {
        error: replyError.message,
      });
    }
  }
});

/**
 * Get command handler by name
 */
function getCommandHandler(commandName) {
  const handlers = {
    drop: handleDrop,
    game: handleGame,
    leaderboard: handleLeaderboard,
    profile: handleProfile,
    persona: handlePersona,
    scenario: handleScenario,
  };

  return handlers[commandName];
}

/**
 * Get button handler by custom ID pattern
 */
function getButtonHandler(customId) {
  // Game click handler
  if (customId.startsWith("game_click_")) {
    return handleGameClick;
  }

  // Scenario answer handler
  if (customId.startsWith("scenario_answer_")) {
    return handleScenarioAnswer;
  }

  return null;
}

/**
 * Get select menu handler by custom ID pattern
 */
function getSelectHandler(customId) {
  // Will be populated in future stages
  return null;
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  logger.info(`[BOT] Received ${signal}, shutting down gracefully...`);

  try {
    // Destroy Discord client
    client.destroy();

    // Close database connection
    await closeDB();

    logger.info("[BOT] Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("[BOT] Shutdown error", { error: error.message });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Login to Discord
client.login(config.discord.token).catch((error) => {
  logger.error("[BOT] Login failed", { error: error.message });
  process.exit(1);
});
