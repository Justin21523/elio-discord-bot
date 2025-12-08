// /src/services/ai/web.js
// English-only code & comments.
//
// Web search tool facade. The AI sidecar is responsible for rate limiting,
// provider routing (Brave/SearXNG), and result normalization.

import { httpGet, httpPostJson } from './_client.js';
import { AI_SERVICE_TIMEOUT_MS } from '../../config.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

export async function search(query, { top = 6 } = {}) {
  const payload = {
    query,
    top,
    provider: 'brave', // Default provider
    cache_ttl: 3600, // 1 hour cache
  };
  try {
    const res = await httpPostJson('/web/search', payload, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web search failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web search unavailable', cause: err } };
  }
}

export async function fetchUrl(url) {
  try {
    const res = await httpGet(`/web/fetch?url=${encodeURIComponent(url)}`, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web fetch failed', cause: res.json } };
    }
    return { ok: true, data: res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web fetch unavailable', cause: err } };
  }
}

/**
 * Enhanced web search with domain filtering and recency options
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum results to return (default: 10)
 * @param {number} options.recencyDays - Filter to results from last N days (1=day, 7=week, 30=month)
 * @param {string[]} options.domains - Filter to specific domains (e.g., ['reddit.com', 'youtube.com'])
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: Object}>}
 */
export async function searchWithFilters(query, { maxResults = 10, recencyDays = null, domains = [] } = {}) {
  const payload = {
    query,
    max_results: maxResults,
    recency_days: recencyDays,
    domains: domains,
    provider: 'brave',
    cache_ttl: 1800, // 30 min cache for social media
  };
  try {
    const res = await httpPostJson('/agent/web-search', payload, AI_SERVICE_TIMEOUT_MS);
    if (res.status >= 400 || !res.json?.ok) {
      return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web search failed', cause: res.json } };
    }
    return { ok: true, data: res.json.data || res.json };
  } catch (err) {
    return { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Web search unavailable', cause: err } };
  }
}

/**
 * Search YouTube videos for a given query
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results (default: 5)
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: Object}>}
 */
export async function searchYouTube(query, maxResults = 5) {
  return searchWithFilters(query, {
    maxResults,
    recencyDays: 30,
    domains: ['youtube.com'],
  });
}

/**
 * Search Reddit posts for a given query
 * @param {string} query - Search query
 * @param {string[]} subreddits - Subreddits to search (e.g., ['Pixar', 'movies'])
 * @param {number} maxResults - Maximum results (default: 5)
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: Object}>}
 */
export async function searchReddit(query, subreddits = [], maxResults = 5) {
  const subredditQuery = subreddits.length > 0
    ? subreddits.map(s => `site:reddit.com/r/${s}`).join(' OR ')
    : 'site:reddit.com';
  return searchWithFilters(`${subredditQuery} ${query}`, {
    maxResults,
    recencyDays: 7,
  });
}

/**
 * Search news articles from entertainment sites
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results (default: 5)
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: Object}>}
 */
export async function searchNews(query, maxResults = 5) {
  return searchWithFilters(query, {
    maxResults,
    recencyDays: 7,
    domains: ['variety.com', 'hollywoodreporter.com', 'deadline.com', 'ew.com', 'ign.com'],
  });
}

/**
 * Search Twitter/X for a given query
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results (default: 5)
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: Object}>}
 */
export async function searchTwitter(query, maxResults = 5) {
  return searchWithFilters(query, {
    maxResults,
    recencyDays: 3,
    domains: ['twitter.com', 'x.com'],
  });
}
