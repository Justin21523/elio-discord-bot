/**
 * util/logger.ts
 * Structured logging with consistent prefixes.
 * Prefixes: [CMD], [INT], [JOB], [ERR], [DB], [AI]
 */

import { config } from "../config.js";

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel =
  LOG_LEVELS[config.observability.logLevel as LogLevel] ?? LOG_LEVELS.info;

/**
 * Format log entry as JSON
 */
function formatLog(
  level: LogLevel,
  prefix: string,
  message: string,
  meta: Record<string, unknown> = {}
) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    prefix,
    message,
    ...meta,
  });
}

/**
 * Log at specified level
 */
function log(
  level: LogLevel,
  prefix: string,
  message: string,
  meta: Record<string, unknown> = {}
) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const formatted = formatLog(level, prefix, message, meta);

  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export const logger = {
  error: (message: string, meta?: Record<string, unknown>) =>
    log("error", "[ERR]", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log("warn", "[WARN]", message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    log("info", "[INFO]", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) =>
    log("debug", "[DEBUG]", message, meta),

  // Specialized prefixes
  command: (message: string, meta?: Record<string, unknown>) =>
    log("info", "[CMD]", message, meta),
  interaction: (message: string, meta?: Record<string, unknown>) =>
    log("info", "[INT]", message, meta),
  job: (message: string, meta?: Record<string, unknown>) =>
    log("info", "[JOB]", message, meta),
  db: (message: string, meta?: Record<string, unknown>) =>
    log("info", "[DB]", message, meta),
  ai: (message: string, meta?: Record<string, unknown>) =>
    log("info", "[AI]", message, meta),

  // Child logger with custom service name
  child: (context: Record<string, unknown>) => ({
    error: (message: string, meta?: Record<string, unknown>) =>
      log("error", "[ERR]", message, { ...context, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log("warn", "[WARN]", message, { ...context, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      log("info", "[INFO]", message, { ...context, ...meta }),
    debug: (message: string, meta?: Record<string, unknown>) =>
      log("debug", "[DEBUG]", message, { ...context, ...meta }),
  }),
};

// Legacy exports for backward compatibility
export const logError = (message: string, meta?: Record<string, unknown>) =>
  logger.error(message, meta);
export const logInfo = (message: string, meta?: Record<string, unknown>) =>
  logger.info(message, meta);
export const logWarn = (message: string, meta?: Record<string, unknown>) =>
  logger.warn(message, meta);
export const logDebug = (message: string, meta?: Record<string, unknown>) =>
  logger.debug(message, meta);
