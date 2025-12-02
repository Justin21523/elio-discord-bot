// src/services/ai/client.js
// ============================================================================
// AI Service HTTP Client - Base client for all AI service API calls
// ============================================================================

import axios from "axios";
import {
  AI_SERVICE_URL,
  AI_SERVICE_TIMEOUT_MS,
  AI_MOCK_MODE,
} from "../../config.js";
import { logger } from "../../util/logger.js";
import { incrementCounter, observeHistogram } from "../../util/metrics.js";
import { mockPost, mockGet } from "./mock.js";

/**
 * Create axios instance for AI service
 */
const client = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: AI_SERVICE_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Request interceptor - add logging and metrics
 */
client.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: Date.now() };
    logger.debug("[AI-CLIENT] Request", {
      method: config.method,
      url: config.url,
      data: config.data,
    });
    return config;
  },
  (error) => {
    logger.error("[AI-CLIENT] Request error", { error: error.message });
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - add logging and metrics
 */
client.interceptors.response.use(
  (response) => {
    const latencyMs = Date.now() - response.config.metadata.startTime;

    observeHistogram("ai_service_latency_seconds", latencyMs / 1000, {
      endpoint: response.config.url,
      status: response.status,
    });

    incrementCounter("ai_service_requests_total", {
      endpoint: response.config.url,
      status: response.status,
    });

    logger.debug("[AI-CLIENT] Response", {
      url: response.config.url,
      status: response.status,
      latencyMs,
    });

    return response;
  },
  (error) => {
    const latencyMs = error.config?.metadata?.startTime
      ? Date.now() - error.config.metadata.startTime
      : 0;

    const status = error.response?.status || 0;

    incrementCounter("ai_service_requests_total", {
      endpoint: error.config?.url || "unknown",
      status: status || "error",
    });

    logger.error("[AI-CLIENT] Response error", {
      url: error.config?.url,
      status,
      latencyMs,
      error: error.message,
      data: error.response?.data,
    });

    return Promise.reject(error);
  }
);

/**
 * Make a POST request to AI service
 * @param {string} endpoint - API endpoint (e.g., '/llm/generate')
 * @param {object} data - Request payload
 * @returns {Promise<{ok: true, data: any} | {ok: false, error: object}>}
 */
export async function post(endpoint, data) {
  if (AI_MOCK_MODE) {
    logger.debug("[AI-CLIENT] Mock POST", { endpoint });
    return mockPost(endpoint, data);
  }

  try {
    const response = await client.post(endpoint, data);

    // AI service returns {ok: true, data: {...}}
    if (response.data && response.data.ok) {
      return response.data;
    }

    // If response doesn't have ok field, wrap it
    return {
      ok: true,
      data: response.data,
    };
  } catch (error) {
    // Handle network errors
    if (error.code === "ECONNREFUSED") {
      return {
        ok: false,
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          message: "AI service is not available",
          details: { endpoint, cause: error.message },
        },
      };
    }

    // Handle timeout errors
    if (error.code === "ECONNABORTED") {
      return {
        ok: false,
        error: {
          code: "TIMEOUT",
          message: "AI service request timed out",
          details: { endpoint, timeout: AI_SERVICE_TIMEOUT_MS },
        },
      };
    }

    // Handle HTTP errors with response
    if (error.response?.data) {
      const errorData = error.response.data;

      // If AI service returned error in our format
      if (errorData.ok === false && errorData.error) {
        return errorData;
      }

      // Otherwise wrap the error
      return {
        ok: false,
        error: {
          code: "AI_MODEL_ERROR",
          message: errorData.message || "AI service error",
          details: errorData,
        },
      };
    }

    // Generic error
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error.message || "Unknown AI service error",
        details: { endpoint },
      },
    };
  }
}

/**
 * Make a GET request to AI service
 * @param {string} endpoint - API endpoint
 * @param {object} params - Query parameters
 * @returns {Promise<{ok: true, data: any} | {ok: false, error: object}>}
 */
export async function get(endpoint, params = {}) {
  if (AI_MOCK_MODE) {
    logger.debug("[AI-CLIENT] Mock GET", { endpoint });
    return mockGet(endpoint, params);
  }

  try {
    const response = await client.get(endpoint, { params });

    if (response.data && response.data.ok) {
      return response.data;
    }

    return {
      ok: true,
      data: response.data,
    };
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      return {
        ok: false,
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          message: "AI service is not available",
          details: { endpoint },
        },
      };
    }

    if (error.response?.data?.ok === false) {
      return error.response.data;
    }

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: error.message || "AI service error",
        details: { endpoint },
      },
    };
  }
}

/**
 * Check AI service health
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function healthCheck() {
  return get("/health");
}

export default client;
