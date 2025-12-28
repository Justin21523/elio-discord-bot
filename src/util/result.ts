/**
 * Result utility - standardized success/error returns
 * All public async functions must return Result<T>
 */

import { ErrorCodes } from "../config.js";

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes] | string;

export type AppError = {
  code: ErrorCode;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

/**
 * Create a success result
 * @template T
 * @param {T} data - The success data
 * @returns {{ok: true, data: T}}
 */
export function ok<T>(data: T): Result<T> {
  return { ok: true, data } as const;
}

/**
 * Create an error result
 * @param {string} code - Error code from config.errorCodes
 * @param {string} message - Human-readable error message
 * @param {any} [cause] - Original error or additional context
 * @param {Object} [details] - Additional error details
 * @returns {{ok: false, error: {code: string, message: string, cause?: any, details?: Object}}}
 */
export function err(
  code: ErrorCode,
  message: string,
  cause?: unknown,
  details?: Record<string, unknown>
): Result<never> {
  const error: AppError = { code, message };
  if (cause !== undefined) error.cause = cause;
  if (details !== undefined) error.details = details;
  return { ok: false, error };
}

/**
 * Check if a result is successful
 * @param {Result} result
 * @returns {boolean}
 */
export function isOk<T>(result: Result<T>): result is { ok: true; data: T } {
  return result.ok === true;
}

/**
 * Check if a result is an error
 * @param {Result} result
 * @returns {boolean}
 */
export function isErr<T>(result: Result<T>): result is { ok: false; error: AppError } {
  return result.ok === false;
}

/**
 * Wrap an async function to catch errors and return Result
 * @param {Function} fn - Async function to wrap
 * @param {string} errorCode - Error code to use on failure
 * @returns {Function} Wrapped function that returns Result
 */
export function wrapAsync<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn> | TReturn,
  errorCode: ErrorCode = ErrorCodes.UNKNOWN
): (...args: TArgs) => Promise<Result<TReturn>> {
  return async (...args: TArgs) => {
    try {
      const result = await fn(...args);
      return ok(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "An error occurred";
      return err(errorCode, message, error);
    }
  };
}

/**
 * Map a MongoDB error to appropriate error code
 * @param {Error} error - MongoDB error
 * @returns {string} Error code
 */
export function getMongoErrorCode(error: unknown): ErrorCode {
  if (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  ) {
    return ErrorCodes.VALIDATION_FAILED; // Duplicate key
  }
  if (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name?: unknown }).name === "MongoNetworkError"
  ) {
    return ErrorCodes.DEPENDENCY_UNAVAILABLE;
  }
  if (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name?: unknown }).name === "MongoTimeoutError"
  ) {
    return ErrorCodes.DB_ERROR;
  }
  return ErrorCodes.DB_ERROR;
}

/**
 * Create a friendly error message for Discord replies
 * @param {string} code - Error code
 * @returns {string} User-friendly message
 */
export function getFriendlyErrorMessage(code: ErrorCode): string {
  const messages: Record<string, string> = {
    [ErrorCodes.BAD_REQUEST]:
      "Invalid request. Please check your input and try again.",
    [ErrorCodes.NOT_FOUND]: "Could not find what you're looking for.",
    [ErrorCodes.FORBIDDEN]: "You don't have permission to do that.",
    [ErrorCodes.RATE_LIMITED]:
      "Slow down! You're sending commands too quickly.",
    [ErrorCodes.DB_ERROR]: "Database error. Please try again later.",
    [ErrorCodes.DISCORD_API_ERROR]:
      "Discord API error. Please try again.",
    [ErrorCodes.AI_MODEL_ERROR]: "AI service is currently unavailable.",
    [ErrorCodes.AI_TIMEOUT]: "AI request timed out. Please try again.",
    [ErrorCodes.DEPENDENCY_UNAVAILABLE]:
      "Service temporarily unavailable.",
    [ErrorCodes.SCHEDULE_ERROR]:
      "Failed to schedule. Please check the time format.",
    [ErrorCodes.RAG_EMPTY]: "No relevant information found.",
    [ErrorCodes.VALIDATION_FAILED]: "Invalid data provided.",
    [ErrorCodes.UNKNOWN]: "An unexpected error occurred.",
  };

  return (
    messages[code] ??
    messages[ErrorCodes.UNKNOWN] ??
    "An unexpected error occurred."
  );
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
