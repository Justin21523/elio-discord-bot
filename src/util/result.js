/**
 * Result utility - standardized success/error returns
 * All public async functions must return Result<T>
 */

import { config } from "../config.js";

/**
 * Create a success result
 * @template T
 * @param {T} data - The success data
 * @returns {{ok: true, data: T}}
 */
export function ok(data) {
  return { ok: true, data };
}

/**
 * Create an error result
 * @param {string} code - Error code from config.errorCodes
 * @param {string} message - Human-readable error message
 * @param {any} [cause] - Original error or additional context
 * @param {Object} [details] - Additional error details
 * @returns {{ok: false, error: {code: string, message: string, cause?: any, details?: Object}}}
 */
export function err(code, message, cause = undefined, details = undefined) {
  const error = { code, message };
  if (cause !== undefined) error.cause = cause;
  if (details !== undefined) error.details = details;
  return { ok: false, error };
}

/**
 * Check if a result is successful
 * @param {Result} result
 * @returns {boolean}
 */
export function isOk(result) {
  return result.ok === true;
}

/**
 * Check if a result is an error
 * @param {Result} result
 * @returns {boolean}
 */
export function isErr(result) {
  return result.ok === false;
}

/**
 * Wrap an async function to catch errors and return Result
 * @param {Function} fn - Async function to wrap
 * @param {string} errorCode - Error code to use on failure
 * @returns {Function} Wrapped function that returns Result
 */
export function wrapAsync(fn, errorCode = config.errorCodes.UNKNOWN) {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return ok(result);
    } catch (error) {
      return err(errorCode, error.message || "An error occurred", error);
    }
  };
}

/**
 * Map a MongoDB error to appropriate error code
 * @param {Error} error - MongoDB error
 * @returns {string} Error code
 */
export function getMongoErrorCode(error) {
  if (error.code === 11000) {
    return config.errorCodes.VALIDATION_FAILED; // Duplicate key
  }
  if (error.name === "MongoNetworkError") {
    return config.errorCodes.DEPENDENCY_UNAVAILABLE;
  }
  if (error.name === "MongoTimeoutError") {
    return config.errorCodes.DB_ERROR;
  }
  return config.errorCodes.DB_ERROR;
}

/**
 * Create a friendly error message for Discord replies
 * @param {string} code - Error code
 * @returns {string} User-friendly message
 */
export function getFriendlyErrorMessage(code) {
  const messages = {
    [config.errorCodes.BAD_REQUEST]:
      "Invalid request. Please check your input and try again.",
    [config.errorCodes.NOT_FOUND]: "Could not find what you're looking for.",
    [config.errorCodes.FORBIDDEN]: "You don't have permission to do that.",
    [config.errorCodes.RATE_LIMITED]:
      "Slow down! You're sending commands too quickly.",
    [config.errorCodes.DB_ERROR]: "Database error. Please try again later.",
    [config.errorCodes.DISCORD_API_ERROR]:
      "Discord API error. Please try again.",
    [config.errorCodes.AI_MODEL_ERROR]: "AI service is currently unavailable.",
    [config.errorCodes.AI_TIMEOUT]: "AI request timed out. Please try again.",
    [config.errorCodes.DEPENDENCY_UNAVAILABLE]:
      "Service temporarily unavailable.",
    [config.errorCodes.SCHEDULE_ERROR]:
      "Failed to schedule. Please check the time format.",
    [config.errorCodes.RAG_EMPTY]: "No relevant information found.",
    [config.errorCodes.VALIDATION_FAILED]: "Invalid data provided.",
    [config.errorCodes.UNKNOWN]: "An unexpected error occurred.",
  };

  return messages[code] || messages[config.errorCodes.UNKNOWN];
}

export default {
  ok,
  err,
  isOk,
  isErr,
  wrapAsync,
  getMongoErrorCode,
  getFriendlyErrorMessage,
};
