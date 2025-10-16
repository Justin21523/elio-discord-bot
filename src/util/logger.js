<<<<<<< HEAD
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
=======
// /src/util/logger.js
// English-only code & comments.
// Lightweight structured logger used across the project.
// - Named exports: logInfo / logWarn / logError / logger
// - Default export: logger (compatible with previous imports)
// - Production: JSON lines; Development: pretty text
// - All helpers accept an optional context object (merged at root)

import { CONFIG } from '../config.js';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Resolve current level from config (string) -> numeric
const currentLevel =
  LOG_LEVELS[(CONFIG?.logLevel ?? 'info').toLowerCase()] ?? LOG_LEVELS.info;

/**
 * Format one log entry.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [context]
 * @returns {string}
 */
function format(level, message, context = {}) {
  const timestamp = new Date().toISOString();

  // JSON in production for better ingestion by log backends
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...context,
    });
  }

  // Pretty in development
  const ctx =
    context && Object.keys(context).length
      ? ' ' + JSON.stringify(context, null, 2)
      : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${ctx}`;
}

/**
 * Core logging function (level-gated).
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [context]
 */
function log(level, message, context = {}) {
  if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) < currentLevel) return;
  const line = format(level, message, context);
  // Route to console
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Public helpers
 */
export function logDebug(message, context = {}) {
  log('debug', message, context);
}
export function logInfo(message, context = {}) {
  log('info', message, context);
}
export function logWarn(message, context = {}) {
  log('warn', message, context);
}
export function logError(message, context = {}) {
  log('error', message, context);
}

/**
 * Logger facade with child() to attach default context.
 */
export const logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  /**
   * Create a child logger with fixed context merged into all calls.
   * @param {object} fixed
   */
  child(fixed = {}) {
    const merge = (ctx) => ({ ...fixed, ...(ctx || {}) });
    return {
      debug: (msg, ctx) => logDebug(msg, merge(ctx)),
      info: (msg, ctx) => logInfo(msg, merge(ctx)),
      warn: (msg, ctx) => logWarn(msg, merge(ctx)),
      error: (msg, ctx) => logError(msg, merge(ctx)),
    };
  },
};

// Keep default export for legacy imports like `import logger from ...`
export default logger;
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
