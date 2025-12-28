/**
 * index.ts
 * Bot entry point: gateway connection, interaction router, graceful shutdown.
 * All code/comments in English only.
 */

import { Client, GatewayIntentBits, Events, Collection, Partials } from "discord.js";
import {
  config,
  validateConfig,
  CHANNEL_HISTORY_ENABLED,
  BOT_ADMIN_ENABLED,
  BOT_ADMIN_HOST,
  BOT_ADMIN_PORT,
  BOT_ADMIN_TOKEN,
} from "./config.js";
import { connectDB, closeDB, getDb } from "./db/mongo.js";
import { logger } from "./util/logger.js";
import { incCounter, observeHistogram, getAllMetrics } from "./util/metrics.js";
import { formatErrorReply } from "./util/replies.js";
import cron from "node-cron";
import { startAdminServer } from "./admin/server.js";

// Import service singletons
import scheduler from "./services/scheduler.js";
import mediaRepo from "./services/mediaRepo.js";
import points from "./services/points.js";
import personas from "./services/persona.js";
import scenarios from "./services/scenario.js";
import greetings from "./services/greetings.js";
import webhooks from "./services/webhooks.js";
import conversationHistory from "./services/conversationHistory.js";
import ai from "./services/ai/index.js";

// Import command handlers
import * as dropCmd from "./commands/drop.js";
import * as gameCmd from "./commands/game.js";
import * as greetCmd from "./commands/greet.js";
import * as leaderboardCmd from "./commands/leaderboard.js";
import * as pointsCmd from "./commands/points.js";
import * as profileCmd from "./commands/profile.js";
import * as personaCmd from "./commands/persona.js";
import * as scenarioCmd from "./commands/scenario.js";
import * as schedulerCmd from "./commands/scheduler.js";
import * as storyCmd from "./commands/story.js";
import * as aiCmd from "./commands/ai.js";
import * as ragCmd from "./commands/rag.js";
import * as finetuneCmd from "./commands/finetune.js";
import * as configProactiveCmd from "./commands/config-proactive.js";
import * as configSocialCmd from "./commands/config-social.js";
import { loadProactiveSchedules } from "./commands/config-proactive.js";
import * as minigameCmd from "./commands/minigame.js";
import * as adminDataCmd from "./commands/admin-data.js";
import * as lootCmd from "./commands/loot.js";
import * as inventoryCmd from "./commands/inventory.js";
import * as historyCmd from "./commands/history.js";
import * as privacyCmd from "./commands/privacy.js";
import * as helpCmd from "./commands/help.js";

// Import event handlers
import * as messageCreateEvent from "./events/messageCreate.js";
import * as dmCreateEvent from "./events/dmCreate.js";

// Pre-import minigame handler (avoid dynamic import latency on button clicks)
import { handleMinigameButton } from "./handlers/minigameHandlers.js";

// Import job modules
import * as autoScenarios from "./jobs/autoScenarios.js";
import * as mediaSweep from "./jobs/mediaSweep.js";
import * as cosmicDigest from "./jobs/cosmicDigest.js";
import * as channelSummary from "./jobs/channelSummary.js";
import * as aiContentExpand from "./jobs/aiContentExpand.js";
import * as scenarioReveal from "./jobs/scenarioReveal.js";
import * as autoMemeDrop from "./jobs/autoMemeDrop.js";
import * as autoPersonaChat from "./jobs/autoPersonaChat.js";
import * as autoMiniGame from "./jobs/autoMiniGame.js";
import * as autoStoryWeave from "./jobs/autoStoryWeave.js";
import * as autoWorldBuilder from "./jobs/autoWorldBuilder.js";
import { createChannelHistorySyncJob } from "./jobs/channelHistorySync.js";
import * as socialMediaMonitor from "./jobs/socialMediaMonitor.js";

// Validate configuration on startup
try {
  validateConfig();
} catch (error: unknown) {
  console.error(`[ERR] Configuration error: ${getErrorMessage(error)}`);
  process.exit(1);
}

// 1) Connect DB + ensure indexes (once)
logger.info("[BOT] Connecting to database...");
await connectDB();

// 2) Start Discord client (with DM support)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,        // Enable DM support
    GatewayIntentBits.DirectMessageReactions // Enable DM reactions
  ],
  partials: [Partials.Channel, Partials.Message], // Required for DMs
});

// 3) Wire services that need the client
scheduler.setClient(client);
webhooks.setClient(client);

// 4) Boot in-memory schedules from DB
logger.info("[BOT] Loading schedules from database...");
await scheduler
  .bootFromDb()
  .catch((e) =>
    console.warn("[WARN] bootFromDb failed (non-fatal):", String(e))
  );

// 4.5) Setup dynamic data update schedule
logger.info("[BOT] Setting up dynamic data update schedule...");
try {
  const { setupDataUpdateSchedule } = await import("./jobs/scheduleDataUpdates.js");
  setupDataUpdateSchedule(scheduler, ai);
  logger.info("[BOT] Dynamic data update schedule initialized");
} catch (error: unknown) {
  logger.warn("[WARN] Failed to setup dynamic data updates (non-fatal):", {
    error: getErrorMessage(error),
  });
}

// 5) Build command router
type Services = {
  scheduler: typeof scheduler;
  mediaRepo: typeof mediaRepo;
  points: typeof points;
  personas: typeof personas;
  scenarios: typeof scenarios;
  greetings: typeof greetings;
  webhooks: typeof webhooks;
  conversationHistory: typeof conversationHistory;
  ai: typeof ai;
  db: ReturnType<typeof getDb>;
};

type CommandModule = {
  data?: { name: string };
  execute?: (interaction: any, services: Services) => Promise<unknown> | unknown;
};

type RegisteredCommand = {
  data: { name: string };
  execute: (interaction: any, services: Services) => Promise<unknown> | unknown;
};

type InteractionHandler = (interaction: any) => Promise<unknown> | unknown;

function isRegisteredCommand(cmd: CommandModule): cmd is RegisteredCommand {
  return !!cmd.data?.name && typeof cmd.execute === "function";
}

function buildRouter(): Collection<string, RegisteredCommand> {
  const router = new Collection<string, RegisteredCommand>();

  const commands: CommandModule[] = [
    dropCmd as unknown as CommandModule,
    gameCmd as unknown as CommandModule,
    greetCmd as unknown as CommandModule,
    leaderboardCmd as unknown as CommandModule,
    pointsCmd as unknown as CommandModule,
    profileCmd as unknown as CommandModule,
    personaCmd as unknown as CommandModule,
    scenarioCmd as unknown as CommandModule,
    schedulerCmd as unknown as CommandModule,
    storyCmd as unknown as CommandModule,
    aiCmd as unknown as CommandModule,
    ragCmd as unknown as CommandModule,
    finetuneCmd as unknown as CommandModule,
    configProactiveCmd as unknown as CommandModule,
    configSocialCmd as unknown as CommandModule,
    minigameCmd as unknown as CommandModule,
    adminDataCmd as unknown as CommandModule,
    lootCmd as unknown as CommandModule,
    inventoryCmd as unknown as CommandModule,
    historyCmd as unknown as CommandModule,
    privacyCmd as unknown as CommandModule,
    helpCmd as unknown as CommandModule,
  ];

  for (const cmd of commands) {
    if (isRegisteredCommand(cmd)) {
      router.set(cmd.data.name, cmd);
      logger.info(`[BOT] Registered command: ${cmd.data.name}`);
    }
  }

  return router;
}

const router = buildRouter();

// 6) Ready event
client.once(Events.ClientReady, async () => {
  if (!client.user) {
    logger.error("[BOT] ClientReady fired but client.user is null");
    return;
  }

  logger.info(`[BOT] Logged in as ${client.user.tag}`);
  logger.info(`[BOT] Ready! Serving ${client.guilds.cache.size} guilds`);

  // Register cron jobs (optional - configure via env)
  registerCronJobs();

  if (BOT_ADMIN_ENABLED) {
    const adminOptions = {
      host: BOT_ADMIN_HOST,
      port: BOT_ADMIN_PORT,
      ...(BOT_ADMIN_TOKEN ? { token: BOT_ADMIN_TOKEN } : {}),
    };

    startAdminServer(
      { client, scheduler, metrics: { getAllMetrics }, config },
      adminOptions
    );
  }

  // Load proactive schedules from database
  await loadProactiveSchedules(client);
});

/**
 * Register cron jobs for automated tasks
 */
function registerCronJobs(): void {
  const SCENARIO_CRON = process.env.SCENARIO_CRON || "0 */4 * * *";
  const MEDIA_SWEEP_CRON = process.env.MEDIA_SWEEP_CRON || "0 */6 * * *";
  const COSMIC_DIGEST_CRON = process.env.COSMIC_DIGEST_CRON || "0 10 * * *";
  const DAILY_SUMMARY_CRON = process.env.DAILY_SUMMARY_CRON || "0 23 * * *";
  const CONTENT_EXPAND_CRON = process.env.CONTENT_EXPAND_CRON || "0 */6 * * *"; // Every 6 hours

  // Auto-scenario generation (every 4 hours)
  cron.schedule(SCENARIO_CRON, () => {
    logger.info("[CRON] Running auto_scenarios");
    autoScenarios.run(client).catch((err) => logger.error("[CRON] auto_scenarios failed", err));
  });

  // Media sweep (every 6 hours)
  cron.schedule(MEDIA_SWEEP_CRON, () => {
    logger.info("[CRON] Running media_sweep");
    mediaSweep.run(client).catch((err) => logger.error("[CRON] media_sweep failed", err));
  });

  // Cosmic digest (daily at 10:00)
  cron.schedule(COSMIC_DIGEST_CRON, () => {
    logger.info("[CRON] Running cosmic_digest");
    cosmicDigest.run(client).catch((err) => logger.error("[CRON] cosmic_digest failed", err));
  });

  // Channel summary (daily at 23:00)
  cron.schedule(DAILY_SUMMARY_CRON, () => {
    logger.info("[CRON] Running channel_summary");
    channelSummary.run(client).catch((err) => logger.error("[CRON] channel_summary failed", err));
  });

  // AI content expansion (every 6 hours)
  cron.schedule(CONTENT_EXPAND_CRON, () => {
    logger.info("[CRON] Running ai_content_expand");
    aiContentExpand.run(client).catch((err) => logger.error("[CRON] ai_content_expand failed", err));
  });

  // Scenario auto-reveal (every minute)
  cron.schedule("* * * * *", () => {
    logger.debug("[CRON] Running scenario_reveal");
    scenarioReveal.run(client).catch((err) => logger.error("[CRON] scenario_reveal failed", err));
  });

  // Auto meme drop (every 6 hours) - PROACTIVE FEATURE
  const MEME_DROP_CRON = process.env.MEME_DROP_CRON || "0 */6 * * *";
  cron.schedule(MEME_DROP_CRON, () => {
    logger.info("[CRON] Running auto_meme_drop");
    autoMemeDrop.run(client).catch((err) => logger.error("[CRON] auto_meme_drop failed", err));
  });

  // Auto persona chat (every 2 hours) - PROACTIVE FEATURE
  const PERSONA_CHAT_CRON = process.env.PERSONA_CHAT_CRON || "0 */2 * * *";
  cron.schedule(PERSONA_CHAT_CRON, () => {
    logger.info("[CRON] Running auto_persona_chat");
    autoPersonaChat.run(client).catch((err) => logger.error("[CRON] auto_persona_chat failed", err));
  });

  // Auto mini game (every 4 hours) - PROACTIVE FEATURE
  const MINI_GAME_CRON = process.env.MINI_GAME_CRON || "0 */4 * * *";
  cron.schedule(MINI_GAME_CRON, () => {
    logger.info("[CRON] Running auto_mini_game");
    autoMiniGame.run(client).catch((err) => logger.error("[CRON] auto_mini_game failed", err));
  });

  // Auto story weave (daily at noon) - PROACTIVE FEATURE
  const STORY_WEAVE_CRON = process.env.STORY_WEAVE_CRON || "0 12 * * *";
  cron.schedule(STORY_WEAVE_CRON, () => {
    logger.info("[CRON] Running auto_story_weave");
    autoStoryWeave.run(client).catch((err) => logger.error("[CRON] auto_story_weave failed", err));
  });

  // Auto world builder (daily at midnight) - PROACTIVE FEATURE
  const WORLD_BUILDER_CRON = process.env.WORLD_BUILDER_CRON || "0 0 * * *";
  cron.schedule(WORLD_BUILDER_CRON, () => {
    logger.info("[CRON] Running auto_world_builder");
    autoWorldBuilder.run(client).catch((err) => logger.error("[CRON] auto_world_builder failed", err));
  });

  // Channel history sync (every 6 hours) - if enabled
  if (CHANNEL_HISTORY_ENABLED) {
    const db = getDb();
    const historyJob = createChannelHistorySyncJob(client, db, buildEmbeddingClient());
    if (historyJob) {
      logger.info("[CRON] Channel history sync job registered");
    }
  }

  // Social media monitor (every 2 hours) - PROACTIVE FEATURE
  const SOCIAL_MEDIA_CRON = process.env.SOCIAL_MEDIA_CRON || "0 */2 * * *";
  cron.schedule(SOCIAL_MEDIA_CRON, () => {
    logger.info("[CRON] Running social_media_monitor");
    socialMediaMonitor.run(client).catch((err) => logger.error("[CRON] social_media_monitor failed", err));
  });

  logger.info("[BOT] Registered 13 cron jobs (including 6 proactive AI features + channel history)");
}

// 7) Message handler (for both guild messages and DMs)
client.on(Events.MessageCreate, async (message) => {
  try {
    const services: Services = {
      scheduler,
      mediaRepo,
      points,
      personas,
      scenarios,
      greetings,
      webhooks,
      conversationHistory,
      ai,
      db: getDb(),
    };

    // Route to appropriate handler based on message type
    if (message.guild) {
      // Guild message - handle auto-reply
      await messageCreateEvent.execute(message, services);
    } else {
      // Direct message - handle DM
      await dmCreateEvent.execute(message, services);
    }
  } catch (error: unknown) {
    logger.error("[BOT] MessageCreate event error:", { error: getErrorMessage(error) });
  }
});

// 8) Interaction handler (slash commands and buttons)
client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const startTime = Date.now();

    try {
      const command = router.get(interaction.commandName);
      if (!command) {
        logger.warn(`[BOT] Unknown command: ${interaction.commandName}`);
        return;
      }

      // Services bag
      const services: Services = {
        scheduler,
        mediaRepo,
        points,
        personas,
        scenarios,
        greetings,
        webhooks,
        conversationHistory,
        ai,
        db: getDb(),
      };

      await command.execute(interaction, services);

      const latency = Date.now() - startTime;
      incCounter("commands_total", { command: interaction.commandName });
      observeHistogram("command_latency_seconds", latency / 1000, {
        command: interaction.commandName,
      });

      logger.info(
        `[BOT] Command executed: ${interaction.commandName} (${latency}ms)`
      );
    } catch (error: unknown) {
      logger.error(`[BOT] Command error: ${interaction.commandName}`, {
        error: getErrorMessage(error),
        stack: getErrorStack(error),
      });

      const errorMsg = formatErrorReply(error as any);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await interaction.reply({
            content: errorMsg,
            ephemeral: true,
          });
        }
      } catch (replyError) {
        logger.error("[BOT] Failed to send error reply", {
          error: getErrorMessage(replyError),
        });
      }
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const handler = getButtonHandler(interaction.customId);
    if (handler) {
      try {
        await handler(interaction);
      } catch (error: unknown) {
        logger.error(`[BOT] Button handler error: ${interaction.customId}`, {
          error: getErrorMessage(error),
        });
      }
    }
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    const handler = getSelectHandler(interaction.customId);
    if (handler) {
      try {
        await handler(interaction);
      } catch (error: unknown) {
        logger.error(`[BOT] Select menu handler error: ${interaction.customId}`, {
          error: getErrorMessage(error),
        });
      }
    }
  }
});

/**
 * Get button handler by custom ID pattern
 */
function getButtonHandler(customId: string): InteractionHandler | null {
  // Game click handler
  if (customId.startsWith("game_click_")) {
    return gameCmd.handleGameClick;
  }

  // Scenario answer handler
  if (customId.startsWith("scenario_answer_")) {
    return scenarioCmd.handleScenarioAnswer;
  }

  // Mini game handlers (from autoMiniGame proactive feature)
  if (customId.startsWith("game_accept_")) {
    return async (interaction) => {
      const { handleGameAccept } = await import("./handlers/gameHandlers.js");
      return handleGameAccept(interaction);
    };
  }

  if (customId.startsWith("game_decline_")) {
    return async (interaction) => {
      const { handleGameDecline } = await import("./handlers/gameHandlers.js");
      return handleGameDecline(interaction);
    };
  }

  if (customId.startsWith("game_answer_")) {
    return async (interaction) => {
      const { handleGameAnswer } = await import("./handlers/gameHandlers.js");
      return handleGameAnswer(interaction);
    };
  }

  // Mini-game system button handlers (all 12 game types)
  // Pre-imported at top of file for faster response time
  const MINIGAME_PREFIXES = [
    "trivia_",        // Trivia game
    "adventure_",     // Adventure game
    "reaction_",      // Reaction game
    "dice-roll_",     // Dice roll game
    "battle_",        // Battle game
    "guess_",         // Guess number game
    "ir-clue_",       // IR clue game
    "doc-hunt_",      // Doc hunt game
    "hmm_",           // HMM sequence game
    "ngram-story_",   // N-gram story game
    "pmi_",           // PMI association game
    "keyword-pmi_",   // Keyword PMI game
    "minigame_",      // Recommended start buttons (minigame_start_*)
  ];

  if (MINIGAME_PREFIXES.some((prefix) => customId.startsWith(prefix))) {
    return handleMinigameButton; // Direct reference, no dynamic import
  }

  // Feedback buttons for continuous learning
  if (customId.startsWith("feedback_up_") || customId.startsWith("feedback_down_")) {
    return async (interaction) => {
      const { handleFeedbackButton } = await import("./handlers/feedbackHandlers.js");
      return handleFeedbackButton(interaction);
    };
  }

  return null;
}

/**
 * Get select menu handler by custom ID pattern
 */
function getSelectHandler(customId: string): InteractionHandler | null {
  // Will be populated in future stages
  return null;
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`[BOT] Received ${signal}, shutting down gracefully...`);

  try {
    // Destroy Discord client
    client.destroy();

    // Close database connection
    await closeDB();

    logger.info("[BOT] Shutdown complete");
    process.exit(0);
  } catch (error: unknown) {
    logger.error("[BOT] Shutdown error", { error: getErrorMessage(error) });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  logger.error("[BOT] Unhandled Promise Rejection", {
    reason: String(reason),
    promise: String(promise),
  });
});

// 8) Login to Discord
logger.info("[BOT] Logging in to Discord...");
client.login(config.discord.token).catch((error) => {
  logger.error("[BOT] Login failed", { error: getErrorMessage(error) });
  process.exit(1);
});

function buildEmbeddingClient() {
  return {
    embedTexts: async (texts: string[]) => {
      const result = await (ai.embeddings as any).embed(texts, { normalize: true });
      if (!result?.ok) return result;
      return {
        ok: true,
        data: {
          embeddings: result.data.vectors,
          model: result.data.model,
        },
      };
    },
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}
