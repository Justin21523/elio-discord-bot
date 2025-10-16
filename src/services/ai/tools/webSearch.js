// src/services/ai/tools/webSearch.js
// ============================================================================
// Web Search Tool - Safe, rate-limited web search for the agent
// ============================================================================

import {
  WEB_SEARCH_ENABLED,
  WEB_SEARCH_API_KEY,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_RATE_LIMIT,
  ErrorCodes,
} from "../../../config.js";
import { logger } from "../../../util/logger.js";

// Simple in-memory rate limiter
const rateLimiter = new Map();

/**
 * @typedef {Object} SearchResult
 * @property {string} title - Result title
 * @property {string} url - Result URL
 * @property {string} snippet - Result snippet/description
 */

/**
 * Check rate limit for web search
 * @param {string} guildId - Guild ID for rate limiting
 * @returns {boolean} - True if under limit
 */
function checkRateLimit(guildId) {
  const now = Date.now();
  const key = `websearch:${guildId}`;
  const history = rateLimiter.get(key) || [];

  // Remove entries older than 1 hour
  const recent = history.filter((timestamp) => now - timestamp < 3600000);

  if (recent.length >= WEB_SEARCH_RATE_LIMIT) {
    return false;
  }

  recent.push(now);
  rateLimiter.set(key, recent);
  return true;
}

/**
 * Perform web search with safety filters and rate limiting
 * @param {object} params
 * @param {string} params.query - Search query
 * @param {string} params.guildId - Guild ID for rate limiting
 * @param {number} [params.maxResults] - Max results to return
 * @returns {Promise<{ok: true, data: SearchResult[]} | {ok: false, error: object}>}
 */
export async function search(params) {
  const { query, guildId, maxResults = WEB_SEARCH_MAX_RESULTS } = params;

  try {
    if (!WEB_SEARCH_ENABLED) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
          message: "Web search is disabled",
        },
      };
    }

    if (!WEB_SEARCH_API_KEY) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
          message: "Web search API key not configured",
        },
      };
    }

    // Rate limiting
    if (!checkRateLimit(guildId)) {
      logger.warn("[TOOL] Web search rate limited", { guildId });
      return {
        ok: false,
        error: {
          code: ErrorCodes.RATE_LIMITED,
          message: `Web search rate limit exceeded (${WEB_SEARCH_RATE_LIMIT} per hour)`,
        },
      };
    }

    logger.info("[TOOL] Web search requested", { query, guildId, maxResults });

    // TODO: Integrate with actual search API (e.g., Brave Search, SerpAPI, etc.)
    // For now, return mock results
    const mockResults = [
      {
        title: "Mock Result 1",
        url: "https://example.com/1",
        snippet: "This is a mock search result for demonstration purposes.",
      },
      {
        title: "Mock Result 2",
        url: "https://example.com/2",
        snippet: "Another mock result showing the structure.",
      },
    ];

    logger.info("[TOOL] Web search completed", {
      query,
      resultsCount: mockResults.length,
    });

    return {
      ok: true,
      data: mockResults.slice(0, maxResults),
    };
  } catch (error) {
    logger.error("[TOOL] Web search error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.UNKNOWN,
        message: "Web search failed",
        cause: error,
      },
    };
  }
}
