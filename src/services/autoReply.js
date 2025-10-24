/**
 * Auto-Reply System for Elioverse Bot
 *
 * Features:
 * - Keyword trigger detection (character names, movie keywords)
 * - Relevance detection using embeddings
 * - Tag detection (always reply when bot is mentioned)
 * - Multi-turn conversation tracking (lower threshold after first reply)
 * - Conversation history per persona
 * - Persona switching support
 */

import { config } from '../config.js';

/**
 * Movie and character-related keywords
 */
const MOVIE_KEYWORDS = [
  // Character names
  'elio', 'glordon', 'caleb', 'bryce', 'olga', 'grigon', 'questa', 'auva',
  'mira', 'ooooo', 'helix', 'tegmen', 'turais', 'naos', 'gunther', 'melmac',

  // Movie-specific terms
  'communiverse', 'earth ambassador', 'ham radio', 'masters of ham',
  'camp carver', 'montez middle school', 'hylurg', 'falluvinum', 'gom', 'tegmen',
  'wormhole', 'space debris', 'universal user\\\'s manual', 'drake equation',

  // Related concepts
  'alien', 'aliens', 'space', 'planet', 'galaxy', 'intergalactic',
  'ambassador', 'telepathic', 'warrior', 'potato', 'tardigrade'
];

/**
 * Auto-Reply Manager
 */
export class AutoReplyManager {
  constructor(services) {
    this.services = services;
    this.ai = services.ai;
    this.personas = services.personas;

    // Track active conversations: { channelId: { userId: { personaName, lastReply, messageCount } } }
    this.activeConversations = new Map();

    // STRICT MODE: Only reply when explicitly mentioned
    // No passive replies based on relevance
    // Must have @mention, reply, or persona/keyword mention
    this.STRICT_MODE = true;
  }

  /**
   * Check if message should trigger auto-reply
   * @param {Message} message - Discord message
   * @returns {Promise<{shouldReply: boolean, persona: string|null, reason: string}>}
   */
  async shouldReplyToMessage(message) {
    // Skip bot messages
    if (message.author.bot) {
      return { shouldReply: false, persona: null, reason: 'bot_message' };
    }

    const content = message.content.toLowerCase();
    const channelId = message.channelId;
    const userId = message.author.id;
    const botId = message.client.user.id;

    // 1. Tag Detection - ALWAYS reply if bot is mentioned (multiple checks for reliability)
    const isBotMentioned = message.mentions.has(botId) ||
                          message.mentions.users?.has(botId) ||
                          content.includes(`<@${botId}>`) ||
                          content.includes(`<@!${botId}>`);

    if (isBotMentioned) {
      // CRITICAL: When @mentioned, ALWAYS select based on content, ignore active conversation
      const persona = await this.selectPersonaForMessage(message, content, true);
      console.log(`[INT] Bot tagged/mentioned - ALWAYS replying as ${persona} (selected from content)`);
      return { shouldReply: true, persona, reason: 'bot_tagged', priority: 'high', relevance: 1.0 };
    }

    // 2. Reply Detection - ALWAYS reply if replying to bot's message (direct or webhook)
    if (message.reference) {
      try {
        const repliedTo = await message.channel.messages.fetch(message.reference.messageId);

        // Check if reply is to bot's direct message OR bot's webhook message (persona)
        const isDirectBotMessage = repliedTo && repliedTo.author.id === botId;
        const isBotWebhook = repliedTo && repliedTo.webhookId; // Assume all webhooks in this channel are bot's personas

        if (isDirectBotMessage || isBotWebhook) {
          // If webhook message, try to detect which persona it was
          let persona = null;
          if (isBotWebhook && repliedTo.author && repliedTo.author.username) {
            // Webhook username is the persona name
            persona = repliedTo.author.username;
            console.log(`[INT] Reply to persona webhook message - replying as same persona: ${persona}`);
          } else {
            // Direct bot message or couldn't detect persona - use keyword detection
            persona = await this.selectPersonaForMessage(message, content);
            console.log(`[INT] Reply to bot message - replying as ${persona}`);
          }

          return { shouldReply: true, persona, reason: 'reply_to_bot', priority: 'high', relevance: 1.0 };
        }
      } catch (error) {
        console.error('[ERR] Failed to fetch replied message:', error.message);
      }
    }

    // 3. STRICT MODE: Keyword Detection (REQUIRED - must mention persona or movie keyword)
    const keywordMatch = this.detectKeywords(content);
    if (keywordMatch.matched && keywordMatch.persona) {
      // Persona name detected - ALWAYS reply
      console.log(`[INT] Persona name "${keywordMatch.persona}" detected - replying`);
      return { shouldReply: true, persona: keywordMatch.persona, reason: 'persona_keyword', relevance: 1.0 };
    }

    // NO keyword match - DO NOT REPLY (strict mode)
    console.log('[INT] No @mention, reply, or persona keyword - not replying (strict mode)');
    return { shouldReply: false, persona: null, reason: 'no_keyword_match', relevance: 0 };
  }

  /**
   * Detect movie/character keywords in message
   * @param {string} content - Message content
   * @returns {{matched: boolean, keywords: string[], persona: string|null}}
   */
  detectKeywords(content) {
    const matched = [];
    let personaMatch = null;

    // FIRST: Check for character relationship phrases (higher priority)
    const characterRelations = {
      "elio's aunt": "Olga",
      "elio's mom": "Olga",
      "glordon's friend": "Elio",
      "caleb's friend": "Elio"
    };

    for (const [phrase, persona] of Object.entries(characterRelations)) {
      if (content.toLowerCase().includes(phrase)) {
        console.log(`[INT] Relationship phrase detected: "${phrase}" → ${persona}`);
        return {
          matched: true,
          keywords: [phrase],
          persona: persona
        };
      }
    }

    // SECOND: Check for individual character names (with possessive exclusion)
    for (const keyword of MOVIE_KEYWORDS) {
      // Use negative lookahead to exclude possessive forms (e.g., "Elio's")
      const regex = new RegExp(`\\b${keyword}\\b(?!'s)`, 'i');
      if (regex.test(content)) {
        matched.push(keyword);

        // Check if keyword is a character name
        const charNames = ['elio', 'glordon', 'caleb', 'bryce', 'olga', 'grigon',
                          'questa', 'auva', 'mira', 'ooooo', 'helix', 'tegmen',
                          'turais', 'naos', 'gunther'];
        if (charNames.includes(keyword.toLowerCase())) {
          // Capitalize first letter for persona name
          personaMatch = keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase();
        }
      }
    }

    return {
      matched: matched.length > 0,
      keywords: matched,
      persona: personaMatch
    };
  }

  /**
   * Calculate semantic relevance using embeddings
   * @param {string} content - Message content
   * @returns {Promise<number>} - Relevance score 0-1
   */
  async calculateRelevance(content) {
    try {
      // Use RAG search to check relevance against movie knowledge base
      const result = await this.ai.rag.search({ query: content, topK: 3, generateAnswer: false });

      if (!result.ok || !result.data.hits || result.data.hits.length === 0) {
        return 0;
      }

      // Average score of top results
      const scores = result.data.hits.map(r => r.score || r._score || 0);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      return avgScore;
    } catch (error) {
      console.error('[ERR] calculateRelevance failed:', error.message);
      return 0;
    }
  }

  /**
   * Select appropriate persona for message (IMPROVED for multi-keyword and direct addressing)
   * @param {Message} message - Discord message
   * @param {string} content - Lowercase message content
   * @param {boolean} forceReselect - If true, ignore active conversation and select based on content only
   * @returns {Promise<string>} - Persona name
   */
  async selectPersonaForMessage(message, content, forceReselect = false) {
    // CRITICAL: When @mentioned, ALWAYS select based on message content, ignore history
    // Only use activeConversation for reply-based multi-turn conversations
    if (!forceReselect) {
      const activeConv = this.getActiveConversation(message.channelId, message.author.id);
      if (activeConv && activeConv.personaName) {
        // CRITICAL: Stay with current persona unless EXPLICITLY addressing someone ELSE
        // Check if message contains OTHER persona names
        const personasResult = await this.personas.listPersonas();
        if (personasResult.ok) {
          const allPersonas = personasResult.data;
          const otherPersonaMentioned = allPersonas.some(p =>
            p.name !== activeConv.personaName &&
            content.includes(p.name.toLowerCase())
          );

          // If no other persona mentioned, stay with current one
          if (!otherPersonaMentioned) {
            console.log(`[INT] Staying with active conversation persona: ${activeConv.personaName}`);
            return activeConv.personaName;
          }
          // If other persona mentioned, fall through to detection
          console.log(`[INT] Other persona mentioned, switching from ${activeConv.personaName}`);
        }
      }
    } else {
      console.log('[INT] Force reselect - ignoring active conversation, selecting based on content');
    }

    // Detect all mentioned personas
    const personasResult = await this.personas.listPersonas();
    if (!personasResult.ok) {
      return 'Elio'; // Fallback to Elio if can't fetch personas
    }
    const allPersonas = personasResult.data;
    const mentionedPersonas = [];

    for (const persona of allPersonas) {
      if (content.includes(persona.name.toLowerCase())) {
        mentionedPersonas.push(persona.name);
      }
    }

    // If only one persona mentioned, use it
    if (mentionedPersonas.length === 1) {
      return mentionedPersonas[0];
    }

    // If multiple personas mentioned, use context analysis
    if (mentionedPersonas.length > 1) {
      // PRIORITY 1: Check for IMPERATIVE/DIRECT ADDRESS at sentence start
      // Pattern: "Name, ..." or "Name you ..." or "Name do/should/can ..."
      // Example: "Elio you should listen to your aunt olga" -> addressing Elio
      const imperativePattern = /^(\w+)\s+(?:you|should|can|could|would|do|don't|are|is)/i;
      const imperativeMatch = content.match(imperativePattern);

      if (imperativeMatch) {
        const targetName = imperativeMatch[1].charAt(0).toUpperCase() + imperativeMatch[1].slice(1).toLowerCase();
        if (mentionedPersonas.includes(targetName)) {
          console.log(`[INT] Multi-keyword: Selected ${targetName} via imperative address (being spoken TO)`);
          return targetName;
        }
      }

      // PRIORITY 2: Check for direct addressing patterns
      const directPatterns = [
        { pattern: /^(\w+),/i, type: 'comma_address' }, // "Name, ..." (highest priority)
        { pattern: /(?:hey|hi|hello|yo)\s+(\w+)/i, type: 'greeting' },
        { pattern: /(\w+),\s+(?:what|how|why|when|where|who|can|do|are|is)/i, type: 'question' },
        { pattern: /(?:ask|tell|show)\s+(\w+)/i, type: 'request' },
        { pattern: /(?:talk to|speak with|chat with)\s+(\w+)/i, type: 'explicit' }
      ];

      for (const { pattern, type } of directPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const targetName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          if (mentionedPersonas.includes(targetName)) {
            console.log(`[INT] Multi-keyword: Selected ${targetName} via ${type}`);
            return targetName;
          }
        }
      }

      // PRIORITY 3: Check for "you" pronoun - person before "you" is being addressed
      // Example: "Elio you should..." -> Elio is being addressed
      const youPattern = /(\w+)\s+you\s+/i;
      const youMatch = content.match(youPattern);

      if (youMatch) {
        const targetName = youMatch[1].charAt(0).toUpperCase() + youMatch[1].slice(1).toLowerCase();
        if (mentionedPersonas.includes(targetName)) {
          console.log(`[INT] Multi-keyword: Selected ${targetName} (found before 'you')`);
          return targetName;
        }
      }

      // PRIORITY 4: Use LLM to determine intent (fallback for complex cases)
      try {
        const intentQuery = `Who is being DIRECTLY ADDRESSED (spoken TO) in this message? Only answer with one name from: ${mentionedPersonas.join(', ')}. Message: "${message.content}"`;
        const intentResult = await this.ai.llm.generate(intentQuery, {
          maxTokens: 20,
          temperature: 0.3
        });

        if (intentResult.ok) {
          const response = intentResult.data.text || intentResult.data.response || '';
          for (const persona of mentionedPersonas) {
            if (response.includes(persona)) {
              console.log(`[INT] Multi-keyword: Selected ${persona} via LLM intent analysis`);
              return persona;
            }
          }
        }
      } catch (error) {
        console.error('[ERR] LLM intent analysis failed:', error.message);
      }

      // If still unclear, prefer first mentioned persona
      console.log(`[INT] Multi-keyword: Defaulting to first mentioned: ${mentionedPersonas[0]}`);
      return mentionedPersonas[0];
    }

    // No explicit persona mention - use RAG to determine best match
    try {
      const ragResult = await this.ai.rag.search({ query: content, topK: 3, generateAnswer: false });
      if (ragResult.ok && ragResult.data.hits && ragResult.data.hits.length > 0) {
        // Count character mentions in top results
        const characterCounts = {};

        for (const doc of ragResult.data.hits) {
          if (doc.metadata && doc.metadata.character) {
            const char = doc.metadata.character;
            characterCounts[char] = (characterCounts[char] || 0) + (doc.score || 1);
          }
        }

        // Return character with highest score
        const bestMatch = Object.entries(characterCounts)
          .sort((a, b) => b[1] - a[1])[0];

        if (bestMatch) {
          return bestMatch[0];
        }
      }
    } catch (error) {
      console.error('[ERR] selectPersonaForMessage RAG failed:', error.message);
    }

    // Default to Elio (main character)
    return 'Elio';
  }

  /**
   * Check if user is in active conversation
   * @param {string} channelId
   * @param {string} userId
   * @returns {boolean}
   */
  isInActiveConversation(channelId, userId) {
    const conv = this.getActiveConversation(channelId, userId);
    if (!conv) return false;

    // Consider conversation active if last reply was within 10 minutes
    const timeSinceLastReply = Date.now() - conv.lastReply;
    const TEN_MINUTES = 10 * 60 * 1000;

    return timeSinceLastReply < TEN_MINUTES;
  }

  /**
   * Get active conversation data
   * @param {string} channelId
   * @param {string} userId
   * @returns {object|null}
   */
  getActiveConversation(channelId, userId) {
    if (!this.activeConversations.has(channelId)) {
      return null;
    }

    const channelConvs = this.activeConversations.get(channelId);
    return channelConvs.get(userId) || null;
  }

  /**
   * Record bot reply to track active conversations
   * @param {string} channelId
   * @param {string} userId
   * @param {string} personaName
   */
  recordBotReply(channelId, userId, personaName) {
    if (!this.activeConversations.has(channelId)) {
      this.activeConversations.set(channelId, new Map());
    }

    const channelConvs = this.activeConversations.get(channelId);
    const existing = channelConvs.get(userId);

    channelConvs.set(userId, {
      personaName,
      lastReply: Date.now(),
      messageCount: (existing?.messageCount || 0) + 1,
      startedAt: existing?.startedAt || Date.now()
    });

    // Cleanup old conversations (older than 30 minutes)
    this.cleanupOldConversations();
  }

  /**
   * Switch persona in active conversation
   * @param {string} channelId
   * @param {string} userId
   * @param {string} newPersona
   */
  switchPersona(channelId, userId, newPersona) {
    if (!this.activeConversations.has(channelId)) {
      return;
    }

    const channelConvs = this.activeConversations.get(channelId);
    const conv = channelConvs.get(userId);

    if (conv) {
      conv.personaName = newPersona;
      conv.lastReply = Date.now();
    }
  }

  /**
   * End active conversation for a user
   * @param {string} channelId
   * @param {string} userId
   */
  endConversation(channelId, userId) {
    if (!this.activeConversations.has(channelId)) {
      return;
    }

    const channelConvs = this.activeConversations.get(channelId);
    channelConvs.delete(userId);
    console.log(`[INT] Ended conversation for user ${userId} in channel ${channelId}`);
  }

  /**
   * Cleanup old conversations
   */
  cleanupOldConversations() {
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const now = Date.now();

    for (const [channelId, channelConvs] of this.activeConversations.entries()) {
      for (const [userId, conv] of channelConvs.entries()) {
        if (now - conv.lastReply > THIRTY_MINUTES) {
          channelConvs.delete(userId);
        }
      }

      // Remove empty channel maps
      if (channelConvs.size === 0) {
        this.activeConversations.delete(channelId);
      }
    }
  }

  /**
   * Get conversation statistics
   * @returns {object}
   */
  getStats() {
    let totalConversations = 0;
    let activeConversations = 0;
    const TEN_MINUTES = 10 * 60 * 1000;
    const now = Date.now();

    for (const channelConvs of this.activeConversations.values()) {
      totalConversations += channelConvs.size;
      for (const conv of channelConvs.values()) {
        if (now - conv.lastReply < TEN_MINUTES) {
          activeConversations++;
        }
      }
    }

    return {
      totalConversations,
      activeConversations,
      channels: this.activeConversations.size
    };
  }
}

/**
 * Create auto-reply manager instance
 */
export function createAutoReplyManager(services) {
  return new AutoReplyManager(services);
}
