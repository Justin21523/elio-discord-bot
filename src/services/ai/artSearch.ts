// src/services/ai/artSearch.js
// Art platform search wrapper for DeviantArt and Tumblr

import { httpPostJson } from './_client.js';
import { AI_SERVICE_TIMEOUT_MS } from '../../config.js';
import { logger } from '../../util/logger.js';

/**
 * @typedef {Object} ArtItem
 * @property {string} title - Artwork title
 * @property {string} url - Artwork URL
 * @property {string} thumbnail_url - Thumbnail image URL
 * @property {string} preview_url - Preview image URL (higher quality)
 * @property {string} platform - Platform name (deviantart, tumblr)
 * @property {string} content_type - Content type (art)
 * @property {Object} attribution - Artist attribution
 * @property {string} attribution.artist - Artist name
 * @property {string} attribution.artist_url - Artist profile URL
 * @property {string} attribution.license - License (e.g., "CC BY-NC-SA 3.0")
 * @property {string} [published_date] - Publication date
 * @property {string[]} [tags] - Artwork tags
 * @property {boolean} [mature_content] - Whether content is marked mature
 */

/**
 * Search DeviantArt for artwork
 * @param {string} query - Search query (e.g., "Elio Pixar")
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum results (default: 10)
 * @param {boolean} options.matureContent - Include mature content (default: false)
 * @param {string[]} options.licenseFilter - Filter by license (e.g., ['creative_commons'])
 * @returns {Promise<{ok: true, data: ArtItem[]} | {ok: false, error: Object}>}
 */
export async function searchDeviantArt(
  query: string,
  {
    maxResults = 10,
    matureContent = false,
    licenseFilter = [],
  }: { maxResults?: number; matureContent?: boolean; licenseFilter?: string[] } = {}
): Promise<any> {
  const payload = {
    platform: 'deviantart',
    query,
    max_results: maxResults,
    mature_content: matureContent,
    license_filter: licenseFilter,
  };

  try {
    const res = await httpPostJson('/content-discovery/art-search', payload, AI_SERVICE_TIMEOUT_MS * 2);

    if (res.status >= 400 || !res.json?.ok) {
      logger.warn('[ART-SEARCH] DeviantArt search failed', {
        query,
        status: res.status,
        error: res.json?.error
      });
      return {
        ok: false,
        error: {
          code: 'ART_SEARCH_FAILED',
          message: 'DeviantArt search failed',
          cause: res.json?.error
        }
      };
    }

    return {
      ok: true,
      data: res.json.data?.results || []
    };
  } catch (err: any) {
    logger.error('[ART-SEARCH] DeviantArt search error', { query, error: err.message });
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'DeviantArt search unavailable',
        cause: err
      }
    };
  }
}

/**
 * Search Tumblr for posts
 * @param {string} query - Search query (e.g., "Elio Pixar fanart")
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum results (default: 10)
 * @param {boolean} options.filterNsfw - Filter NSFW content (default: true)
 * @returns {Promise<{ok: true, data: ArtItem[]} | {ok: false, error: Object}>}
 */
export async function searchTumblr(
  query: string,
  { maxResults = 10, filterNsfw = true }: { maxResults?: number; filterNsfw?: boolean } = {}
): Promise<any> {
  const payload = {
    platform: 'tumblr',
    query,
    max_results: maxResults,
    filter_nsfw: filterNsfw,
  };

  try {
    const res = await httpPostJson('/content-discovery/art-search', payload, AI_SERVICE_TIMEOUT_MS * 2);

    if (res.status >= 400 || !res.json?.ok) {
      logger.warn('[ART-SEARCH] Tumblr search failed', {
        query,
        status: res.status,
        error: res.json?.error
      });
      return {
        ok: false,
        error: {
          code: 'ART_SEARCH_FAILED',
          message: 'Tumblr search failed',
          cause: res.json?.error
        }
      };
    }

    return {
      ok: true,
      data: res.json.data?.results || []
    };
  } catch (err: any) {
    logger.error('[ART-SEARCH] Tumblr search error', { query, error: err.message });
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Tumblr search unavailable',
        cause: err
      }
    };
  }
}

/**
 * Search all art platforms
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string[]} options.platforms - Platforms to search (['deviantart', 'tumblr'])
 * @param {number} options.maxResultsPerPlatform - Max results per platform (default: 10)
 * @param {boolean} options.filterNsfw - Filter NSFW content (default: true)
 * @returns {Promise<{ok: true, data: {deviantart: ArtItem[], tumblr: ArtItem[]}} | {ok: false, error: Object}>}
 */
export async function searchAllPlatforms(query: string, {
  platforms = ['deviantart', 'tumblr'],
  maxResultsPerPlatform = 10,
  filterNsfw = true
}: { platforms?: string[]; maxResultsPerPlatform?: number; filterNsfw?: boolean } = {}): Promise<any> {
  const results: Record<string, any[]> = {
    deviantart: [],
    tumblr: [],
  };

  const searches = [];

  if (platforms.includes('deviantart')) {
    searches.push(
      searchDeviantArt(query, {
        maxResults: maxResultsPerPlatform,
        matureContent: !filterNsfw
      })
        .then(res => ({ platform: 'deviantart', res }))
    );
  }

  if (platforms.includes('tumblr')) {
    searches.push(
      searchTumblr(query, {
        maxResults: maxResultsPerPlatform,
        filterNsfw
      })
        .then(res => ({ platform: 'tumblr', res }))
    );
  }

  const searchResults = await Promise.all(searches);

  for (const { platform, res } of searchResults) {
    if (res.ok) {
      results[platform] = res.data;
    } else {
      logger.warn(`[ART-SEARCH] ${platform} failed`, { error: res.error });
    }
  }

  return {
    ok: true,
    data: results,
  };
}

/**
 * Check art platform availability
 * @returns {Promise<{ok: true, data: Object} | {ok: false, error: Object}>}
 */
export async function checkPlatformStatus() {
  try {
    const res = await httpPostJson('/content-discovery/platforms', {}, AI_SERVICE_TIMEOUT_MS);

    if (res.status >= 400 || !res.json?.ok) {
      return {
        ok: false,
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Platform status check failed'
        }
      };
    }

    return {
      ok: true,
      data: res.json.data?.platforms || {}
    };
  } catch (err: any) {
    logger.error('[ART-SEARCH] Platform status check error', { error: err.message });
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Platform status unavailable',
        cause: err
      }
    };
  }
}
