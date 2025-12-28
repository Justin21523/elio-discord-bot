/**
 * config.ts
 * Centralized configuration loaded from environment variables.
 * All code/comments in English only.
 */

import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required configuration: ${key}`);
  return value;
}

// ============================================================================
// Discord Configuration
// ============================================================================
export const DISCORD_TOKEN = requireEnv("DISCORD_TOKEN");
export const APP_ID = requireEnv("APP_ID");
export const GUILD_ID_DEV = process.env.GUILD_ID_DEV;

// ============================================================================
// Database Configuration
// ============================================================================
export const MONGODB_URI = requireEnv("MONGODB_URI");
export const DB_NAME = process.env.DB_NAME || "communiverse_bot";

// ============================================================================
// AI Configuration
// ============================================================================
export const AI_ENABLED = process.env.AI_ENABLED === "true";
export const AI_MOCK_MODE = process.env.AI_MOCK_MODE === "true";
export const AI_MOCK_LATENCY_MS = parseInt(
  process.env.AI_MOCK_LATENCY_MS || "0",
  10
);
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

// llama.cpp Server Configuration (GPU inference)
export const LLAMA_SERVER_URL =
  process.env.LLAMA_SERVER_URL || "http://live4.dothost.net:8080";
export const LLAMA_TIMEOUT_MS = parseInt(
  process.env.LLAMA_TIMEOUT_MS || "180000",
  10
);
export const USE_LLAMA_SERVER = process.env.USE_LLAMA_SERVER === "true";

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
// Bot Internal Admin API Configuration (optional, for runtime bridge)
// ============================================================================
// Prefer BOT_ADMIN_*; fallback to legacy ADMIN_* for backward compatibility.
export const BOT_ADMIN_ENABLED =
  process.env.BOT_ADMIN_ENABLED != null
    ? process.env.BOT_ADMIN_ENABLED === "true"
    : process.env.ADMIN_ENABLED === "true";
export const BOT_ADMIN_HOST =
  process.env.BOT_ADMIN_HOST || process.env.ADMIN_HOST || "127.0.0.1";
export const BOT_ADMIN_PORT = parseInt(
  process.env.BOT_ADMIN_PORT || process.env.ADMIN_PORT || "3001",
  10
);
export const BOT_ADMIN_TOKEN = process.env.BOT_ADMIN_TOKEN || process.env.ADMIN_TOKEN;

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
// Channel History Configuration
// ============================================================================
export const CHANNEL_HISTORY_ENABLED =
  process.env.CHANNEL_HISTORY_ENABLED !== "false";
export const CHANNEL_HISTORY_CRON =
  process.env.CHANNEL_HISTORY_CRON || "0 */6 * * *"; // Every 6 hours
export const CHANNEL_HISTORY_MAX_DAYS = parseInt(
  process.env.CHANNEL_HISTORY_MAX_DAYS || "7",
  10
);
export const CHANNEL_HISTORY_RETENTION_DAYS = parseInt(
  process.env.CHANNEL_HISTORY_RETENTION_DAYS || "90",
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
  CHANNEL_HISTORY: CHANNEL_HISTORY_ENABLED,
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
} as const;
/**
 * Main configuration object
 */
export const config = {
  // Discord
  discord: {
    token: DISCORD_TOKEN,
    appId: APP_ID,
    guildIdDev: GUILD_ID_DEV,
  },

  // MongoDB
  db: {
    uri: MONGODB_URI,
    name: DB_NAME,
  },

  // AI (Phase 4)
  ai: {
    enabled: AI_ENABLED,
    modelText: AI_MODEL_TEXT,
    modelVlm: AI_MODEL_VLM,
    embeddingsModel: EMBEDDINGS_MODEL,
  },

  // Scheduler
  scheduler: {
    newsDigestCron: NEWS_DIGEST_CRON,
  },

  // Channel History
  channelHistory: {
    enabled: CHANNEL_HISTORY_ENABLED,
    cron: CHANNEL_HISTORY_CRON,
    maxDays: CHANNEL_HISTORY_MAX_DAYS,
    retentionDays: CHANNEL_HISTORY_RETENTION_DAYS,
  },

  // Observability
  observability: {
    logLevel: LOG_LEVEL,
    metricsPort: METRICS_PORT,
  },

  // Admin API (optional)
  admin: {
    enabled: BOT_ADMIN_ENABLED,
    host: BOT_ADMIN_HOST,
    port: BOT_ADMIN_PORT,
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
