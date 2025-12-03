/**
 * services/messageRouter.js
 * Handle public message routing and passive persona responses with full AI integration
 * Now with intelligent multi-persona switching using AI Agent + RAG + Keywords
 */

import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";
import { listPersonas, getPersona } from "./persona.js";
import { sendAsPersona } from "./webhooks.js";
import { incCounter } from "../util/metrics.js";
import * as conversationHistory from "./conversationHistory.js";
import * as personaSwitcher from "./personaSwitcher.js";
import { AI_ENABLED } from "../config.js";
import { interactionLogger } from "./interactionLogger.js";

// Cooldown tracking (in-memory) - PER USER, not per channel!
const cooldowns = new Map();
const MENTION_COOLDOWN_MS = 5000; // 5 seconds for mentions (reduced)
const KEYWORD_COOLDOWN_MS = 20000; // 20 seconds for keyword triggers (reduced)
const RANDOM_COOLDOWN_MS = 120000; // 2 minutes for random replies
const CONVERSATION_COOLDOWN_MS = 10000; // 10 seconds in conversation mode

// Active conversation tracking - stores persona continuation state
const activeConversations = new Map();

// Comprehensive keyword triggers based on RAG resources
// NOTE: These are now used by personaSwitcher.js for fast detection
const PERSONA_KEYWORDS = {
  // Elio Solis - Main protagonist, Earth Ambassador
  Elio: [
    "elio", "solis", "ambassador", "earth ambassador", "space", "earth",
    "music", "cosmic", "alien", "communiverse", "council", "wormhole",
    "mission", "diplomat", "galaxy", "11-year-old", "lonely", "exploring",
    "stories", "friends", "adventure", "wonder", "curious", "enthusiastic",
    "tell me more", "fascinating", "amazing", "you humans"
  ],

  // Glordon - Potato-shaped alien, son of Lord Grigon, Elio's friend
  Glordon: [
    "glordon", "potato", "potato-shaped", "enthusiasm", "resource", "included",
    "couch potato", "metaphor", "joke", "humor", "mishear", "hylurg",
    "grigon's son", "friend", "playful", "banter", "literal",
    "being shushed", "learning", "train like a potato"
  ],

  // Caleb - Chauffeur, cautious driver, disciplined
  Caleb: [
    "caleb", "plan", "efficient", "protocol", "discipline", "result",
    "focus", "quiet", "practical", "direct", "goal", "chauffeur",
    "driver", "safety", "risky", "veto", "cautious", "wasting time",
    "clear plans", "do it right", "black hole", "not safe", "survivability"
  ],

  // Olga Solis - Elio's aunt, Major, deuteragonist
  Olga: [
    "olga", "olga solis", "major", "aunt", "elio's aunt", "military",
    "protective", "down to earth", "reality", "life down here",
    "leader", "strong", "adventure", "problem solving"
  ],

  // Lord Grigon - Main antagonist, ruler of Hylurg
  Grigon: [
    "grigon", "lord grigon", "hylurg", "villain", "antagonist", "ruler",
    "war", "conquest", "power", "enemy", "threat", "ambassador",
    "chief ambassador", "battle", "ruthless", "skulls", "trophies"
  ],

  // Bryce - Supporting character
  Bryce: [
    "bryce", "friend", "classmate", "human"
  ],

  // Gunther Melmac - Elio's father
  Gunther: [
    "gunther", "melmac", "father", "elio's father", "parent"
  ],

  // Ambassador Questa - Leader of planet Gom, empathetic mind-reader
  Questa: [
    "questa", "ambassador questa", "gom", "planet gom", "mind reader",
    "empathy", "mind reading", "leafy sea dragon", "personal space",
    "intense eye contact", "sensing", "intuitive"
  ],

  // Ambassador Auva - Creator of Universal Users' Manual, peace-loving
  Auva: [
    "auva", "ambassador auva", "universal users manual", "positive vibes",
    "peace", "bubbly", "optimistic", "ink splat", "manual"
  ],

  // Ambassador Mira - Cunning empress, strategic
  Mira: [
    "mira", "ambassador mira", "empress", "cunning", "strategic",
    "diplomatic", "cloud", "mist", "vapor"
  ],

  // Ooooo - Liquid supercomputer
  Ooooo: [
    "ooooo", "oooh", "supercomputer", "liquid computer", "information",
    "database", "help system", "guide", "infinite knowledge"
  ],
};

// General Communiverse/Elio film lore keywords (no specific persona)
const LORE_KEYWORDS = [
  // Core film/universe
  "communiverse", "elio film", "pixar", "disney", "2025", "animated",

  // Space/locations
  "wormhole", "wormholes", "black hole", "asteroid", "galaxy",
  "planet", "planets", "intergalactic", "outer space", "stars",

  // Organizations/concepts
  "council", "embassy", "ambassador program", "evacuation",
  "alien species", "aliens", "space travel", "navigation",

  // Film-specific locations
  "hylurg", "earth",

  // Other ambassadors
  "auva", "helix", "mira", "naos", "questa", "tegmen", "turais",
  "ooooo",

  // RP/server-specific
  "chauffeur protocol", "scenic route", "star rating",
  "space driving", "adventure", "found family",

  // Themes
  "friendship", "acceptance", "loneliness", "connection",
  "misunderstood", "fitting in", "belonging"
];

/**
 * Handle public messages for passive persona interactions
 * @param {Message} message - Discord message object
 * @param {Object} services - Bot services (personas, ai, etc.)
 */
export async function handlePublicMessage(message, services) {
  try {
    logger.debug("[AUTO-REPLY] Message received", {
      guildId: message.guildId,
      channelId: message.channelId,
      authorBot: message.author.bot,
      content: message.content.substring(0, 50),
    });

    // Skip bot messages
    if (message.author.bot) return;

    // Skip commands
    if (message.content.startsWith("/")) return;

    // Get guild config
    const configCol = getCollection("guild_config");
    const configDoc = await configCol.findOne({ guildId: message.guildId });

    const config = {
      autoPersonaChat: configDoc?.proactive?.autoPersonaChat ?? true,
      autoReplyChannels: configDoc?.autoReplyChannels || [],
      useRAG: configDoc?.features?.useRAG ?? true,
      useVLM: configDoc?.features?.useVLM ?? true,
      useAgent: configDoc?.features?.useAgent ?? false,
    };

    logger.debug("[AUTO-REPLY] Config loaded", {
      autoPersonaChat: config.autoPersonaChat,
      autoReplyChannels: config.autoReplyChannels,
      useRAG: config.useRAG,
      useVLM: config.useVLM,
    });

    // Check if auto-reply is enabled for this channel
    if (
      config.autoReplyChannels.length > 0 &&
      !config.autoReplyChannels.includes(message.channelId)
    ) {
      logger.debug("[AUTO-REPLY] Channel not whitelisted", {
        channelId: message.channelId,
        whitelisted: config.autoReplyChannels,
      });
      return; // Only reply in whitelisted channels
    }

    // Check if should reply
    const decision = await shouldAutoReply(message, config, services);

    logger.debug("[AUTO-REPLY] Decision result", {
      shouldReply: decision.shouldReply,
      reason: decision.reason,
      persona: decision.persona,
    });

    if (!decision.shouldReply) {
      return;
    }

    logger.info("[AUTO-REPLY] Triggering reply", {
      guildId: message.guildId,
      channelId: message.channelId,
      reason: decision.reason,
      persona: decision.persona,
    });

    // Generate reply with full AI integration
    const reply = await generateSmartReply(message, decision, services, config);

    if (!reply) {
      return;
    }

    // Send reply based on mode
    if (decision.originalMode) {
      // Original assistant mode - reply directly (no webhook, no persona)
      await message.reply(reply.text);

      logger.info("[AUTO-REPLY] Original assistant reply sent", {
        guildId: message.guildId,
        channelId: message.channelId,
        usedRAG: reply.usedRAG,
        usedVLM: reply.usedVLM,
      });
    } else {
      // Persona mode - send as persona via webhook
      await sendAsPersona(message.channelId, reply.persona, {
        content: reply.text,
      });

      logger.info("[AUTO-REPLY] Persona reply sent", {
        guildId: message.guildId,
        channelId: message.channelId,
        personaName: reply.persona.name,
        usedRAG: reply.usedRAG,
        usedVLM: reply.usedVLM,
      });
    }

    incCounter("auto_replies_total", { reason: decision.reason });

    // Log interaction for continuous learning (concept drift mitigation)
    const personaName = reply.persona?.name || 'assistant';
    interactionLogger.log({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      username: message.author.username,
      persona: personaName,
      userMessage: message.content,
      botResponse: reply.text,
      responseSource: reply.usedRAG ? 'rag' : (reply.strategy || 'personaLogic'),
      similarity: reply.similarity || null,
    });
  } catch (error) {
    logger.error("[MSG_ROUTER] Error handling message:", {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Detect if user explicitly mentioned a persona (e.g., "Hey Elio", "Glordon tell me...")
 * Returns persona name if found, null otherwise
 */
async function detectExplicitPersonaMention(messageContent) {
  const content = messageContent.toLowerCase();

  // Get all available personas
  const personasResult = await listPersonas();
  if (!personasResult.ok || personasResult.data.length === 0) {
    return null;
  }

  // Check for direct persona name mentions at start of message or after punctuation
  // Patterns: "Hey {Persona}", "{Persona},", "{Persona}!", etc.
  for (const persona of personasResult.data) {
    const personaName = persona.name.toLowerCase();

    // Pattern 1: Name at start of message
    const startPatterns = [
      new RegExp(`^${personaName}[,!?:\\s]`, 'i'),
      new RegExp(`^hey ${personaName}`, 'i'),
      new RegExp(`^hi ${personaName}`, 'i'),
      new RegExp(`^hello ${personaName}`, 'i'),
      new RegExp(`^yo ${personaName}`, 'i'),
    ];

    for (const pattern of startPatterns) {
      if (pattern.test(content)) {
        logger.debug("[AUTO-REPLY] Explicit mention detected (start pattern)", {
          persona: persona.name,
          pattern: pattern.source
        });
        return persona.name;
      }
    }

    // Pattern 2: "{Persona} tell me", "{Persona} what", etc.
    const commandPatterns = [
      new RegExp(`${personaName}\\s+(tell|what|how|why|where|when|can|could|would|should)`, 'i'),
    ];

    for (const pattern of commandPatterns) {
      if (pattern.test(content)) {
        logger.debug("[AUTO-REPLY] Explicit mention detected (command pattern)", {
          persona: persona.name,
          pattern: pattern.source
        });
        return persona.name;
      }
    }
  }

  return null;
}

/**
 * Check if message should trigger auto-reply
 */
async function shouldAutoReply(message, config, services) {
  const content = message.content.toLowerCase();
  const userId = message.author.id;
  const channelId = message.channelId;

  // Get currently active persona for this user (if any)
  const currentPersona = personaSwitcher.getActivePersona(userId, channelId);

  // PRIORITY 1: Check for @bot mention (original assistant mode)
  // When user @mentions the bot itself, respond in original assistant form
  if (message.mentions.has(message.client.user)) {
    const cooldownKey = `mention:${userId}`;
    if (isOnCooldown(cooldownKey, MENTION_COOLDOWN_MS)) {
      return { shouldReply: false };
    }
    setCooldown(cooldownKey);

    logger.info("[AUTO-REPLY] @bot mention detected - using original assistant mode", {
      userId,
      message: message.content.substring(0, 50)
    });

    return {
      shouldReply: true,
      persona: null, // null = original assistant mode
      reason: "bot_mention",
      originalMode: true
    };
  }

  // PRIORITY 1.5: Check if replying to bot's message
  // When user replies to any bot message, continue the conversation
  if (message.reference) {
    try {
      const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (repliedMessage && repliedMessage.author.id === message.client.user.id) {
        // Check if the replied message was from a webhook (persona) or direct bot message
        const isWebhookMessage = repliedMessage.webhookId !== null;

        // If replying to persona message, continue with that persona
        if (isWebhookMessage && currentPersona) {
          const cooldownKey = `reply:${userId}:${currentPersona}`;
          if (isOnCooldown(cooldownKey, MENTION_COOLDOWN_MS)) {
            return { shouldReply: false };
          }
          setCooldown(cooldownKey);

          logger.info("[AUTO-REPLY] Reply to persona detected - continuing conversation", {
            userId,
            persona: currentPersona,
            message: message.content.substring(0, 50)
          });

          return {
            shouldReply: true,
            persona: currentPersona,
            reason: "reply_to_persona",
            confidence: 1.0,
            switched: false
          };
        } else {
          // Replying to direct bot message - use original assistant mode
          const cooldownKey = `reply:${userId}:bot`;
          if (isOnCooldown(cooldownKey, MENTION_COOLDOWN_MS)) {
            return { shouldReply: false };
          }
          setCooldown(cooldownKey);

          logger.info("[AUTO-REPLY] Reply to bot detected - using original assistant mode", {
            userId,
            message: message.content.substring(0, 50)
          });

          return {
            shouldReply: true,
            persona: null,
            reason: "reply_to_bot",
            originalMode: true
          };
        }
      }
    } catch (error) {
      logger.debug("[AUTO-REPLY] Failed to fetch replied message", { error: error.message });
      // Continue to other detection methods if fetch fails
    }
  }

  // PRIORITY 2: Check for EXPLICIT persona tag/mention
  // If user explicitly mentions a persona name, THAT persona MUST respond
  const explicitPersona = await detectExplicitPersonaMention(message.content);
  if (explicitPersona) {
    const cooldownKey = `explicit:${userId}:${explicitPersona}`;
    if (isOnCooldown(cooldownKey, MENTION_COOLDOWN_MS)) {
      logger.debug("[AUTO-REPLY] Explicit mention on cooldown", { persona: explicitPersona, userId });
      return { shouldReply: false };
    }
    setCooldown(cooldownKey);

    logger.info("[AUTO-REPLY] Explicit persona mention detected", {
      userId,
      persona: explicitPersona,
      message: message.content.substring(0, 50)
    });

    return {
      shouldReply: true,
      persona: explicitPersona,
      reason: "explicit_mention",
      confidence: 1.0,
      switched: explicitPersona !== currentPersona
    };
  }

  // PRIORITY 3: INTELLIGENT PERSONA DETECTION
  // Use AI Agent + RAG + Keywords to detect which persona to use
  const detection = await personaSwitcher.detectPersona(
    message.content,
    currentPersona,
    services,
    message.guildId
  );

  logger.info("[AUTO-REPLY] Persona detection result", {
    userId,
    currentPersona,
    detected: detection.persona,
    confidence: detection.confidence,
    reason: detection.reason,
    shouldSwitch: detection.shouldSwitch,
    message: message.content.substring(0, 50)
  });

  // Check if we should reply based on detection confidence
  // STRATEGY: First reply needs clear intent, multi-turn conversations can be lenient
  // - explicit triggers (@, keywords, explicit mention): handled above, always reply
  // - conversation continuation: 0.5 (LOW - allow context-based continuation)
  // - keyword match: 0.75 (MEDIUM-HIGH - name mention or multiple keywords)
  // - RAG detection: 0.90 (HIGH - semantically very relevant content)
  // - AI Agent: 0.90 (HIGH - AI's chain-of-thought confident match)

  let confidenceThreshold;
  if (detection.reason === "conversation_continuation") {
    // LOW threshold for multi-turn conversations - context is enough
    confidenceThreshold = 0.5;
  } else if (detection.reason === "keyword_match") {
    // MEDIUM-HIGH threshold for keyword-based first reply
    // With improved keyword detection, 0.75 means: name mention OR 2-3 strong keywords
    confidenceThreshold = 0.75;
  } else if (detection.reason === "rag_semantic") {
    // HIGH threshold for RAG first reply - semantically relevant
    confidenceThreshold = 0.90;
  } else if (detection.reason === "ai_agent") {
    // HIGH threshold for AI Agent first reply - confident reasoning
    confidenceThreshold = 0.90;
  } else {
    // Default high threshold for other cases
    confidenceThreshold = 0.90;
  }

  if (detection.persona && detection.confidence >= confidenceThreshold) {
    // Determine appropriate cooldown based on trigger type
    let cooldownKey;
    let cooldownTime;

    if (detection.reason === "keyword_match") {
      cooldownKey = `keyword:${userId}:${detection.persona}`;
      cooldownTime = KEYWORD_COOLDOWN_MS;
    } else if (detection.reason === "conversation_continuation") {
      cooldownKey = `conversation:${userId}:${detection.persona}`;
      cooldownTime = CONVERSATION_COOLDOWN_MS;
    } else if (detection.reason === "rag_semantic" || detection.reason === "ai_agent") {
      cooldownKey = `smart:${userId}:${detection.persona}`;
      cooldownTime = KEYWORD_COOLDOWN_MS;
    } else {
      cooldownKey = `auto:${userId}:${detection.persona}`;
      cooldownTime = KEYWORD_COOLDOWN_MS;
    }

    // Check cooldown
    if (isOnCooldown(cooldownKey, cooldownTime)) {
      logger.debug("[AUTO-REPLY] On cooldown", { cooldownKey, userId });
      return { shouldReply: false };
    }

    setCooldown(cooldownKey);

    return {
      shouldReply: true,
      persona: detection.persona,
      reason: detection.reason,
      confidence: detection.confidence,
      switched: detection.shouldSwitch
    };
  }

  // FALLBACK 2: Check for images (VLM) - DISABLED to reduce spam
  // Only respond to images if explicitly mentioned or replied to
  // if (config.useVLM && message.attachments.size > 0) {
  //   const hasImage = Array.from(message.attachments.values()).some((a) =>
  //     a.contentType?.startsWith("image/")
  //   );
  //   if (hasImage) {
  //     const cooldownKey = `vlm:${userId}`;
  //     if (isOnCooldown(cooldownKey, KEYWORD_COOLDOWN_MS)) {
  //       return { shouldReply: false };
  //     }
  //     setCooldown(cooldownKey);
  //     return { shouldReply: true, reason: "image", hasImage: true };
  //   }
  // }

  // FALLBACK 3: Random chance reply - DISABLED to reduce spam
  // if (config.autoPersonaChat && Math.random() < 0.01) {
  //   const cooldownKey = `random:${userId}`;
  //   if (isOnCooldown(cooldownKey, RANDOM_COOLDOWN_MS)) {
  //     return { shouldReply: false };
  //   }
  //   setCooldown(cooldownKey);
  //
  //   const randomPersona = await pickRandomPersona();
  //   return {
  //     shouldReply: true,
  //     persona: randomPersona,
  //     reason: "random"
  //   };
  // }

  return { shouldReply: false };
}

/**
 * Pick a random active persona
 */
async function pickRandomPersona() {
  try {
    const result = await listPersonas();
    if (result.ok && result.data.length > 0) {
      const randomIndex = Math.floor(Math.random() * result.data.length);
      return result.data[randomIndex].name;
    }
  } catch (error) {
    logger.error("[AUTO-REPLY] Failed to pick random persona", { error: error.message });
  }
  return "Elio"; // Fallback to Elio
}

/**
 * Generate original assistant reply (when @bot is mentioned)
 * Bot responds as a helpful assistant, not as a character persona
 */
async function generateOriginalAssistantReply(message, services, config) {
  try {
    const { ai } = services;

    let context = "";
    let usedRAG = false;
    let usedVLM = false;

    // Get RAG context if available
    if (config.useRAG && ai.rag && message.content.length > 20) {
      try {
        const ragResult = await ai.rag.search({
          query: message.content,
          guildId: message.guildId,
          topK: 3,
          generateAnswer: false,
        });

        if (ragResult.ok && ragResult.data.hits?.length > 0) {
          context = ragResult.data.hits
            .slice(0, 3)
            .map((hit) => hit.chunk.substring(0, 200))
            .join("\n");
          usedRAG = true;
        }
      } catch (error) {
        logger.debug("[AUTO-REPLY] RAG search failed (non-critical)", { error: error.message });
      }
    }

    // Process image if present
    if (config.useVLM && message.attachments.size > 0 && ai.vlm) {
      try {
        const attachment = Array.from(message.attachments.values()).find((a) =>
          a.contentType?.startsWith("image/")
        );
        if (attachment) {
          const vlmResult = await ai.vlm.describe({
            imageUrl: attachment.url,
            question: "Describe this image in detail.",
            maxTokens: 150,
          });

          if (vlmResult.ok && vlmResult.data.description) {
            context += `\n\n**Image Description:** ${vlmResult.data.description}`;
            usedVLM = true;
          }
        }
      } catch (error) {
        logger.warn("[AUTO-REPLY] VLM failed", { error: error.message });
      }
    }

    // Build assistant prompt
    let prompt = `You are Elio Bot, a helpful AI assistant for a Discord server about the Communiverse and Elio film. You can help users with:
- Information about characters (Elio, Glordon, Olga, and others)
- Lore and world-building questions
- Server features and commands
- General assistance

User's message: ${message.content}`;

    if (context) {
      prompt = `You are Elio Bot, a helpful AI assistant. Here's some relevant context from the knowledge base:

${context}

User's message: ${message.content}

Provide a helpful, friendly response (1-3 sentences).`;
    }

    // Generate response
    const result = await ai.llm.generate({
      prompt: prompt,
      maxTokens: 150,
      temperature: 0.7,
    });

    if (!result.ok || !result.data?.text) {
      logger.error("[AUTO-REPLY] Original assistant generation failed", { error: result?.error });
      return null;
    }

    const responseText = result.data.text.trim();

    logger.info("[AUTO-REPLY] Original assistant response generated", {
      userId: message.author.id,
      length: responseText.length,
      usedRAG,
      usedVLM,
    });

    return {
      text: responseText,
      persona: null, // No persona in original mode
      usedRAG,
      usedVLM,
      usedHistory: false
    };
  } catch (error) {
    logger.error("[AUTO-REPLY] Original assistant generation error", {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Generate smart reply using all AI modules (LLM, RAG, VLM, Agent)
 */
async function generateSmartReply(message, decision, services, config) {
  try {
    const { ai } = services;
    const logicOnly = !AI_ENABLED;

    if (!ai && !logicOnly) {
      logger.warn("[AUTO-REPLY] AI service not available");
      return null;
    }

    // ORIGINAL ASSISTANT MODE (when @bot is mentioned)
    if (decision.originalMode && !decision.persona) {
      return await generateOriginalAssistantReply(message, services, config);
    }

    // PERSONA MODE - Select persona
    let selectedPersona;
    if (decision.persona) {
      const result = await getPersona(decision.persona);
      if (result.ok) selectedPersona = result.data;
    }

    if (!selectedPersona) {
      const personas = await listPersonas();
      if (personas.ok && personas.data.length > 0) {
        selectedPersona =
          personas.data[Math.floor(Math.random() * personas.data.length)];
      }
    }

    if (!selectedPersona) {
      logger.warn("[AUTO-REPLY] No personas available");
      return null;
    }

    let context = "";
    let usedRAG = false;
    let usedVLM = false;
    let usedHistory = false;

    // OPTIMIZATION: Only use conversation history OR RAG, not both (reduces latency)
    // Priority: conversation history > RAG (history is faster and more relevant)

    // 1. Get conversation history for this persona in this channel (fast, in-memory)
    const conversationContext = conversationHistory.getContextString(
      message.channelId,
      message.author.id,
      selectedPersona.name,
      2 // Reduced from 3 to 2 exchanges for faster processing
    );
    const structuredHistory = conversationHistory.getContext(
      message.channelId,
      message.author.id,
      selectedPersona.name,
      4
    );

    if (conversationContext) {
      context += "\n" + conversationContext;
      usedHistory = true;
      logger.debug("[AUTO-REPLY] Using conversation history (skipping RAG for speed)");
    }
    // 2. RAG - ONLY if no conversation history (to reduce latency)
    else if (!logicOnly && config.useRAG && ai?.rag && message.content.length > 30) {
      try {
        logger.debug("[AUTO-REPLY] Querying RAG (no history available)");

        const ragResult = await ai.rag.search({
          query: message.content,
          guildId: message.guildId,
          topK: 2, // Reduced from 5 to 2 for faster retrieval
          generateAnswer: false,
        });

        if (ragResult.ok && ragResult.data.hits?.length > 0) {
          // Use top 2 results only (was 3)
          context += "\n" + ragResult.data.hits
            .slice(0, 2)
            .map((hit) => hit.chunk.substring(0, 150)) // Reduced from 250 to 150 chars
            .join("\n");
          usedRAG = true;
          logger.debug("[AUTO-REPLY] Used RAG context", { hits: ragResult.data.hits.length });
        }
      } catch (error) {
        logger.debug("[AUTO-REPLY] RAG search failed (non-critical)", { error: error.message });
        // Continue without RAG context - don't slow down response
      }
    }

    // 3. VLM - Describe image if present
    let imageDescription = "";
    if (!logicOnly && decision.hasImage && config.useVLM && ai?.vlm) {
      try {
        const attachment = Array.from(message.attachments.values()).find((a) =>
          a.contentType?.startsWith("image/")
        );
        if (attachment) {
          logger.debug("[AUTO-REPLY] Processing image with VLM");

          const vlmResult = await ai.vlm.describe({
            imageUrl: attachment.url,
            question: "Describe this image in 1-2 sentences.",
            maxTokens: 100,
          });

          if (vlmResult.ok && vlmResult.data.description) {
            imageDescription = vlmResult.data.description;
            context += `\n\n**Image Context:** ${imageDescription}`;
            usedVLM = true;
            logger.info("[AUTO-REPLY] Used VLM for image");
          }
        }
      } catch (error) {
        logger.warn("[AUTO-REPLY] VLM failed", { error: error.message });
        // Continue without VLM context
      }
    }

    // If logic-only mode, return deterministic reply without AI calls
    // Prefer non-LLM persona logic service when available
    if (ai?.personaLogic) {
      try {
        const historyPayload = structuredHistory.map((h) => ({
          role: h.role,
          content: h.content,
        }));
        const logicRes = await ai.personaLogic.reply({
          persona: selectedPersona.name,
          message: message.content,
          history: historyPayload,
          topK: 5,
          maxLen: 90,
        });
        if (logicRes?.ok && logicRes.data?.text) {
          const responseText = logicRes.data.text.trim();
          conversationHistory.addMessage(
            message.channelId,
            message.author.id,
            selectedPersona.name,
            "user",
            message.content
          );
          conversationHistory.addMessage(
            message.channelId,
            message.author.id,
            selectedPersona.name,
            "assistant",
            responseText
          );
          personaSwitcher.setActivePersona(message.author.id, message.channelId, selectedPersona.name);

          return {
            text: responseText,
            persona: selectedPersona,
            usedRAG: false,
            usedVLM: false,
            usedHistory: structuredHistory.length > 0,
            strategy: logicRes.data.strategy || "logic",
          };
        }
      } catch (error) {
        logger.warn("[AUTO-REPLY] Persona logic service failed, falling back", { error: error.message });
      }
    }

    if (logicOnly) {
      const logicReply = buildLogicOnlyReply(message.content, selectedPersona);

      // Track simple history for continuity
      conversationHistory.addMessage(
        message.channelId,
        message.author.id,
        selectedPersona.name,
        "user",
        message.content
      );
      conversationHistory.addMessage(
        message.channelId,
        message.author.id,
        selectedPersona.name,
        "assistant",
        logicReply
      );

      return {
        text: logicReply,
        persona: selectedPersona,
        usedRAG: false,
        usedVLM: false,
        usedHistory: structuredHistory.length > 0,
      };
    }

    // 4. Generate persona response - OPTIMIZED FOR SPEED
    try {
      // OPTIMIZATION: Use short, direct prompts for faster generation
      let fullPrompt = selectedPersona.system_prompt || "";

      // Add context only if exists and not too long
      if (context && context.length < 500) {
        fullPrompt += `\n\n${context}\n\nNow respond naturally to: ${message.content}`;
      } else {
        fullPrompt += `\n\nRespond naturally to: ${message.content}`;
      }

      logger.debug("[AUTO-REPLY] Generating response", {
        persona: selectedPersona.name,
        hasRAG: usedRAG,
        hasVLM: usedVLM,
        promptLength: fullPrompt.length
      });

      // Use persona.compose with balanced token limit
      // 100 tokens = ~75 words = 2-3 sentences (matches personaLogic maxLen: 90)
      const aiResult = await ai.persona.compose(
        fullPrompt,
        selectedPersona,
        { maxTokens: 100 } // Keep consistent with personaLogic.reply maxLen: 90
      );

      if (!aiResult || !aiResult.ok) {
        logger.error("[AUTO-REPLY] Persona compose failed", { error: aiResult?.error });
        return null;
      }

      let responseText = aiResult.data?.text?.trim();

      if (!responseText || responseText === "") {
        logger.warn("[AUTO-REPLY] Empty response generated");
        return null;
      }

      // Post-process response to clean up quality issues
      responseText = cleanResponseText(responseText, selectedPersona.name);

      // Add to PER-PERSONA conversation history
      conversationHistory.addMessage(
        message.channelId,
        message.author.id,
        selectedPersona.name,
        "user",
        message.content
      );
      conversationHistory.addMessage(
        message.channelId,
        message.author.id,
        selectedPersona.name,
        "assistant",
        responseText
      );

      // Activate conversation mode for this user with this persona
      const userId = message.author.id;
      personaSwitcher.setActivePersona(userId, message.channelId, selectedPersona.name);

      logger.info("[AUTO-REPLY] Response generated successfully", {
        persona: selectedPersona.name,
        userId: userId,
        length: responseText.length,
        usedRAG,
        usedVLM,
        usedHistory,
        conversationModeActive: true,
        switched: decision.switched || false
      });

      return {
        text: responseText,
        persona: selectedPersona,
        usedRAG,
        usedVLM,
        usedHistory
      };
    } catch (error) {
      logger.error("[AUTO-REPLY] Generation error", {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  } catch (error) {
    logger.error("[AUTO-REPLY] Outer error", {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Clean response text to fix quality issues:
 * - Remove training data artifacts (user:, assistant:, persona names with colons)
 * - Trim to last complete sentence if too long
 * - Remove incomplete sentences at the end
 */
function cleanResponseText(text, personaName) {
  if (!text) return text;

  let cleaned = text;

  // Remove common training data patterns
  // Match patterns like "user:", "assistant:", "User:", "Assistant:", "[PersonaName]:", etc.
  const trainingPatterns = [
    /^(user|assistant|system):\s*/gi,
    /\n(user|assistant|system):\s*/gi,
    new RegExp(`^${personaName}:\\s*`, 'i'),
    new RegExp(`\\n${personaName}:\\s*`, 'i'),
    /^(User|Assistant|System):\s*/g,
    /\n(User|Assistant|System):\s*/g,
  ];

  for (const pattern of trainingPatterns) {
    cleaned = cleaned.replace(pattern, (match, p1) => {
      // Only replace if at start of line or after newline
      return match.startsWith('\n') ? '\n' : '';
    });
  }

  // Remove any "They asked:" or "You replied:" that might have leaked from context
  cleaned = cleaned.replace(/^(They asked|You replied|Recent conversation):\s*/gi, '');
  cleaned = cleaned.replace(/\n(They asked|You replied):\s*/gi, '\n');

  // Trim whitespace
  cleaned = cleaned.trim();

  // Check if response ends with incomplete sentence
  // Complete sentences end with: . ! ? ... " (if quoted)
  const endsWithPunctuation = /[.!?]["']?$/.test(cleaned);

  if (!endsWithPunctuation && cleaned.length > 50) {
    // Try to find the last complete sentence
    const lastSentenceEnd = Math.max(
      cleaned.lastIndexOf('. '),
      cleaned.lastIndexOf('! '),
      cleaned.lastIndexOf('? ')
    );

    if (lastSentenceEnd > 20) {
      // Found a sentence break - trim to there
      cleaned = cleaned.substring(0, lastSentenceEnd + 1).trim();
      logger.debug("[AUTO-REPLY] Trimmed incomplete sentence", {
        original: text.length,
        cleaned: cleaned.length
      });
    }
    // If no sentence break found and it's very short, keep it (might be an exclamation or short reply)
  }

  // Remove any trailing incomplete quotes
  if (cleaned.endsWith('"') && (cleaned.match(/"/g) || []).length % 2 === 1) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Final sanity check - if cleaned version is too short or empty, return original (minus training patterns)
  if (cleaned.length < 10 && text.length > 10) {
    // Just remove training patterns but keep the text
    cleaned = text.replace(/^(user|assistant|system):\s*/gi, '').trim();
  }

  return cleaned;
}

function buildLogicOnlyReply(userMessage, persona) {
  const personaName = persona?.name || "Bot";
  const trimmed = (userMessage || "").slice(0, 120);
  const hints = [
    "AI features are off; running logic-only mode.",
    "Mini-games and commands are available.",
    "Try /minigame start to play."
  ];
  const hint = hints[Math.floor(Math.random() * hints.length)];
  return `${personaName}: ${hint}${trimmed ? ` | You said: "${trimmed}"` : ""}`;
}

// Cooldown helpers
function isOnCooldown(key, duration) {
  const lastTime = cooldowns.get(key);
  if (!lastTime) return false;
  return Date.now() - lastTime < duration;
}

function setCooldown(key) {
  cooldowns.set(key, Date.now());
}

// Cleanup old cooldowns and conversations every 5 minutes
setInterval(() => {
  const now = Date.now();

  // Clean cooldowns
  for (const [key, time] of cooldowns.entries()) {
    if (now - time > 300000) {
      cooldowns.delete(key);
    }
  }

  // Clean expired conversations
  for (const [userId, convo] of activeConversations.entries()) {
    if (now >= convo.expiresAt) {
      activeConversations.delete(userId);
      logger.debug("[AUTO-REPLY] Expired conversation mode", { userId, persona: convo.personaName });
    }
  }
}, 300000);
