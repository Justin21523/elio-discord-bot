/**
 * jobs/socialMediaMonitor.js
 * Proactive social media monitoring for Elio-related content
 *
 * This job runs every 2 hours to:
 * 1. Search Reddit, YouTube, Twitter/X, and news sites for Elio-related content
 * 2. Filter out previously shared content (deduplication)
 * 3. Select a random persona to share the news
 * 4. Generate a character-voice reaction and post to Discord
 * 5. For YouTube videos, optionally extract transcripts for analysis
 */

import { logger } from "../util/logger.js";
import { incCounter } from "../util/metrics.js";
import { generate as llmGenerate } from "../services/ai/llm.js";
import { searchYouTube, searchReddit, searchNews, searchTwitter } from "../services/ai/web.js";
import webhooks from "../services/webhooks.js";
import personas from "../services/persona.js";
import { getCollection, getDb } from "../db/mongo.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (!items?.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG_KEY = "social_media_monitor";
const COLLECTION_NAME = "social_media_shares";
const VIDEO_TRANSCRIPTS_COLLECTION = "video_transcripts";

// Search queries based on Elio knowledge base keywords
// Enhanced for better coverage and more diverse results
const SEARCH_KEYWORDS = {
  // High-priority searches - most likely to find relevant content
  primary: [
    "Elio Pixar movie 2025",
    "Pixar Elio film",
    "Elio animated movie",
    "Elio Pixar trailer",
    "Elio Disney Pixar",
    '"Elio" Pixar',
  ],
  // Character-focused searches
  characters: [
    "Elio Solis Pixar",
    "Ambassador Questa Elio",
    "Glordon Communiverse",
    "Olga Solares Pixar",
    "Zoe Saldana Elio voice",
    "Brad Garrett Elio movie",
    "Remy Edgerly Elio",
  ],
  // Topic variations for news and discussions
  topics: [
    "Communiverse Pixar aliens",
    "Elio box office 2025",
    "Elio movie review",
    "Elio Pixar soundtrack",
    "Elio release date",
    "Elio Pixar premiere",
    "Pixar alien movie Elio",
    "Elio animation behind scenes",
  ],
  // Recent news and buzz
  timely: [
    "Elio Pixar news",
    "Elio movie update",
    "new Pixar Elio",
    "Elio film latest",
  ],
  // Voice actors and production
  production: [
    "Elio voice cast",
    "Pixar Elio director",
    "Elio movie production",
    "Elio Pixar making of",
  ],
  subreddits: ["Pixar", "movies", "animation", "boxoffice", "disney", "entertainment"],
};

// ============================================================================
// AI Prompts (Clear and Detailed)
// ============================================================================

const PROMPTS = {
  /**
   * Prompt for evaluating if content is relevant to Elio/Communiverse
   * Used to filter out false positives from web search
   */
  RELEVANCE_CHECK: `You are an AI assistant helping to identify content about the Pixar movie "Elio" (2025).

TASK: Determine if the following content is about the Pixar animated movie "Elio" featuring an 11-year-old boy who meets aliens from the Communiverse.

CONTENT TO EVALUATE:
Title: {title}
Description: {snippet}
URL: {url}

RELEVANT IF:
- Mentions the Pixar animated movie "Elio" (2025)
- Discusses characters: Elio Solis, Olga Solares, Ambassador Questa, Glordon
- References the Communiverse (alien world/organization)
- Covers movie news, reviews, trailers, box office for this specific film
- Features voice actors: Zoe Saldana, Remy Edgerly, Brad Garrett

NOT RELEVANT IF:
- About a different person/movie named Elio
- Unrelated Pixar content
- Generic alien/space content not about this specific movie

RESPOND WITH ONLY: "RELEVANT" or "NOT_RELEVANT"`,

  /**
   * Prompt for generating a character reaction to news
   * The persona will share this news in their unique voice
   */
  CHARACTER_REACTION: `You are {personaName}, a character from the movie "Elio". You just discovered some exciting news and want to share it with your friends on Discord.

YOUR PERSONALITY:
{personaDescription}

NEWS TO REACT TO:
Title: {title}
Summary: {snippet}
Source: {source}

YOUR TASK:
Write a brief, enthusiastic reaction (2-3 sentences, max 280 characters) to this news IN YOUR CHARACTER VOICE.

GUIDELINES:
- Stay completely in character as {personaName}
- Show genuine excitement or interest about the news
- Use your character's unique speech patterns and personality
- Don't just summarize - REACT with emotion
- Keep it conversational and natural for Discord
- Do NOT include URLs or links
- Do NOT use hashtags

RESPOND WITH YOUR CHARACTER REACTION ONLY:`,

  /**
   * Prompt for summarizing YouTube video transcript
   * Used to extract key information from video content
   */
  VIDEO_SUMMARY: `You are analyzing a YouTube video transcript about the Pixar movie "Elio".

VIDEO TITLE: {title}
TRANSCRIPT:
{transcript}

TASK: Create a concise summary (3-5 bullet points) of the key information in this video.

FOCUS ON:
- New plot details or character information
- Release date, box office, or production updates
- Cast/crew interviews or insights
- Fan reactions or critical reception
- Behind-the-scenes information

FORMAT YOUR RESPONSE AS:
- [Point 1]
- [Point 2]
- [Point 3]

Keep each point brief and informative.`,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get configuration from database
 * @param {Db} db - MongoDB database instance
 * @returns {Promise<Object>} Configuration object
 */
async function getConfig(db: any) {
  const botConfig = db.collection("bot_config");
  const config = await botConfig.findOne({ key: CONFIG_KEY });

  return {
    enabled: config?.enabled ?? false,
    channelIds: config?.channelIds ?? [],
    maxSharesPerRun: config?.maxSharesPerRun ?? 3,
    sources: config?.sources ?? {
      reddit: true,
      news: true,
      twitter: true,
      youtube: true,
    },
    // Channel pattern matching
    channelPattern: config?.channelPattern ?? null,
    channelPatternEnabled: config?.channelPatternEnabled ?? false,
    // Server filtering
    serverMode: config?.serverMode ?? "all", // 'all', 'include', 'exclude'
    serverIds: config?.serverIds ?? [],
  };
}

/**
 * Check if a channel name matches the pattern
 * @param {string} channelName - The channel name to check
 * @param {string} pattern - The pattern to match (supports * wildcard, or substring match if no wildcards)
 * @returns {boolean} True if the channel name matches the pattern
 */
function matchesChannelPattern(channelName: string, pattern: string | null) {
  if (!pattern) return false;

  // If pattern has no wildcards, do a simple substring match (case-insensitive)
  if (!pattern.includes('*')) {
    return channelName.toLowerCase().includes(pattern.toLowerCase());
  }

  // Convert pattern to regex (case-insensitive)
  // * becomes .* (match any characters)
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
    .replace(/\*/g, '.*'); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(channelName);
}

/**
 * Check if a server should be processed based on config
 * @param {string} guildId - The guild ID to check
 * @param {Object} config - The configuration object
 * @returns {boolean} True if the server should be processed
 */
function shouldProcessServer(guildId: string, config: any) {
  const { serverMode, serverIds } = config;

  if (serverMode === "all") {
    return true;
  }

  const isInList = serverIds.includes(guildId);

  if (serverMode === "include") {
    return isInList;
  }

  if (serverMode === "exclude") {
    return !isInList;
  }

  return true;
}

/**
 * Find all channels matching the pattern across all guilds
 * @param {Client} client - Discord.js client
 * @param {Object} config - Configuration object
 * @returns {Promise<Array>} Array of channel objects
 */
async function findPatternMatchedChannels(client: any, config: any) {
  const matchedChannels: any[] = [];

  if (!config.channelPattern || !config.channelPatternEnabled) {
    return matchedChannels;
  }

  for (const [, guild] of client.guilds.cache) {
    // Check server filter
    if (!shouldProcessServer(guild.id, config)) {
      continue;
    }

    for (const [, channel] of guild.channels.cache) {
      // Only text channels
      if (channel.type !== 0) continue; // 0 = GUILD_TEXT

      if (matchesChannelPattern(channel.name, config.channelPattern)) {
        matchedChannels.push(channel);
        logger.debug(`[socialMediaMonitor] Pattern matched channel: ${channel.name} in ${guild.name}`);
      }
    }
  }

  return matchedChannels;
}

/**
 * Check if URL has already been shared
 * @param {Db} db - MongoDB database instance
 * @param {string} url - URL to check
 * @param {string} guildId - Guild ID
 * @returns {Promise<boolean>} True if already shared
 */
async function isAlreadyShared(db: any, url: string, guildId: string) {
  const collection = db.collection(COLLECTION_NAME);
  const existing = await collection.findOne({ url, guildId });
  return !!existing;
}

/**
 * Record a share to prevent duplicates
 * @param {Db} db - MongoDB database instance
 * @param {Object} shareData - Share data to record
 */
async function recordShare(db: any, shareData: any) {
  const collection = db.collection(COLLECTION_NAME);
  await collection.updateOne(
    { url: shareData.url, guildId: shareData.guildId },
    {
      $set: {
        ...shareData,
        sharedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Check if content is relevant to Elio using AI
 * @param {Object} item - Search result item
 * @returns {Promise<boolean>} True if relevant
 */
async function checkRelevance(item: any) {
  try {
    const prompt = PROMPTS.RELEVANCE_CHECK
      .replace("{title}", item.title || "")
      .replace("{snippet}", item.snippet || "")
      .replace("{url}", item.url || "");

    const result = await llmGenerate({
      prompt,
      system: "You are a content classifier. Respond with only 'RELEVANT' or 'NOT_RELEVANT'.",
      maxTokens: 10,
      temperature: 0.1,
    });

    if (!result.ok) return true; // Default to relevant if check fails
    const verdict = String(result.data.text).trim().toUpperCase();
    if (verdict.includes("NOT_RELEVANT")) return false;
    if (verdict.includes("RELEVANT")) return true;
    return true;
  } catch (error) {
    logger.warn("[socialMediaMonitor] Relevance check failed, defaulting to relevant", {
      error: getErrorMessage(error),
    });
    return true;
  }
}

/**
 * Generate a character reaction to news
 * @param {Object} persona - Persona object
 * @param {Object} item - News item
 * @returns {Promise<string|null>} Character reaction or null
 */
async function generateCharacterReaction(persona: any, item: any) {
  try {
    const prompt = PROMPTS.CHARACTER_REACTION
      .replace(/{personaName}/g, persona.name)
      .replace("{personaDescription}", persona.prompt || persona.description || "A friendly character")
      .replace("{title}", item.title || "")
      .replace("{snippet}", item.snippet || "")
      .replace("{source}", item.source || "");

    const result = await llmGenerate({
      prompt,
      system: `You are ${persona.name}. Stay completely in character. Write a brief, natural Discord message.`,
      maxTokens: 100,
      temperature: 0.8,
    });

    if (!result.ok) {
      logger.warn("[socialMediaMonitor] Character reaction generation failed", { error: result.error });
      return null;
    }

    return result.data.text.trim();
  } catch (error) {
    logger.error("[socialMediaMonitor] Error generating character reaction", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    return null;
  }
}

/**
 * Search all configured sources for Elio content
 * @param {Object} config - Configuration object
 * @returns {Promise<Array>} Array of search results
 */
async function searchAllSources(config: any) {
  const results: any[] = [];
  const sources = config.sources;

  // Randomly select search queries to vary results - use all categories for diversity
  const randomKeywords = [
    // Always include 2 random primary keywords (highest priority)
    pickRandom(SEARCH_KEYWORDS.primary),
    pickRandom(SEARCH_KEYWORDS.primary),
    // Include one from each secondary category
    pickRandom(SEARCH_KEYWORDS.characters),
    pickRandom(SEARCH_KEYWORDS.topics),
    pickRandom(SEARCH_KEYWORDS.timely),
    pickRandom(SEARCH_KEYWORDS.production),
  ].filter((q): q is string => typeof q === "string" && q.length > 0);

  for (const query of randomKeywords.slice(0, 4)) {
    try {
      // Search YouTube (priority for video content)
      if (sources.youtube) {
        const ytResult = await searchYouTube(query, 3);
        if (ytResult.ok && ytResult.data?.results) {
          for (const item of ytResult.data.results) {
            results.push({
              ...item,
              source: "youtube",
              sourceEmoji: "🎬",
              isVideo: true,
            });
          }
        }
      }

      // Search Reddit
      if (sources.reddit) {
        const redditResult = await searchReddit(query, SEARCH_KEYWORDS.subreddits, 3);
        if (redditResult.ok && redditResult.data?.results) {
          for (const item of redditResult.data.results) {
            results.push({
              ...item,
              source: "reddit",
              sourceEmoji: "📱",
            });
          }
        }
      }

      // Search News
      if (sources.news) {
        const newsResult = await searchNews(query, 3);
        if (newsResult.ok && newsResult.data?.results) {
          for (const item of newsResult.data.results) {
            results.push({
              ...item,
              source: "news",
              sourceEmoji: "📰",
            });
          }
        }
      }

      // Search Twitter/X
      if (sources.twitter) {
        const twitterResult = await searchTwitter(query, 2);
        if (twitterResult.ok && twitterResult.data?.results) {
          for (const item of twitterResult.data.results) {
            results.push({
              ...item,
              source: "twitter",
              sourceEmoji: "🐦",
            });
          }
        }
      }
    } catch (error) {
      logger.warn(`[socialMediaMonitor] Search failed for query: ${query}`, {
        error: getErrorMessage(error),
      });
    }
  }

  // Remove duplicates by URL
  const seen = new Set<string>();
  return results.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

/**
 * Select a random persona for sharing
 * @returns {Promise<Object|null>} Random persona or null
 */
async function selectRandomPersona() {
  try {
    const result = await personas.listPersonas();
    if (!result.ok) {
      logger.warn("[socialMediaMonitor] No personas available", { error: result.error });
      return null;
    }
    if (!result.data || result.data.length === 0) {
      logger.warn("[socialMediaMonitor] No personas available", { dataLength: 0 });
      return null;
    }

    const allPersonas = result.data;

    // Prefer main characters: Elio, Olga, Questa, Glordon
    const mainCharacters = allPersonas.filter((p) =>
      ["elio", "olga", "questa", "glordon"].includes(p.name.toLowerCase())
    );

    const pool = mainCharacters.length > 0 ? mainCharacters : allPersonas;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    logger.debug("[socialMediaMonitor] Selected persona", { name: selected?.name });
    return selected || null;
  } catch (error) {
    logger.error("[socialMediaMonitor] Error selecting persona", { error: getErrorMessage(error) });
    return null;
  }
}

// ============================================================================
// Main Job Function
// ============================================================================

/**
 * Run the social media monitor job
 * @param {Client} client - Discord.js client
 */
export async function run(client: any) {
  try {
    logger.info("[JOB:SocialMediaMonitor] Starting social media scan...");
    const db = getDb();

    // Get configuration
    const config = await getConfig(db);
    if (!config.enabled) {
      logger.info("[JOB:SocialMediaMonitor] Job is disabled in config");
      return;
    }

    // Build combined channel list: explicit channels + pattern-matched channels
    const channelsToProcess = new Map(); // Use Map to dedupe by channel ID

    // Add explicitly configured channels
    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.guild) {
          // Check server filter for explicit channels too
          if (shouldProcessServer(channel.guild.id, config)) {
            channelsToProcess.set(channel.id, channel);
          }
        }
      } catch (err) {
        logger.warn(
          `[socialMediaMonitor] Could not fetch channel ${channelId}: ${getErrorMessage(err)}`
        );
      }
    }

    // Add pattern-matched channels
    const patternMatched = await findPatternMatchedChannels(client, config);
    for (const channel of patternMatched) {
      channelsToProcess.set(channel.id, channel);
    }

    if (channelsToProcess.size === 0) {
      logger.info("[JOB:SocialMediaMonitor] No channels configured (explicit or pattern-matched)");
      return;
    }

    logger.info(`[JOB:SocialMediaMonitor] Processing ${channelsToProcess.size} channels (${config.channelIds.length} explicit, ${patternMatched.length} pattern-matched)`);

    // Search all sources
    const allResults = await searchAllSources(config);
    logger.info(`[JOB:SocialMediaMonitor] Found ${allResults.length} total results`);

    if (allResults.length === 0) {
      logger.info("[JOB:SocialMediaMonitor] No search results found");
      return;
    }

    // Process each channel
    for (const [, channel] of channelsToProcess) {
      try {
        if (!channel || !channel.guild) continue;

        const guildId = channel.guild.id;
        let sharesThisRun = 0;

        // Filter and process results
        for (const item of allResults) {
          if (sharesThisRun >= config.maxSharesPerRun) break;

          // Check if already shared
          if (await isAlreadyShared(db, item.url, guildId)) {
            continue;
          }

          // Check relevance (skip for YouTube as it's usually more targeted)
          if (!item.isVideo) {
            const isRelevant = await checkRelevance(item);
            if (!isRelevant) {
              logger.debug(`[socialMediaMonitor] Skipping irrelevant: ${item.title}`);
              continue;
            }
          }

          // Select random persona (fallback to bot if unavailable)
          const persona = await selectRandomPersona();
          const usePersona = !!persona;

          // Generate character reaction or use simple description
          let reaction;
          if (usePersona) {
            reaction = await generateCharacterReaction(persona, item);
          }
          // Fallback: use snippet or simple announcement
          if (!reaction) {
            reaction = item.snippet
              ? item.snippet.substring(0, 280)
              : `Check out this ${item.source} content about Elio!`;
            logger.debug(`[socialMediaMonitor] Using fallback reaction for: ${item.title}`);
          }

          // Build embed
          const embed: any = {
            title: `${item.sourceEmoji} ${item.title}`,
            description: reaction,
            url: item.url,
            color: usePersona ? (persona.color || 0x7289da) : 0x5865F2,
            fields: [] as any[],
            footer: {
              text: usePersona
                ? `Source: ${item.source} | Shared by ${persona.name}`
                : `Source: ${item.source} | Elioverse Bot`,
            },
            timestamp: new Date().toISOString(),
          };

          // Add snippet as field if available (only when not already used as reaction)
          if (item.snippet && usePersona) {
            embed.fields.push({
              name: "Summary",
              value: item.snippet.substring(0, 200) + (item.snippet.length > 200 ? "..." : ""),
              inline: false,
            });
          }

          // Post via webhook with persona avatar OR regular channel send
          try {
            if (usePersona) {
              await webhooks.personaSay(channel.id, persona, {
                embeds: [embed],
              });
            } else {
              // Fallback: send as regular bot message
              await channel.send({ embeds: [embed] });
              logger.info(`[socialMediaMonitor] Posted as bot (no persona): ${item.title}`);
            }

            // Record the share
            await recordShare(db, {
              url: item.url,
              guildId,
              title: item.title,
              source: item.source,
              personaName: usePersona ? persona.name : "Bot",
            });

            sharesThisRun++;
            incCounter("social_media_shares_total", { source: item.source });
            logger.info(`[socialMediaMonitor] Shared: ${item.title} as ${usePersona ? persona.name : "Bot"}`);

            // Small delay between posts
            await new Promise((r) => setTimeout(r, 2000));
          } catch (postError) {
            logger.error("[socialMediaMonitor] Failed to post", { error: getErrorMessage(postError) });
          }
        }

        logger.info(`[socialMediaMonitor] Shared ${sharesThisRun} items in ${channel.name}`);
      } catch (channelError) {
        logger.error(`[socialMediaMonitor] Error processing channel ${channel?.id || "unknown"}`, {
          error: getErrorMessage(channelError),
        });
      }
    }

    logger.info("[JOB:SocialMediaMonitor] Scan complete");
  } catch (error) {
    logger.error("[JOB:SocialMediaMonitor] Error", {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    incCounter("social_media_monitor_errors_total");
  }
}

export default { run };
