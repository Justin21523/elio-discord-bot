/**
 * config.js
 * Centralized configuration loaded from environment variables.
 * All code/comments in English only.
 */

import dotenv from "dotenv";
dotenv.config();

// ============================================================================
// Discord Configuration
// ============================================================================
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const APP_ID = process.env.APP_ID;
export const GUILD_ID_DEV = process.env.GUILD_ID_DEV;

if (!DISCORD_TOKEN || !APP_ID) {
  throw new Error(
    "Missing required Discord configuration: DISCORD_TOKEN or APP_ID"
  );
}

// ============================================================================
// Database Configuration
// ============================================================================
export const MONGODB_URI = process.env.MONGODB_URI;
export const DB_NAME = process.env.DB_NAME || "communiverse_bot";

if (!MONGODB_URI) {
  throw new Error("Missing required database configuration: MONGODB_URI");
}

// ============================================================================
// AI Configuration
// ============================================================================
export const AI_ENABLED = process.env.AI_ENABLED === "true";
export const AI_MODEL_TEXT = process.env.AI_MODEL_TEXT || "deepseek";
export const AI_MODEL_VLM = process.env.AI_MODEL_VLM || "qwen-vl";
export const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL || "bge-m3";

// AI Service URLs (for microservice architecture)
export const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:8000";
export const AI_SERVICE_TIMEOUT_MS = parseInt(
  process.env.AI_SERVICE_TIMEOUT_MS || "240000",
  10
);
export const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || "180000", 10);
export const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || "2048", 10);

// RAG Configuration
export const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || "5", 10);
export const RAG_MIN_SCORE = parseFloat(process.env.RAG_MIN_SCORE || "0.7");
export const RAG_INDEX_NAME = process.env.RAG_INDEX_NAME || "vector_index";

// Agent Configuration
export const AGENT_MAX_STEPS = parseInt(
  process.env.AGENT_MAX_STEPS || "10",
  10
);
export const AGENT_STEP_TIMEOUT_MS = parseInt(
  process.env.AGENT_STEP_TIMEOUT_MS || "15000",
  10
);

// Web Search Configuration
export const WEB_SEARCH_ENABLED = process.env.WEB_SEARCH_ENABLED === "true";
export const WEB_SEARCH_API_KEY = process.env.WEB_SEARCH_API_KEY;
export const WEB_SEARCH_MAX_RESULTS = parseInt(
  process.env.WEB_SEARCH_MAX_RESULTS || "5",
  10
);
export const WEB_SEARCH_RATE_LIMIT = parseInt(
  process.env.WEB_SEARCH_RATE_LIMIT || "10",
  10
); // per hour

// ============================================================================
// Scheduler Configuration
// ============================================================================
export const NEWS_DIGEST_CRON = process.env.NEWS_DIGEST_CRON || "0 13 * * *";

// ============================================================================
// Logging & Metrics Configuration
// ============================================================================
export const LOG_LEVEL = process.env.LOG_LEVEL || "info";
export const METRICS_PORT = parseInt(process.env.METRICS_PORT || "9090", 10);

// ============================================================================
// Game Configuration
// ============================================================================
export const GAME_TIMEOUT_MS = 120000; // 120 seconds (2 minutes)
export const GAME_COOLDOWN_MS = 60000; // 1 minute between games

// ============================================================================
// Points & Levels Configuration
// ============================================================================
export const POINTS_PER_LEVEL = 100;
export const MAX_LEVEL = 50;

// ============================================================================
// Privacy & Safety Configuration
// ============================================================================
export const MEMORY_TTL_DAYS = parseInt(
  process.env.MEMORY_TTL_DAYS || "90",
  10
);
export const CONVERSATION_MAX_TURNS = parseInt(
  process.env.CONVERSATION_MAX_TURNS || "50",
  10
);

// ============================================================================
// Feature Flags
// ============================================================================
export const FEATURES = {
  AI_ENABLED,
  WEB_SEARCH_ENABLED,
  KEYWORD_TRIGGERS: process.env.KEYWORD_TRIGGERS_ENABLED === "true",
  NSFW_FILTER: process.env.NSFW_FILTER_ENABLED !== "false", // default true
};

// ============================================================================
// Error Codes (exported for consistency)
// ============================================================================
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  DB_ERROR: "DB_ERROR",
  DISCORD_API_ERROR: "DISCORD_API_ERROR",
  AI_MODEL_ERROR: "AI_MODEL_ERROR",
  AI_TIMEOUT: "AI_TIMEOUT",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  SCHEDULE_ERROR: "SCHEDULE_ERROR",
  RAG_EMPTY: "RAG_EMPTY",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNKNOWN: "UNKNOWN",
};
/**
 * Main configuration object
 */
export const config = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN,
    appId: process.env.APP_ID,
    guildIdDev: process.env.GUILD_ID_DEV,
  },

  // MongoDB
  db: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
    name: process.env.DB_NAME || "communiverse_bot",
  },

  // AI (Phase 4)
  ai: {
    enabled: process.env.AI_ENABLED === "true",
    modelText: process.env.AI_MODEL_TEXT || "deepseek",
    modelVlm: process.env.AI_MODEL_VLM || "qwen-vl",
    embeddingsModel: process.env.EMBEDDINGS_MODEL || "bge-m3",
  },

  // Scheduler
  scheduler: {
    newsDigestCron: process.env.NEWS_DIGEST_CRON || "0 13 * * *",
  },

  // Observability
  observability: {
    logLevel: process.env.LOG_LEVEL || "info",
    metricsPort: parseInt(process.env.METRICS_PORT || "9090", 10),
  },

  // Environment
  nodeEnv: process.env.NODE_ENV || "development",
};

/**
 * Validate required configuration
 * Throws if critical config is missing
 */
export function validateConfig() {
  const required = [
    { key: "DISCORD_TOKEN", value: config.discord.token },
    { key: "APP_ID", value: config.discord.appId },
    { key: "MONGODB_URI", value: config.db.uri },
  ];

  const missing = required.filter((r) => !r.value);
  if (missing.length > 0) {
    const keys = missing.map((m) => m.key).join(", ");
    throw new Error(`Missing required config: ${keys}`);
  }
}
