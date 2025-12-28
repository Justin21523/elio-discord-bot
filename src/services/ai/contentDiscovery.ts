// src/services/ai/contentDiscovery.js
// Multi-platform content discovery with LLM scoring and diversity ranking

import { httpPostJson } from './_client.js';
import { AI_SERVICE_TIMEOUT_MS } from '../../config.js';
import { logger } from '../../util/logger.js';

type OrchestratedSearchOptions = {
  platforms?: string[] | null;
  maxResults?: number;
  contentTypes?: string[] | null;
};

/**
 * @typedef {Object} ContentItem
 * @property {string} title - Content title
 * @property {string} url - Content URL
 * @property {string} [snippet] - Content snippet/description
 * @property {string} platform - Platform name (variety.com, youtube, deviantart, etc.)
 * @property {string} content_type - Content type (news, video, discussion, art)
 * @property {string} [published_date] - Publication date
 * @property {number} relevance_score - Relevance score (0-100+)
 * @property {Object} [score_breakdown] - Score breakdown
 * @property {number} score_breakdown.topic - Topic relevance (0-100)
 * @property {number} score_breakdown.quality - Content quality (0-100)
 * @property {number} score_breakdown.recency - Recency bonus (0-20)
 * @property {number} score_breakdown.credibility - Source credibility (0-20)
 * @property {string} [relevance_reasoning] - LLM reasoning for score
 * @property {number} [adjusted_score] - Diversity-adjusted score
 * @property {Object} [attribution] - Attribution (for art)
 * @property {string} [attribution.artist] - Artist name
 * @property {string} [attribution.artist_url] - Artist profile URL
 * @property {string} [attribution.license] - License
 */

/**
 * @typedef {Object} DiscoveryResult
 * @property {string} query - Original search query
 * @property {ContentItem[]} results - Scored and ranked content items
 * @property {number} total_results - Total number of results
 * @property {number} diversity_score - Shannon entropy diversity score (0-100)
 * @property {string[]} platforms_covered - Platforms that returned results
 * @property {number} [duration_ms] - Request duration in milliseconds
 */

/**
 * Orchestrated content discovery across all platforms
 *
 * This function performs:
 * 1. Multi-source aggregation (news, YouTube, Reddit, Twitter, DeviantArt, Tumblr)
 * 2. LLM-powered relevance scoring (topic, quality, recency, credibility)
 * 3. Diversity-aware ranking (platform balancing, duplicate detection)
 *
 * @param {string} query - Search query (e.g., "Elio Pixar movie 2025")
 * @param {Object} options - Discovery options
 * @param {string[]} options.platforms - Platforms to search (default: all)
 *   Options: 'news', 'youtube', 'reddit', 'twitter', 'deviantart', 'tumblr'
 * @param {number} options.maxResults - Maximum total results (default: 20)
 * @param {string[]} options.contentTypes - Desired content types (default: all)
 *   Options: 'news', 'video', 'discussion', 'art'
 * @returns {Promise<{ok: true, data: DiscoveryResult} | {ok: false, error: Object}>}
 *
 * @example
 * const result = await orchestratedSearch('Elio Pixar movie', {
 *   platforms: ['news', 'youtube', 'deviantart'],
 *   maxResults: 20,
 *   contentTypes: ['news', 'video', 'art']
 * });
 *
 * if (result.ok) {
 *   console.log(`Found ${result.data.total_results} results`);
 *   console.log(`Diversity score: ${result.data.diversity_score}`);
 *   result.data.results.forEach(item => {
 *     console.log(`- ${item.title} (${item.platform}, score: ${item.relevance_score})`);
 *     if (item.attribution) {
 *       console.log(`  Artist: ${item.attribution.artist}`);
 *     }
 *   });
 * }
 */
export async function orchestratedSearch(query: string, {
  platforms = null, // null = all platforms
  maxResults = 20,
  contentTypes = null // null = all content types
}: OrchestratedSearchOptions = {}): Promise<any> {
  const payload = {
    query,
    platforms,
    max_results: maxResults,
    content_types: contentTypes,
  };

  logger.info('[CONTENT-DISCOVERY] Starting orchestrated search', {
    query,
    platforms: platforms || 'all',
    maxResults
  });

  try {
    // Use extended timeout for complex searches
    const timeout = AI_SERVICE_TIMEOUT_MS * 3; // 90 seconds default
    const res = await httpPostJson('/content-discovery/discover', payload, timeout);

    if (res.status >= 400 || !res.json?.ok) {
      logger.warn('[CONTENT-DISCOVERY] Search failed', {
        query,
        status: res.status,
        error: res.json?.error
      });
      return {
        ok: false,
        error: {
          code: 'CONTENT_DISCOVERY_FAILED',
          message: 'Content discovery failed',
          cause: res.json?.error
        }
      };
    }

    const data = res.json.data;

    logger.info('[CONTENT-DISCOVERY] Search completed', {
      query,
      total_results: data.total_results,
      diversity_score: data.diversity_score,
      platforms_covered: data.platforms_covered,
      duration_ms: data.duration_ms
    });

    return {
      ok: true,
      data: {
        query: data.query,
        results: data.results || [],
        total_results: data.total_results || 0,
        diversity_score: data.diversity_score || 0.0,
        platforms_covered: data.platforms_covered || [],
        duration_ms: data.duration_ms,
      }
    };
  } catch (err: any) {
    logger.error('[CONTENT-DISCOVERY] Search error', {
      query,
      error: err.message
    });
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Content discovery service unavailable',
        cause: err
      }
    };
  }
}

/**
 * Search specific platforms (convenience wrapper)
 * @param {string} query - Search query
 * @param {string[]} platforms - Platforms to search
 * @param {number} maxResults - Maximum results
 * @returns {Promise<{ok: true, data: DiscoveryResult} | {ok: false, error: Object}>}
 */
export async function searchPlatforms(query: string, platforms: string[], maxResults = 20): Promise<any> {
  return orchestratedSearch(query, { platforms, maxResults });
}

/**
 * Search for news only
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results
 * @returns {Promise<{ok: true, data: DiscoveryResult} | {ok: false, error: Object}>}
 */
export async function searchNews(query: string, maxResults = 10): Promise<any> {
  return orchestratedSearch(query, {
    platforms: ['news'],
    contentTypes: ['news'],
    maxResults
  });
}

/**
 * Search for videos only (YouTube)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results
 * @returns {Promise<{ok: true, data: DiscoveryResult} | {ok: false, error: Object}>}
 */
export async function searchVideos(query: string, maxResults = 10): Promise<any> {
  return orchestratedSearch(query, {
    platforms: ['youtube'],
    contentTypes: ['video'],
    maxResults
  });
}

/**
 * Search for discussions (Reddit, Twitter)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results
 * @returns {Promise<{ok: true, data: DiscoveryResult} | {ok: false, error: Object}>}
 */
export async function searchDiscussions(query: string, maxResults = 10): Promise<any> {
  return orchestratedSearch(query, {
    platforms: ['reddit', 'twitter'],
    contentTypes: ['discussion'],
    maxResults
  });
}

/**
 * Search for art only (DeviantArt, Tumblr)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results
 * @returns {Promise<{ok: true, data: DiscoveryResult} | {ok: false, error: Object}>}
 */
export async function searchArt(query: string, maxResults = 10): Promise<any> {
  return orchestratedSearch(query, {
    platforms: ['deviantart', 'tumblr'],
    contentTypes: ['art'],
    maxResults
  });
}

/**
 * Check content discovery service health
 * @returns {Promise<{ok: true, data: Object} | {ok: false, error: Object}>}
 */
export async function checkHealth() {
  try {
    const res = await httpPostJson('/content-discovery/health', {}, AI_SERVICE_TIMEOUT_MS);

    if (res.status >= 400 || !res.json?.ok) {
      return {
        ok: false,
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Content discovery health check failed'
        }
      };
    }

    return {
      ok: true,
      data: res.json
    };
  } catch (err: any) {
    logger.error('[CONTENT-DISCOVERY] Health check error', { error: err.message });
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Content discovery service unavailable',
        cause: err
      }
    };
  }
}
