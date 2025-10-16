/**
 * util/logger.js
 * Structured logging with consistent prefixes.
 * Prefixes: [CMD], [INT], [JOB], [ERR], [DB], [AI]
 */

import { config } from "../config.js";

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel =
  LOG_LEVELS[config.observability.logLevel] || LOG_LEVELS.info;

/**
 * Format log entry as JSON
 */
function formatLog(level, prefix, message, meta = {}) {
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
function log(level, prefix, message, meta = {}) {
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
  error: (message, meta) => log("error", "[ERR]", message, meta),
  warn: (message, meta) => log("warn", "[WARN]", message, meta),
  info: (message, meta) => log("info", "[INFO]", message, meta),
  debug: (message, meta) => log("debug", "[DEBUG]", message, meta),

  // Specialized prefixes
  command: (message, meta) => log("info", "[CMD]", message, meta),
  interaction: (message, meta) => log("info", "[INT]", message, meta),
  job: (message, meta) => log("info", "[JOB]", message, meta),
  db: (message, meta) => log("info", "[DB]", message, meta),
  ai: (message, meta) => log("info", "[AI]", message, meta),
};
