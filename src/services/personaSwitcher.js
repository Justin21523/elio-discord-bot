/**
 * services/personaSwitcher.js
 * Intelligent persona detection and switching using AI Agent + RAG + Keywords
 * Enables seamless multi-persona conversations with automatic context switching
 */

import { logger } from "../util/logger.js";
import { listPersonas, getPersona } from "./persona.js";

// Core movie theme keywords - high weight (2.5x)
// These are specific to the Communiverse movie/story and characters
// Based on official Disney Fandom wiki canon
const CORE_THEME_KEYWORDS = new Set([
  // Universal Communiverse themes
  "communiverse", "wormhole", "space council", "galactic", "interstellar",
  "universal peace", "peace treaty", "diplomatic mission", "alien abduction",
  "voyager golden record",

  // Elio-specific
  "earth ambassador", "ambassador solis", "mr. solis", "earth representative",
  "mistaken identity", "eye patch", "montez air force base", "cosmic dreams",
  "glordon friendship", "parents deaths",

  // Glordon-specific
  "hylurgian", "tardigrade-like", "water bear", "grigon's son", "prince glordon",
  "warrior armor", "battle carapace", "purple alien", "mouth crying",

  // Caleb-specific (FANDOM: secondary antagonist, bully)
  "camp carver", "montez middle school", "ham radio fight", "elio's eye injury",
  "beach fight", "expelled from camp", "mask prank", "blonde spiked hair",

  // Bryce-specific
  "redemption arc", "px-lol radio", "ham radio operator", "redeemed bully",
  "glordon contact", "mid-credits scene",

  // Olga-specific
  "air force major", "major solis", "elio's aunt", "montez air force base",
  "space debris rescue", "clone detection", "o-4 rank",

  // Grigon-specific
  "lord grigon", "hylurgian warlord", "emperor", "skull collection",
  "amber trophies", "warrior ceremony", "carapace ripping", "scourge of crab nebula",

  // Questa-specific
  "ambassador questa", "mind reader", "telepathic", "gom leader",
  "you are never alone", "15-foot-tall", "leafy sea dragon",

  // Auva-specific
  "ambassador auva", "universal user's manual", "positive vibes",
  "ink-splat face", "caterpillar-like", "shapeshifting emotions",

  // Mira-specific
  "empress mira", "cloud-like body", "vapor dress", "mist form",
  "cunning empress", "sweet voice",

  // Ooooo-specific
  "supercomputer", "liquid computer", "liquid AI", "infinite knowledge",
  "clone creation", "elio clone", "transparent blue liquid",

  // Helix-specific
  "ambassador helix", "falluvinum", "ancient senator", "party lover",
  "effervescent", "word enthusiast",

  // Tegmen-specific
  "ambassador tegmen", "floating boulders", "rational voice",
  "geological nature", "planet tegmen",

  // Turais-specific
  "ambassador turais", "first to panic", "purple squid", "single yellow eye",
  "anxious diplomat", "high-strung",

  // Naos-specific
  "ambassador naos", "omnilingual", "universal translator", "eliospeak",
  "invented language", "linguistic expert",

  // Gunther-specific
  "captain gunther", "masters of ham", "ham radio network", "conspiracy theorist",
  "drake equation", "disheveled", "ketchup stains", "turns out right"
]);

// Enhanced keyword mappings for each persona
// Each persona has: name keywords, core theme keywords, and generic keywords
// Based on official Disney Fandom wiki canon (2025-06-20)
const PERSONA_KEYWORDS = {
  Elio: [
    // Name & core identity - PROTAGONIST
    "elio", "elio solis", "solis", "earth ambassador", "ambassador solis",
    "mistaken identity", "11-year-old", "eye patch", "orphan",
    // Communiverse themes - Elio's journey
    "communiverse", "alien abduction", "voyager golden record", "glordon friendship",
    "montez air force base", "camp carver", "cosmic dreams", "parents deaths",
    "space exploration", "ham radio", "heroism",
    // Generic personality
    "curious", "lonely", "empathetic", "enthusiastic", "imaginative",
    "warm-hearted", "insecure", "passionate", "hyperactive", "rambunctious"
  ],

  Glordon: [
    // Name & core identity - TRITAGONIST
    "glordon", "prince glordon", "hylurgian", "tardigrade-like",
    "water bear", "grigon's son", "purple alien",
    // Communiverse themes - Glordon's story
    "warrior armor rejection", "battle carapace", "near-death experience",
    "mouth crying", "lava tunnels", "reconciliation with father",
    "peaceful nature", "kidnapped", "dying rescue",
    // Generic personality
    "tenderhearted", "naive", "sweet", "empathetic", "gentle",
    "selfless", "compassionate", "fearful", "kind"
  ],

  Caleb: [
    // Name & core identity (FANDOM: Secondary antagonist, middle school bully)
    "caleb", "bully", "antagonist", "camp carver", "montez middle school",
    "middle schooler", "blonde hair", "spiked hair",
    // Communiverse themes related to Caleb
    "bullying", "manipulation", "cruelty", "arrogant", "insensitive",
    "fights elio", "ham radio incident", "beach fight", "expelled from camp",
    "bryce's friend", "peer pressure", "masks prank",
    // Generic
    "vindictive", "domineering", "cruel", "manipulative", "mean",
    "aggressive", "hostile", "troublemaker"
  ],

  Bryce: [
    // Name & core identity - SUPPORTING (redeemed bully)
    "bryce", "bryce markwell", "middle schooler", "montez",
    "px-lol radio", "redeemed bully",
    // Communiverse themes - Bryce's redemption
    "redemption arc", "ham radio operator", "glordon contact",
    "mid-credits scene", "gunther collaboration", "apology",
    "peer pressure victim", "moral growth", "beach encounter",
    "camp carver",
    // Generic personality
    "friendly", "impressionable", "remorseful", "kind-hearted",
    "guilty", "courageous", "empathetic"
  ],

  Olga: [
    // Name & core identity - DEUTERAGONIST
    "olga", "olga solis", "major solis", "air force major",
    "elio's aunt", "military officer", "o-4 rank",
    // Communiverse themes - Olga's journey
    "montez air force base", "space debris rescue", "clone detection",
    "astronaut program sacrifice", "classified operation",
    "voyager investigation", "nephew protection", "reconciliation",
    // Generic personality
    "disciplined", "protective", "intelligent", "confident",
    "caring", "authoritative", "empathetic", "grounding"
  ],

  Grigon: [
    // Name & core identity - MAIN ANTAGONIST (redeemed)
    "grigon", "lord grigon", "hylurgian warlord", "emperor",
    "glordon's father", "scourge of crab nebula",
    // Communiverse themes - Grigon's redemption
    "communiverse rejection", "conquest threat", "weaponized mech suit",
    "skull collection", "amber trophies", "warrior ceremony",
    "carapace ripping", "glordon rescue", "redemption", "apology",
    "hylurgian honor", "ate his mother",
    // Generic personality
    "ruthless", "honorable", "short-tempered", "forgiving",
    "strategic", "protective", "war-driven"
  ],

  Questa: [
    // Name & core identity - OVERARCHING PROTAGONIST
    "questa", "ambassador questa", "gom leader", "communiverse chief",
    "mind reader", "telepathic", "15-foot-tall",
    // Communiverse themes - Questa's role
    "mind reading powers", "elio's lie exposure", "you are never alone",
    "abduction initiator", "empathic guidance", "leafy sea dragon",
    "intense eye contact", "no personal space", "manta ray fins",
    // Generic personality
    "kind-hearted", "intuitive", "empathetic", "optimistic",
    "diplomatic", "honest", "compassionate"
  ],

  Auva: [
    // Name & core identity - SUPPORTING AMBASSADOR
    "auva", "ambassador auva", "peace-loving leader",
    "manual creator", "universal user's manual",
    // Communiverse themes - Auva's role
    "positive vibes", "ink-splat face", "caterpillar-like",
    "shapeshifting emotions", "communication advocate",
    "grigon rejection vote", "flat red face",
    // Generic personality
    "bubbly", "optimistic", "intelligent", "peaceful",
    "passionate", "expressive"
  ],

  Mira: [
    // Name & core identity - SUPPORTING AMBASSADOR
    "mira", "empress mira", "cunning empress", "strategic diplomat",
    // Communiverse themes - Mira's role
    "cloud-like body", "vapor dress", "mist form",
    "sweet voice facade", "adorable disposition",
    "communiverse protection", "calculated decisions",
    "weightless floating", "big purple eyes",
    // Generic personality
    "cunning", "diplomatic", "graceful", "strategic",
    "protective", "soft-spoken", "intelligent", "firm"
  ],

  Ooooo: [
    // Name & core identity - SUPPORTING CHARACTER
    "ooooo", "supercomputer", "liquid computer", "liquid AI",
    "sentient technology", "transparent blue liquid",
    // Communiverse themes - Ooooo's role
    "infinite knowledge", "clone creation", "elio clone",
    "behavioral patterns", "system interface", "species accommodation",
    "elaborate circuitry", "infinite energy", "elemental cameo",
    // Generic personality
    "intelligent", "efficient", "curious", "calm", "unflappable"
  ],

  Helix: [
    // Name & core identity - SUPPORTING AMBASSADOR
    "helix", "ambassador helix", "falluvinum leader",
    "ancient senator", "party lover",
    // Communiverse themes - Helix's role
    "word enthusiast", "effervescent personality", "seen it all",
    "elio abduction", "communiverse assembly", "intergalactic senate",
    // Generic personality
    "welcoming", "effervescent", "talkative", "gregarious",
    "ancient", "experienced"
  ],

  Tegmen: [
    // Name & core identity - SUPPORTING AMBASSADOR
    "tegmen", "ambassador tegmen", "planet tegmen leader",
    "rational voice", "floating boulders",
    // Communiverse themes - Tegmen's role
    "pragmatic council voice", "geological nature",
    "hovering stone segments", "unseen energy connection",
    "symmetry", "analytical diplomacy",
    // Generic personality
    "rational", "logical", "blunt", "analytical",
    "pragmatic", "stoic", "honest", "grounded"
  ],

  Turais: [
    // Name & core identity - SUPPORTING AMBASSADOR
    "turais", "ambassador turais", "anxious diplomat",
    "high-strung", "first to panic", "purple squid",
    // Communiverse themes - Turais's role
    "single yellow eye", "fish-wizard shape", "non-bipedal alien",
    "comedic tension", "worst outcomes", "council anxiety",
    // Generic personality
    "fearful", "anxious", "nervous", "well-meaning",
    "cooperative", "cautious", "overreactive"
  ],

  Naos: [
    // Name & core identity - SUPPORTING AMBASSADOR
    "naos", "ambassador naos", "omnilingual", "universal translator",
    "linguistic expert",
    // Communiverse themes - Naos's role
    "eliospeak comprehension", "invented language understanding",
    "communication symbolism", "quiet presence",
    "universal comprehension", "mystery reveal",
    // Generic personality
    "intelligent", "observant", "linguistically gifted",
    "calm", "essential", "communicative"
  ],

  Gunther: [
    // Name & core identity - SUPPORTING CHARACTER
    "gunther", "gunther melmac", "captain gunther",
    "military contractor", "masters of ham leader",
    // Communiverse themes - Gunther's role
    "conspiracy theorist", "alien theories", "voyager response",
    "elio's message", "space debris navigation", "ham radio network",
    "disheveled appearance", "smudged glasses", "ketchup stains",
    "drake equation shirt", "pizza planet truck", "melmac planet",
    "ALF homage", "turns out right",
    // Generic personality
    "manic", "passionate", "eccentric", "intelligent",
    "energetic", "expressive", "clumsy", "oddball"
  ],
};

// General lore keywords that might not map to specific persona
const LORE_KEYWORDS = [
  "communiverse", "wormhole", "aliens", "space council", "galactic",
  "diplomatic", "universe", "planets", "species", "interstellar",
  "cosmic", "alien species", "peace treaty", "space diplomacy",
  "universal peace", "galactic federation", "alien cultures"
];

/**
 * Detect which persona(s) the user is trying to talk to
 * Uses multi-layer detection: Keywords → RAG → AI Agent
 *
 * @param {string} messageContent - User's message
 * @param {string} currentPersona - Currently active persona (if any)
 * @param {Object} services - Bot services (ai, personas, etc.)
 * @param {string} guildId - Guild ID for RAG context
 * @returns {Promise<{persona: string|null, confidence: number, reason: string, shouldSwitch: boolean}>}
 */
export async function detectPersona(messageContent, currentPersona, services, guildId) {
  const content = messageContent.toLowerCase();

  logger.info("[PERSONA-SWITCH] Detecting persona", {
    message: messageContent.substring(0, 80),
    messageLength: messageContent.length,
    currentPersona,
    guildId
  });

  // LAYER 1: Quick keyword detection (most efficient)
  const keywordResult = detectByKeywords(content);

  // IMPORTANT: If keyword confidence > 0.6, trust it over RAG!
  // This prevents RAG from overriding explicit persona mentions
  if (keywordResult.persona && keywordResult.confidence > 0.6) {
    const shouldSwitch = keywordResult.persona !== currentPersona;
    logger.info("[PERSONA-SWITCH] Keyword detection (HIGH CONFIDENCE)", {
      detected: keywordResult.persona,
      confidence: keywordResult.confidence,
      currentPersona,
      shouldSwitch
    });

    return {
      persona: keywordResult.persona,
      confidence: keywordResult.confidence,
      reason: "keyword_match",
      shouldSwitch
    };
  }

  // LAYER 2: RAG semantic search (if AI service available)
  // ADJUSTED: Higher threshold (0.85) to reduce false positives
  if (services.ai?.rag && content.length > 20) {
    const ragResult = await detectByRAG(content, services.ai, guildId);
    if (ragResult.persona && ragResult.confidence > 0.85) {
      const shouldSwitch = ragResult.persona !== currentPersona;
      logger.info("[PERSONA-SWITCH] RAG detection (HIGH CONFIDENCE)", {
        detected: ragResult.persona,
        confidence: ragResult.confidence,
        currentPersona,
        shouldSwitch
      });

      return {
        persona: ragResult.persona,
        confidence: ragResult.confidence,
        reason: "rag_semantic",
        shouldSwitch
      };
    }
  }

  // LAYER 3: AI Agent intelligent decision (if no strong match yet)
  if (services.ai?.llm && content.length > 15) {
    const agentResult = await detectByAIAgent(messageContent, currentPersona, services);
    if (agentResult.persona) {
      const shouldSwitch = agentResult.persona !== currentPersona;
      logger.info("[PERSONA-SWITCH] AI Agent detection", {
        detected: agentResult.persona,
        confidence: agentResult.confidence,
        currentPersona,
        shouldSwitch
      });

      return {
        persona: agentResult.persona,
        confidence: agentResult.confidence,
        reason: "ai_agent",
        shouldSwitch
      };
    }
  }

  // FALLBACK: Keep current persona if in active conversation
  if (currentPersona) {
    logger.debug("[PERSONA-SWITCH] No switch detected, keeping current", {
      currentPersona
    });

    return {
      persona: currentPersona,
      confidence: 0.5,
      reason: "conversation_continuation",
      shouldSwitch: false
    };
  }

  // NO MATCH: No persona detected
  logger.debug("[PERSONA-SWITCH] No persona detected");
  return {
    persona: null,
    confidence: 0,
    reason: "no_match",
    shouldSwitch: false
  };
}

/**
 * Layer 1: Fast keyword-based detection
 */
function detectByKeywords(content) {
  let bestMatch = null;
  let bestScore = 0;

  for (const [personaName, keywords] of Object.entries(PERSONA_KEYWORDS)) {
    let score = 0;
    let matchedKeywords = [];
    let hasNameMatch = false;
    let hasCoreTheme = false;

    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        // Determine weight based on keyword type:
        // - Name match: 3.0 (highest priority)
        // - Core theme: 2.5 (movie-specific concept)
        // - Generic: 1.0 (lower priority)
        const isName = keyword === personaName.toLowerCase();
        const isCoreTheme = CORE_THEME_KEYWORDS.has(keyword);

        let weight;
        if (isName) {
          weight = 3.0;
          hasNameMatch = true;
        } else if (isCoreTheme) {
          weight = 2.5;
          hasCoreTheme = true;
        } else {
          weight = 1.0;
        }

        score += weight;
        matchedKeywords.push({ keyword, weight });
      }
    }

    // Improved confidence calculation with core theme support:
    // - Direct name mention: 0.95+ confidence (very high)
    // - Core theme keywords: 0.80+ confidence (high - movie-specific)
    // - Multiple keywords: 0.70-0.85 confidence
    // - Single generic keyword: 0.35 confidence (low)
    let confidence;
    if (hasNameMatch) {
      // Name match gets high base confidence, increased by additional keywords
      confidence = Math.min(0.95 + (matchedKeywords.length - 1) * 0.05, 1.0);
    } else if (hasCoreTheme) {
      // Core theme keywords get high confidence even without name
      // Multiple core themes or core + generic = very high confidence
      confidence = Math.min(0.75 + (score - 2.5) * 0.15, 0.95);
    } else {
      // Generic keywords need multiple matches for decent confidence
      confidence = Math.min(score * 0.35, 0.70);
    }

    if (confidence > bestScore) {
      bestScore = confidence;
      bestMatch = personaName;
    }

    if (matchedKeywords.length > 0) {
      logger.info("[PERSONA-SWITCH] Keyword matches", {
        persona: personaName,
        matches: matchedKeywords.map(m => m.keyword),
        hasNameMatch,
        hasCoreTheme,
        rawScore: score,
        confidence
      });
    }
  }

  return {
    persona: bestMatch,
    confidence: bestScore
  };
}

/**
 * Layer 2: RAG semantic search for persona detection
 * IMPROVED: Prioritize personas mentioned in the user's original message
 */
async function detectByRAG(content, ai, guildId) {
  try {
    const ragResult = await ai.rag.search({
      query: content,
      guildId,
      topK: 3,
      generateAnswer: false
    });

    if (!ragResult.ok || !ragResult.data.hits || ragResult.data.hits.length === 0) {
      return { persona: null, confidence: 0 };
    }

    // IMPROVEMENT: Check which personas are mentioned in user's message
    const userMentionedPersonas = new Set();
    const lowerContent = content.toLowerCase();
    for (const personaName of Object.keys(PERSONA_KEYWORDS)) {
      if (lowerContent.includes(personaName.toLowerCase())) {
        userMentionedPersonas.add(personaName);
      }
    }

    // Analyze top hits for persona mentions
    const personaCounts = new Map();
    let totalScore = 0; // Sum of all scores for normalization

    for (const hit of ragResult.data.hits) {
      const score = hit.score || 0;
      const text = (hit.chunk || "").toLowerCase();
      totalScore += score;

      // Check which personas are mentioned in this chunk
      for (const personaName of Object.keys(PERSONA_KEYWORDS)) {
        if (text.includes(personaName.toLowerCase())) {
          const current = personaCounts.get(personaName) || 0;
          // BOOST score if persona was mentioned in user's message
          const boost = userMentionedPersonas.has(personaName) ? 2.0 : 1.0;
          personaCounts.set(personaName, current + (score * boost));
        }
      }
    }

    // Find persona with highest accumulated score
    let bestPersona = null;
    let bestScore = 0;

    for (const [persona, score] of personaCounts.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestPersona = persona;
      }
    }

    // FIX: Calculate confidence based on how much of total RAG score this persona represents
    // AND how many RAG hits mentioned this persona
    // This prevents false positives where RAG finds something but it's not very relevant
    const hitCount = ragResult.data.hits.length;
    const scoreRatio = totalScore > 0 ? bestScore / totalScore : 0;
    const personaHitCount = ragResult.data.hits.filter(hit =>
      (hit.chunk || "").toLowerCase().includes(bestPersona?.toLowerCase() || "")
    ).length;
    const hitRatio = hitCount > 0 ? personaHitCount / hitCount : 0;

    // Confidence is geometric mean of score ratio and hit ratio
    // Both need to be high for high confidence
    const confidence = Math.sqrt(scoreRatio * hitRatio);

    logger.info("[PERSONA-SWITCH] RAG analysis", {
      topHits: ragResult.data.hits.length,
      userMentioned: Array.from(userMentionedPersonas),
      personaCounts: Object.fromEntries(personaCounts),
      detected: bestPersona,
      confidence
    });

    return {
      persona: bestPersona,
      confidence
    };
  } catch (error) {
    logger.error("[PERSONA-SWITCH] RAG detection failed", {
      error: error.message
    });
    return { persona: null, confidence: 0 };
  }
}

/**
 * Layer 3: AI Agent intelligent persona detection with enhanced reasoning
 * Uses LLM with chain-of-thought to analyze message and determine intended persona
 */
async function detectByAIAgent(messageContent, currentPersona, services) {
  try {
    const { ai, personas } = services;

    // Get list of available personas with full details
    const personasResult = await listPersonas();
    if (!personasResult.ok || personasResult.data.length === 0) {
      return { persona: null, confidence: 0 };
    }

    // Build detailed persona profiles for better context
    const personaProfiles = personasResult.data
      .map(p => {
        const parts = [
          `**${p.name}**`,
          p.description ? `Description: ${p.description}` : null,
          p.personality ? `Personality: ${p.personality}` : null,
          p.background ? `Background: ${p.background}` : null,
          p.speakingStyle ? `Speaking Style: ${p.speakingStyle}` : null,
        ].filter(Boolean);
        return parts.join('\n  ');
      })
      .join('\n\n');

    // Build enhanced prompt with chain-of-thought reasoning
    const prompt = `You are an expert AI assistant analyzing whether a user's message is intended for a specific character persona from the Communiverse universe.

# Available Personas:
${personaProfiles}

# User's Message:
"${messageContent}"

# Current Context:
- Current conversation persona: ${currentPersona || "None (first message)"}
- Message type: ${currentPersona ? "Continuation" : "Potential first contact"}

# Analysis Task:
Analyze this message carefully using step-by-step reasoning:

1. **Direct References**: Does the message mention any character names, titles, or unique identifiers?

2. **Topic Relevance**: Does the message discuss topics, events, or themes specific to any character's background or expertise?

3. **Contextual Clues**: Are there indirect references (locations, relationships, abilities) that connect to a specific character?

4. **Conversation Flow**: If there's a current persona, does this message naturally continue that conversation?

5. **Relevance Score**: How strongly does this message relate to the Communiverse characters/story? (0-10)

# Output Format:
Provide your reasoning, then conclude with:
PERSONA: [Name] (CONFIDENCE: [0.0-1.0])

Or if no clear match:
PERSONA: NONE (CONFIDENCE: 0.0)

# Guidelines:
- Be STRICT: Only assign a persona if there's clear evidence
- Generic sci-fi/space topics don't automatically mean Elio/Communiverse
- High confidence (>0.9) requires explicit character references or highly specific context
- Medium confidence (0.7-0.9) for strong thematic connections
- Low confidence (<0.7) means NONE unless continuing active conversation
- If continuing conversation with current persona, default to that persona with high confidence

Begin analysis:`;

    const result = await ai.llm.generate({
      prompt,
      maxTokens: 300, // Allow for reasoning
      temperature: 0.2 // Low but not zero - allow some reasoning flexibility
    });

    if (!result.ok || !result.data?.text) {
      return { persona: null, confidence: 0 };
    }

    const response = result.data.text.trim();

    // Parse the response for PERSONA and CONFIDENCE
    const personaMatch = response.match(/PERSONA:\s*([A-Za-z]+)/i);
    const confidenceMatch = response.match(/CONFIDENCE:\s*([0-9.]+)/i);

    logger.debug("[PERSONA-SWITCH] AI Agent reasoning", {
      message: messageContent.substring(0, 50),
      response: response.substring(0, 200),
      personaMatch: personaMatch?.[1],
      confidenceMatch: confidenceMatch?.[1]
    });

    if (!personaMatch) {
      return { persona: null, confidence: 0 };
    }

    const detectedName = personaMatch[1].trim();
    const aiConfidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

    // Validate the AI response against available personas
    if (detectedName === "NONE" || detectedName.toLowerCase() === "none") {
      return { persona: null, confidence: Math.min(aiConfidence, 0.3) };
    }

    const matchedPersona = personasResult.data.find(
      p => p.name.toLowerCase() === detectedName.toLowerCase()
    );

    if (matchedPersona) {
      // Use AI's confidence score, capped appropriately
      // AI tends to be overconfident, so we scale it down slightly
      const scaledConfidence = Math.min(aiConfidence * 0.85, 0.98);

      logger.info("[PERSONA-SWITCH] AI Agent detected persona", {
        persona: matchedPersona.name,
        aiConfidence,
        scaledConfidence,
        reasoning: response.substring(0, 150)
      });

      return {
        persona: matchedPersona.name,
        confidence: scaledConfidence
      };
    }

    return { persona: null, confidence: 0 };
  } catch (error) {
    logger.error("[PERSONA-SWITCH] AI Agent detection failed", {
      error: error.message
    });
    return { persona: null, confidence: 0 };
  }
}

/**
 * Get the currently active persona for a user in a channel
 * (Used by messageRouter to track conversation state)
 */
const activeConversations = new Map(); // Map<userId_channelId, {personaName, expiresAt}>
const CONVERSATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function getActivePersona(userId, channelId) {
  const key = `${userId}_${channelId}`;
  const convo = activeConversations.get(key);

  if (!convo) return null;

  if (Date.now() > convo.expiresAt) {
    activeConversations.delete(key);
    return null;
  }

  return convo.personaName;
}

export function setActivePersona(userId, channelId, personaName) {
  const key = `${userId}_${channelId}`;
  activeConversations.set(key, {
    personaName,
    expiresAt: Date.now() + CONVERSATION_TIMEOUT_MS
  });

  logger.debug("[PERSONA-SWITCH] Set active persona", {
    userId,
    channelId,
    persona: personaName,
    expiresIn: "5min"
  });
}

export function clearActivePersona(userId, channelId) {
  const key = `${userId}_${channelId}`;
  activeConversations.delete(key);
  logger.debug("[PERSONA-SWITCH] Cleared active persona", { userId, channelId });
}

// Cleanup old conversations every 10 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, convo] of activeConversations.entries()) {
    if (now > convo.expiresAt) {
      activeConversations.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug("[PERSONA-SWITCH] Cleaned up expired conversations", { count: cleaned });
  }
}, 10 * 60 * 1000);

export default {
  detectPersona,
  getActivePersona,
  setActivePersona,
  clearActivePersona
};
