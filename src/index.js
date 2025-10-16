<<<<<<< HEAD
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
=======
// /src/index.js
// English-only code & comments.
// Boot flow: connect Mongo → ensure indexes → start Discord client → wire services → boot scheduler → route slash commands.

import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { ensureIndexes as bootDbIndexes } from "./db/ensure-indexes.js";
import { CONFIG } from "./config.js";
import { connectMongo, closeMongo } from "./db/mongo.js";

/* ------------------------ Commands (implemented now) ------------------------ */
import * as dropCmd from "./commands/drop.js";
import * as greetCmd from "./commands/greet.js";
import * as personaCmd from "./commands/persona.js";
import * as pointsCmd from "./commands/points.js";
import * as leaderboardCmd from "./commands/leaderboard.js";
import * as scenarioCmd from "./commands/scenario.js";
import * as scheduleCmd from "./commands/scheduler.js";

/* ------------------------- Services (implemented now) ----------------------- */
import * as webhooks from "./services/webhooks.js";
import * as scheduler from "./services/scheduler.js";
import * as mediaRepo from "./services/mediaRepo.js";
import * as personas from "./services/persona.js";
import * as points from "./services/points.js";
import * as scenarios from "./services/scenario.js";
import * as greetings from "./services/greetings.js";

/* --------------------------------- Utils ----------------------------------- */
import { logger } from "./util/logger.js";
import { incCounter, startTimer, METRIC_NAMES } from "./util/metrics.js";

const log = logger.child({ mod: "index" });

/** Build a static command router map (file → command name). */
function buildRouter() {
  const map = new Collection();
  const mods = [
    dropCmd,
    greetCmd,
    personaCmd,
    pointsCmd,
    leaderboardCmd,
    scenarioCmd,
    scheduleCmd,
  ];
  for (const mod of mods) {
    if (mod?.data?.name && typeof mod?.execute === "function") {
      map.set(mod.data.name, mod);
    }
  }
  return map;
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
}

// Create Discord client with minimal required intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

<<<<<<< HEAD
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
=======
  // 1) Connect DB + ensure indexes (once)
  await connectMongo();
  try {
    await bootDbIndexes();
  } catch (e) {
    console.warn("[WARN] ensure-indexes skipped/failed (non-fatal):", String(e));
  }

  // 2) Start Discord client (minimal intents we need now)
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  // 3) Wire services that need the client
  scheduler.setClient(client);
  webhooks.setClient(client);
  // (Optional) if you later expose a generic job runner:
  // scheduler.setJobRunner(jobs.run);

  // 4) Boot in-memory schedules from DB
  await scheduler.bootFromDb().catch((e) =>
    console.warn("[WARN] bootFromDb failed (non-fatal):", String(e))
  );

  client.once(Events.ClientReady, () => {
    console.log("[INT] Logged in as", client.user.tag);
  });

  // 5) Router map (fixed names)
  const router = buildRouter();

  // 6) Interaction handler (slash commands only)
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const stop = startTimer(METRIC_NAMES.command_latency_seconds, {
      command: interaction.commandName,
    });

    try {
      const mod = router.get(interaction.commandName);
      if (!mod) return;

      // Services bag (kept for parity; commands may ignore it)
      const services = {
        scheduler,
        mediaRepo,
        points,
        personas,
        scenarios,
        greetings,
        webhooks,
      };

      await mod.execute(interaction, services);
      incCounter(METRIC_NAMES.commands_total, {
        command: interaction.commandName,
      });
      stop({ command: interaction.commandName });
    } catch (e) {
      console.error("[ERR] command error:", interaction.commandName, e);
      stop({ command: interaction.commandName });
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: "❌ Something went wrong." });
        } else {
          await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
        }
      } catch {}
    }
  });

  // 7) Graceful shutdown
  async function shutdown(sig) {
    try {
      console.log(`[INT] Caught ${sig}, shutting down...`);
      await closeMongo();
      await client.destroy();
    } finally {
      process.exit(0);
    }
  }
  process.on("unhandledRejection", (r) => console.error("[ERR] Unhandled:", r));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 8) Login
  await client.login(CONFIG.DISCORD_TOKEN);
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
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
