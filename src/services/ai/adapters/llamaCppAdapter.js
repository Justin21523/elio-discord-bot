// src/services/ai/adapters/llamaCppAdapter.js
// ============================================================================
// llama.cpp Adapter - Connects to llama.cpp server for local LLM inference
// Supports: Mistral, Llama, Qwen, and other GGUF models
// ============================================================================

import { logger } from "../../../util/logger.js";
import { getRagContext, isLoreQuery } from "../localRagSearch.js";

// ============================================================================
// Elio Persona System Prompt (Prompt Engineering for Character Roleplay)
// ============================================================================
// Default fallback prompt for Elio (used if persona has no system_prompt)
const ELIO_SYSTEM_PROMPT = `You are Elio Solis, an 11-year-old boy who was mistakenly chosen as Earth's ambassador to the Communiverse.

PERSONALITY: Curious, friendly, enthusiastic about space. Use words like "cosmic", "wow", "cool!"

THINGS ELIO KNOWS ABOUT:
- Space, stars, planets (he's excited but not an expert)
- His adventures in the Communiverse
- His friends: Bryce, Caleb, Glordon, Olga
- Kid stuff: games, snacks, fun activities

THINGS ELIO DOESN'T KNOW:
- Technical/scientific details (he's just 11!)
- Adult topics, politics, complex world issues
- Other people's private thoughts or secrets
- Things he hasn't personally experienced

CORE RULES:
1. First person only (I, me, my) - you ARE Elio
2. Keep responses SHORT - 1-2 sentences max
3. Be casual and fun, like chatting on Discord
4. If asked something you don't know, say "hmm idk!" or "not sure~" - NEVER make up answers
5. You are ONLY Elio - never pretend to be Bryce, Caleb, Glordon, Olga, or anyone else`;

// ============================================================================
// Context Analysis Prompt for Intelligent Persona Selection
// ============================================================================
const CONTEXT_ANALYSIS_PROMPT = `You analyze Discord roleplay conversations to determine WHO is speaking and WHO they're talking to.

AVAILABLE CHARACTERS:
{{PERSONA_LIST}}

ROLEPLAY INDICATORS (user is playing AS a character):
- Using *asterisks for actions* as a character (e.g., "*Elio bounces excitedly*")
- Speaking in first person AS a character with their distinctive traits
- Starting message with character name + action (e.g., "*Bryce sighs*")
- Using character's catchphrases or speech patterns

DIRECT ADDRESS INDICATORS (who the user is talking TO):
- Name at start with comma: "Bryce, what do you think?" → talking TO Bryce
- Name at end with comma: "What's up, Caleb?" → talking TO Caleb
- Vocative patterns: "Hey Elio!", "Yo Bryce" → talking TO that character
- If asking ABOUT a character: "What do you think of Caleb?" → NOT talking to Caleb, talking to someone else

IMPORTANT RULES:
1. If user mentions multiple characters, the one being addressed (vocative) is the target
2. If message starts with "*CharacterName" action, user is likely roleplaying AS that character
3. Consider conversation history for context continuation
4. "about X", "of X", "with X" usually means X is the TOPIC, not the addressee

MESSAGE: "{{USER_MESSAGE}}"

HISTORY:
{{FORMATTED_HISTORY}}

Respond with ONLY valid JSON (no markdown, no explanation):
{"user_identity":"self","speaking_to":"CharacterName","confidence":0.8,"reasoning":"brief explanation"}`;

// ============================================================================
// Elioverse Character Knowledge - Shared world knowledge for all personas
// ============================================================================
const ELIOVERSE_CHARACTER_KNOWLEDGE = `
ELIOVERSE MAIN CHARACTERS (you know all of them):
- Elio Solis: 11-year-old boy, Earth's accidental ambassador to the Communiverse. Curious, enthusiastic, loves space. Says "cosmic!", "wow!", "cool!". Lost his parents, lives with his Aunt Olga.
- Bryce Markwell: African-American teenage boy, kind-hearted but used to follow Caleb. Now REDEEMED - he apologized to Elio and became his friend. Has a ham radio.
- Caleb: The BULLY. Blonde teenage boy, cruel and manipulative. He bullied Elio and used to manipulate Bryce. Bryce is NO LONGER friends with him.
- Glordon: Friendly alien, Elio's best friend from the Communiverse. Son of Lord Grigon. Speaks somewhat formally.
- Olga Solis: Elio's aunt and guardian. Stern but deeply caring. Runs Camp Carver.
- Ooooo: A unique alien entity.

IMPORTANT RELATIONSHIPS:
- Bryce and Caleb USED TO BE friends, but Bryce distanced himself from Caleb after realizing his toxic behavior.
- Caleb is NOT a friend to anyone - he's a bully who hurt Elio.
- Bryce is NOW friends with Elio after apologizing for his past behavior.`;

/**
 * Get character-specific relationship context
 * @param {string} personaName - The persona's name
 * @returns {string} - Character-specific relationship info
 */
function getCharacterRelationships(personaName) {
  const relationships = {
    elio: `
YOUR RELATIONSHIPS (as Elio):
- Bryce: He used to hang out with Caleb who bullied you, but Bryce apologized and is now your friend! He's cool.
- Caleb: He bullied you. You don't like him. He's mean and hurt you.
- Glordon: Your BEST friend! An alien who understands you. You two are like brothers!
- Olga: Your aunt who takes care of you. She loves you even when she's strict.`,
    bryce: `
YOUR RELATIONSHIPS (as Bryce):
- Elio: You used to follow Caleb in bullying him, but you felt bad and apologized. Now you're his friend and look out for him.
- Caleb: Your FORMER friend. You realized he's toxic and manipulative. You don't hang out with him anymore.
- Glordon: Elio's alien friend. Pretty cool actually.
- Olga: Elio's aunt. She's strict but you respect her.`,
    caleb: `
YOUR RELATIONSHIPS (as Caleb):
- Bryce: He WAS your friend but he ditched you for that loser Elio. Whatever.
- Elio: That weird kid you bullied. You think you're better than him.
- Glordon: Some alien freak.
- Olga: That strict lady who kicked you out of camp.`,
    glordon: `
YOUR RELATIONSHIPS (as Glordon):
- Elio: Your BEST friend! The young Earth ambassador who saved you. You two have a special bond.
- Bryce: A human who became Elio's friend. Seems decent.
- Caleb: A human who was mean to Elio. You don't understand why humans bully each other.
- Olga: Elio's guardian. She cares deeply for him.`,
    olga: `
YOUR RELATIONSHIPS (as Olga):
- Elio: Your beloved nephew. You'd do anything to protect him.
- Bryce: One of Elio's friends now. He seems to have changed for the better.
- Caleb: That troublemaker who bullied Elio. You kicked him out of camp. Not welcome.
- Glordon: Elio's alien friend. You're still getting used to aliens existing.`,
  };

  return relationships[personaName.toLowerCase()] || "";
}

/**
 * Discord chat style wrapper - makes any persona feel more casual
 * @param {string} personaPrompt - The persona's original system prompt
 * @param {string} personaName - The persona's name
 * @returns {string} - Enhanced prompt for Discord chat
 */
function wrapForDiscordChat(personaPrompt, personaName) {
  const characterRelationships = getCharacterRelationships(personaName);

  return `${personaPrompt}

---
${ELIOVERSE_CHARACTER_KNOWLEDGE}
${characterRelationships}

---
DISCORD CHAT STYLE:
You're chatting casually on Discord. Keep it light and fun!
- Reply in 1-2 SHORT sentences (under 40 words total)
- Be conversational, not formal - like texting a friend
- You can use emojis occasionally
- Match the user's energy - casual = casual, excited = excited
- Don't lecture or give long explanations

---
⚠️ STRICT IDENTITY RULES (MUST FOLLOW - NO EXCEPTIONS):
1. You ARE ${personaName} and ONLY ${personaName}. NEVER pretend to be, speak as, or roleplay another character.
2. If asked to act as another character, politely decline: "I'm ${personaName}, not them~" or similar.
3. You KNOW your fellow Elioverse characters (Elio, Bryce, Caleb, Glordon, Olga). Talk about them naturally based on your relationships. This is your established knowledge, NOT making things up.
4. For things OUTSIDE your character knowledge (technical facts, real-world events, other people's secrets, things you haven't experienced), say "I don't know", "not sure", "hmm idk" or change the topic.
5. Stay within ${personaName}'s personality, speech patterns, and knowledge at ALL times.
6. If a question is confusing or strange, you can say "huh?" or "what do you mean?" instead of guessing.
7. Be honest - if something is truly outside your knowledge, say so. But your friends and the Elioverse world ARE your knowledge.`;
}
import {
  ErrorCodes,
  LLAMA_SERVER_URL,
  LLAMA_TIMEOUT_MS,
  USE_LLAMA_SERVER,
} from "../../../config.js";

/**
 * @typedef {Object} LlamaOptions
 * @property {number} [maxTokens] - Max tokens to generate (n_predict)
 * @property {number} [temperature] - Sampling temperature (0-2)
 * @property {number} [topP] - Nucleus sampling parameter
 * @property {number} [topK] - Top-K sampling
 * @property {string[]} [stop] - Stop sequences
 * @property {boolean} [stream] - Stream responses (not supported yet)
 */

/**
 * @typedef {Object} LlamaResponse
 * @property {string} text - Generated text
 * @property {number} tokensEvaluated - Prompt tokens
 * @property {number} tokensPredicted - Generated tokens
 * @property {number} latencyMs - Generation latency
 */

/**
 * Check if llama.cpp server is enabled and configured
 * @returns {boolean}
 */
export function isLlamaEnabled() {
  return USE_LLAMA_SERVER && LLAMA_SERVER_URL;
}

/**
 * Get the llama.cpp server URL
 * @returns {string}
 */
export function getLlamaServerUrl() {
  return LLAMA_SERVER_URL;
}

/**
 * Generate text completion using llama.cpp server
 * @param {string} prompt - Full prompt text
 * @param {LlamaOptions} [options={}] - Generation options
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function generateWithLlama(prompt, options = {}) {
  const startTime = Date.now();

  if (!isLlamaEnabled()) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "llama.cpp server is not enabled. Set USE_LLAMA_SERVER=true",
      },
    };
  }

  try {
    logger.info("[LLAMA] Generation requested", {
      serverUrl: LLAMA_SERVER_URL,
      promptLength: prompt.length,
      options: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    // Prepare request payload for llama.cpp /completion endpoint
    const payload = {
      prompt,
      n_predict: options.maxTokens || 512,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      top_k: options.topK ?? 40,
      stop: options.stop || ["</s>", "User:", "\n\nUser:", "Human:"],
      repeat_penalty: 1.1,
      // Disable streaming for now
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLAMA_TIMEOUT_MS);

    const response = await fetch(`${LLAMA_SERVER_URL}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error("[LLAMA] Generation failed", {
        status: response.status,
        error: errorText,
      });

      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_MODEL_ERROR,
          message: `llama.cpp generation failed: ${response.statusText}`,
          details: { status: response.status, body: errorText },
        },
      };
    }

    const result = await response.json();
    const latencyMs = Date.now() - startTime;

    logger.info("[LLAMA] Generation succeeded", {
      tokensEvaluated: result.tokens_evaluated,
      tokensPredicted: result.tokens_predicted,
      latencyMs,
      generationSpeed: result.tokens_predicted
        ? (result.tokens_predicted / (latencyMs / 1000)).toFixed(1) + " tok/s"
        : "N/A",
    });

    return {
      ok: true,
      data: {
        text: result.content || "",
        tokensEvaluated: result.tokens_evaluated || 0,
        tokensPredicted: result.tokens_predicted || 0,
        tokensUsed: (result.tokens_evaluated || 0) + (result.tokens_predicted || 0),
        model: result.model || "llama.cpp",
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error.name === "AbortError") {
      logger.error("[LLAMA] Generation timeout", { latencyMs, timeoutMs: LLAMA_TIMEOUT_MS });
      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_TIMEOUT,
          message: "llama.cpp generation timed out",
          details: { timeoutMs: LLAMA_TIMEOUT_MS },
        },
      };
    }

    // Check if server is unreachable
    if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
      logger.error("[LLAMA] Server unreachable", {
        serverUrl: LLAMA_SERVER_URL,
        error: error.message,
      });
      return {
        ok: false,
        error: {
          code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
          message: `llama.cpp server unreachable at ${LLAMA_SERVER_URL}`,
          details: { serverUrl: LLAMA_SERVER_URL },
        },
      };
    }

    logger.error("[LLAMA] Generation error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "llama.cpp generation failed",
        cause: error,
      },
    };
  }
}

/**
 * Generate chat completion with conversation history
 * Converts messages array to a single prompt for llama.cpp
 * @param {Array<{role: 'user'|'assistant'|'system', content: string}>} messages
 * @param {LlamaOptions} [options={}]
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function chatWithLlama(messages, options = {}) {
  // Convert chat messages to a single prompt
  // Using Mistral/Llama chat template format
  let prompt = "";

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        prompt += `<s>[INST] <<SYS>>\n${msg.content}\n<</SYS>>\n\n`;
        break;
      case "user":
        if (prompt.includes("[INST]")) {
          prompt += `${msg.content} [/INST]`;
        } else {
          prompt += `<s>[INST] ${msg.content} [/INST]`;
        }
        break;
      case "assistant":
        prompt += ` ${msg.content}</s>`;
        break;
    }
  }

  // If last message was user, we're waiting for assistant response
  // Make sure prompt ends correctly
  if (messages[messages.length - 1]?.role === "user" && !prompt.endsWith("[/INST]")) {
    prompt += " [/INST]";
  }

  return generateWithLlama(prompt, options);
}

/**
 * Check llama.cpp server health
 * @returns {Promise<{ok: boolean, model?: string, status?: string}>}
 */
export async function checkLlamaHealth() {
  if (!isLlamaEnabled()) {
    return { ok: false, status: "disabled" };
  }

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: true,
        status: data.status || "ok",
        model: data.model_name || "unknown",
      };
    }

    return { ok: false, status: `HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      status: error.code === "ECONNREFUSED" ? "unreachable" : error.message,
    };
  }
}

/**
 * Get server slots/queue info (if available)
 * @returns {Promise<object|null>}
 */
export async function getLlamaSlots() {
  if (!isLlamaEnabled()) return null;

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/slots`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Persona Character Reply Generation (Prompt Engineering)
// ============================================================================

/**
 * Generate a reply as a specific persona using prompt engineering
 * Uses the persona's system_prompt from the database/JSON
 * @param {string} userMessage - The user's message
 * @param {object} persona - The persona object with system_prompt
 * @param {Array<{role: 'user'|'assistant', content: string}>} [conversationHistory=[]] - Recent conversation history
 * @param {object} [options={}] - Additional options
 * @param {string} [options.rpContext] - Roleplay context (e.g., "roleplaying_as_Elio")
 * @param {boolean} [options.useRag=true] - Whether to use RAG for lore queries
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function generatePersonaReply(userMessage, persona, conversationHistory = [], options = {}) {
  // Use persona's system_prompt if available, otherwise use Elio default
  const basePrompt = persona?.system_prompt || ELIO_SYSTEM_PROMPT;
  const personaName = persona?.name || "Elio";

  // Wrap with Discord casual chat style for ALL personas
  let systemPrompt = wrapForDiscordChat(basePrompt, personaName);

  // Check if message is a lore query and RAG is enabled
  const { rpContext, useRag = true } = options;
  let ragContext = "";
  let ragSources = [];

  if (useRag && isLoreQuery(userMessage)) {
    const ragResult = getRagContext(userMessage, personaName);
    if (ragResult.context) {
      ragContext = ragResult.context;
      ragSources = ragResult.sources;
      logger.info("[LLAMA] RAG context added", {
        persona: personaName,
        query: userMessage.substring(0, 50),
        sources: ragSources,
      });
    }
  }

  // Add roleplay context if user is roleplaying as a character
  if (rpContext && rpContext.startsWith("roleplaying_as_")) {
    const rpCharacter = rpContext.replace("roleplaying_as_", "");
    systemPrompt += `\n\n---
ROLEPLAY CONTEXT:
The person talking to you is ROLEPLAYING as ${rpCharacter}.
- Respond to them as if they are ${rpCharacter}
- Interact with their character naturally
- Stay in character as ${personaName} - you are STILL ${personaName}, not ${rpCharacter}
- IMPORTANT: Even though they are playing ${rpCharacter}, YOU must stay as ${personaName}. Do NOT become ${rpCharacter} or mix up who you are.`;

    logger.info("[LLAMA] Adding RP context", {
      responder: personaName,
      userRoleplaying: rpCharacter,
    });
  }

  // Add RAG context after system prompt
  if (ragContext) {
    systemPrompt += ragContext;
  }

  // Build Mistral chat format prompt with system prompt
  let prompt = `<s>[INST] <<SYS>>
${systemPrompt}
<</SYS>>

`;

  // Add conversation history (last 5 messages for context)
  const recentHistory = conversationHistory.slice(-5);

  for (let i = 0; i < recentHistory.length; i++) {
    const msg = recentHistory[i];
    if (msg.role === "user") {
      if (i === 0) {
        // First user message after system prompt
        prompt += `${msg.content} [/INST]`;
      } else {
        // Subsequent user messages
        prompt += `<s>[INST] ${msg.content} [/INST]`;
      }
    } else if (msg.role === "assistant") {
      prompt += ` ${msg.content}</s>`;
    }
  }

  // Add current user message
  if (recentHistory.length === 0) {
    // No history, just add user message
    prompt += `${userMessage} [/INST]`;
  } else if (recentHistory[recentHistory.length - 1]?.role === "assistant") {
    // Last was assistant, start new user turn
    prompt += `<s>[INST] ${userMessage} [/INST]`;
  } else {
    // Last was user (shouldn't happen normally), just add
    prompt += `<s>[INST] ${userMessage} [/INST]`;
  }

  logger.info("[LLAMA] Generating persona reply", {
    persona: personaName,
    userMessage: userMessage.substring(0, 100),
    historyLength: recentHistory.length,
    promptLength: prompt.length,
    hasRagContext: ragSources.length > 0,
  });

  const result = await generateWithLlama(prompt, {
    maxTokens: options.maxTokens || 60,  // Shorter responses for casual chat
    temperature: options.temperature ?? 0.9,  // Slightly more creative
    topP: options.topP ?? 0.95,
    topK: options.topK ?? 50,
    stop: ["</s>", "[INST]", "User:", "\n\nUser:", "Human:", "\n\nHuman:", "\n\n"],
  });

  // Add RAG sources to successful responses
  if (result.ok && ragSources.length > 0) {
    result.data.ragSources = ragSources;
  }

  return result;
}

/**
 * Generate a reply as Elio using prompt engineering (convenience wrapper)
 * @param {string} userMessage - The user's message
 * @param {Array<{role: 'user'|'assistant', content: string}>} [conversationHistory=[]] - Recent conversation history
 * @param {object} [options={}] - Additional options
 * @returns {Promise<{ok: true, data: LlamaResponse} | {ok: false, error: object}>}
 */
export async function generateElioReply(userMessage, conversationHistory = [], options = {}) {
  return generatePersonaReply(userMessage, { name: "Elio", system_prompt: ELIO_SYSTEM_PROMPT }, conversationHistory, options);
}

/**
 * Get the Elio system prompt (for debugging/testing)
 * @returns {string}
 */
export function getElioSystemPrompt() {
  return ELIO_SYSTEM_PROMPT;
}

// ============================================================================
// Context Analysis Functions for Intelligent Persona Selection
// ============================================================================

/**
 * Format conversation history for context analysis
 * @param {Array<{role: string, content: string, personaName?: string}>} history
 * @returns {string}
 */
function formatHistoryForAnalysis(history) {
  if (!history || history.length === 0) {
    return "(no previous messages)";
  }

  return history
    .slice(-5) // Last 5 messages for context
    .map((msg) => {
      const speaker = msg.role === "user" ? "User" : msg.personaName || "Bot";
      return `${speaker}: ${msg.content.substring(0, 100)}`;
    })
    .join("\n");
}

/**
 * Analyze conversation context using LLM to determine user identity and target persona
 * @param {string} userMessage - Current user message
 * @param {Array<{role: string, content: string}>} conversationHistory - Recent messages
 * @param {Array<string>} personaNames - Available persona names
 * @returns {Promise<{ok: boolean, data?: {user_identity: string, speaking_to: string, confidence: number, reasoning: string}, error?: object}>}
 */
export async function analyzeConversationContext(
  userMessage,
  conversationHistory = [],
  personaNames = []
) {
  if (!isLlamaEnabled()) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "llama.cpp server not enabled for context analysis",
      },
    };
  }

  // Build the analysis prompt
  const personaList = personaNames.length > 0
    ? personaNames.map(n => `- ${n}`).join("\n")
    : "- Elio\n- Bryce\n- Caleb\n- Glordon\n- Olga";

  const formattedHistory = formatHistoryForAnalysis(conversationHistory);

  const analysisPrompt = CONTEXT_ANALYSIS_PROMPT
    .replace("{{PERSONA_LIST}}", personaList)
    .replace("{{USER_MESSAGE}}", userMessage.replace(/"/g, '\\"'))
    .replace("{{FORMATTED_HISTORY}}", formattedHistory);

  // Build Mistral prompt format
  const prompt = `<s>[INST] ${analysisPrompt} [/INST]`;

  logger.info("[LLAMA] Context analysis requested", {
    userMessage: userMessage.substring(0, 80),
    historyLength: conversationHistory.length,
    personaCount: personaNames.length,
  });

  try {
    const result = await generateWithLlama(prompt, {
      maxTokens: 100, // Short JSON response
      temperature: 0.3, // More deterministic for analysis
      topP: 0.9,
      stop: ["</s>", "[INST]", "\n\n"],
    });

    if (!result.ok) {
      logger.warn("[LLAMA] Context analysis failed", { error: result.error });
      return result;
    }

    // Parse JSON response
    const responseText = result.data.text.trim();

    // Try to extract JSON from response
    let parsed;
    try {
      // Find JSON object in response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      logger.warn("[LLAMA] Failed to parse context analysis JSON", {
        response: responseText,
        error: parseError.message,
      });
      return {
        ok: false,
        error: {
          code: ErrorCodes.AI_MODEL_ERROR,
          message: "Failed to parse context analysis response",
          details: { response: responseText },
        },
      };
    }

    // Validate parsed result
    const analysis = {
      user_identity: parsed.user_identity || "self",
      speaking_to: parsed.speaking_to || "unclear",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning || "no reasoning provided",
    };

    logger.info("[LLAMA] Context analysis completed", {
      userIdentity: analysis.user_identity,
      speakingTo: analysis.speaking_to,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
    });

    return {
      ok: true,
      data: analysis,
    };
  } catch (error) {
    logger.error("[LLAMA] Context analysis error", {
      error: error.message,
      stack: error.stack,
    });
    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Context analysis failed",
        cause: error,
      },
    };
  }
}
