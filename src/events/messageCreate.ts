/**
 * Enhanced Message Create Event with Complete Auto-Reply System
 *
 * TRIGGER RULES (2024-12):
 * 1. @tag the bot = respond
 * 2. @tag bot + persona name = respond with that persona's avatar webhook
 * 3. @tag bot without persona name = respond as Elio (default)
 * 4. Reply to bot/persona message = continue conversation with that persona
 * 5. "PersonaName: message" format = user is RPing as that persona, bot responds
 *    - Example: "Caleb: hey what's up" → user is RPing as Caleb, bot responds
 *    - Just "Caleb hey" without colon = NO response (unless @tagged)
 *
 * Features:
 * - Third-person pronoun filtering
 * - Conversation history tracking
 * - Multi-turn conversation support
 */

import { Events } from 'discord.js';
import { createAutoReplyManager } from '../services/autoReply.js';
import { fixThirdPersonPronouns, detectThirdPerson, removeFormatLeakage, ensureCompleteSentence } from '../utils/pronounFilter.js';
import { interactionLogger } from '../services/interactionLogger.js';
import { generatePersonaReply, isLlamaEnabled, checkLlamaHealth, analyzeConversationContext } from '../services/ai/adapters/llamaCppAdapter.js';
import { USE_LLAMA_SERVER } from '../config.js';
import { localPersonaReply } from '../services/ai/localPersonaFallback.js';

type PersonaRef = { name: string };
type Mention = { name: string; position: number; context: string; isObject?: boolean };
type RpPrefixResult =
  | { isRp: false }
  | { isRp: true; rpAsPersona: string; messageContent: string };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

// Cache llama.cpp server availability (check every 60 seconds)
let llamaServerAvailable: boolean | null = null;
let lastLlamaCheck = 0;
const LLAMA_CHECK_INTERVAL_MS = 60000; // 1 minute

async function isLlamaServerAvailable(): Promise<boolean> {
  const now = Date.now();
  // Use cached result if checked recently
  if (llamaServerAvailable !== null && (now - lastLlamaCheck) < LLAMA_CHECK_INTERVAL_MS) {
    return llamaServerAvailable;
  }

  // Check llama.cpp server health
  if (USE_LLAMA_SERVER && isLlamaEnabled()) {
    const health = await checkLlamaHealth();
    llamaServerAvailable = health.ok;
    lastLlamaCheck = now;
    if (!health.ok) {
      console.log(`[INT] llama.cpp server unavailable: ${health.status}`);
    }
    return llamaServerAvailable;
  }

  return false;
}

/**
 * Detect the addressee (who the user is talking to) when multiple personas are mentioned.
 * Uses linguistic patterns to identify the intended recipient.
 *
 * Examples:
 * - "Hey Bryce, how do you think of Caleb?" → Bryce (vocative at start)
 * - "I'm so tired now, Caleb" → Caleb (vocative at end with comma)
 * - "Caleb, what do you think?" → Caleb (vocative at start with comma)
 * - "What does Bryce think about Caleb?" → neither addressed directly (use first mentioned as subject)
 *
 * @param {string} content - Message content (without @mentions)
 * @param {Array<{name: string}>} personaList - List of personas to check
 * @returns {{persona: string|null, reason: string}}
 */
function detectAddressee(content: string, personaList: PersonaRef[]): { persona: string | null; reason: string } {
  const contentLower = content.toLowerCase();
  const personaNames = personaList.map((p) => p.name.toLowerCase());

  // Find all persona mentions with their positions
  const mentions: Mention[] = [];
  for (const p of personaList) {
    const nameLower = p.name.toLowerCase();
    const regex = new RegExp(`\\b${nameLower}\\b`, 'gi');
    let match;
    while ((match = regex.exec(contentLower)) !== null) {
      mentions.push({
        name: p.name,
        position: match.index,
        context: content.substring(Math.max(0, match.index - 10), match.index + p.name.length + 10),
      });
    }
  }

  if (mentions.length === 0) return { persona: null, reason: 'no_mention' };
  if (mentions.length === 1) return { persona: mentions[0]!.name, reason: 'single_mention' };

  // Multiple mentions - determine addressee using linguistic patterns

  // Pattern 1: Vocative at start with comma ("Hey Bryce,", "Bryce,", "Yo Caleb,")
  const startVocativeMatch = contentLower.match(/^(?:hey|hi|yo|oh|dear|excuse me)?\s*(\w+)\s*,/i);
  if (startVocativeMatch) {
    const potentialNameRaw = startVocativeMatch[1];
    if (potentialNameRaw) {
      const potentialName = potentialNameRaw.toLowerCase();
      for (const p of personaList) {
        if (p.name.toLowerCase() === potentialName) {
          return { persona: p.name, reason: 'vocative_start' };
        }
      }
    }
  }

  // Pattern 2: Vocative at end with comma (", Caleb" at end of sentence)
  const endVocativeMatch = contentLower.match(/,\s*(\w+)\s*[.!?]?\s*$/i);
  if (endVocativeMatch) {
    const potentialNameRaw = endVocativeMatch[1];
    if (potentialNameRaw) {
      const potentialName = potentialNameRaw.toLowerCase();
      for (const p of personaList) {
        if (p.name.toLowerCase() === potentialName) {
          return { persona: p.name, reason: 'vocative_end' };
        }
      }
    }
  }

  // Pattern 3: Direct address patterns ("tell me [Name]", "you think [Name]?")
  // These suggest [Name] is the topic, not addressee

  // Pattern 4: "about [Name]", "of [Name]", "think of [Name]" - these are objects, not addressees
  for (const mention of mentions) {
    const beforeText = content.substring(0, mention.position).toLowerCase();
    // Check if persona is an object of preposition
    if (/(?:about|of|with|from|to|for|against)\s*$/.test(beforeText.trim())) {
      mention.isObject = true;
    }
  }

  // Filter out object mentions
  const potentialAddressees = mentions.filter((m) => !m.isObject);

  if (potentialAddressees.length === 1) {
    return { persona: potentialAddressees[0]!.name, reason: 'filtered_object' };
  }

  // Default: use the first mentioned persona that isn't an object
  if (potentialAddressees.length > 0) {
    return { persona: potentialAddressees[0]!.name, reason: 'first_non_object' };
  }

  // Ultimate fallback: first mentioned overall
  return { persona: mentions[0]!.name, reason: 'first_mentioned' };
}

/**
 * Detect if user is RPing as a persona using "PersonaName:" prefix format.
 * This triggers a response even without @mentioning the bot.
 *
 * Examples:
 * - "Caleb: hey what's up" → { isRp: true, rpAsPersona: 'Caleb', messageContent: 'hey what\'s up' }
 * - "caleb: *waves*" → { isRp: true, rpAsPersona: 'Caleb', messageContent: '*waves*' }
 * - "Caleb hey" → { isRp: false } (no colon = not RP format)
 *
 * @param {string} content - Message content
 * @param {Array<{name: string}>} personaList - Available personas
 * @returns {{ isRp: boolean, rpAsPersona?: string, messageContent?: string }}
 */
function detectRpPrefix(
  content: string,
  personaList: PersonaRef[]
): RpPrefixResult {
  // Match pattern: PersonaName: (case insensitive, with optional whitespace)
  // Must be at the start of the message
  const rpPrefixMatch = content.match(/^(\w+)\s*:\s*(.+)/s);

  console.log(`[RP-DEBUG] Checking RP prefix for: "${content.substring(0, 50)}..."`);
  console.log(`[RP-DEBUG] Regex match result:`, rpPrefixMatch ? `name="${rpPrefixMatch[1] ?? ''}"` : 'no match');

  if (!rpPrefixMatch) return { isRp: false };

  const potentialNameRaw = rpPrefixMatch[1];
  const messageContentRaw = rpPrefixMatch[2];
  if (!potentialNameRaw || !messageContentRaw) return { isRp: false };

  const potentialName = potentialNameRaw.toLowerCase();
  const messageContent = messageContentRaw.trim();

  console.log(`[RP-DEBUG] Looking for persona "${potentialName}" in list:`, personaList.map((p) => p.name));

  // Check if the prefix matches a known persona
  for (const p of personaList) {
    if (p.name.toLowerCase() === potentialName) {
      console.log(`[RP-DEBUG] MATCH FOUND: ${p.name}`);
      return {
        isRp: true,
        rpAsPersona: p.name,
        messageContent: messageContent
      };
    }
  }

  // Prefix doesn't match any persona
  console.log(`[RP-DEBUG] No matching persona found`);
  return { isRp: false };
}

let autoReplyManager: any = null;

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message: any, services: any) {
  // Initialize auto-reply manager on first run
  if (!autoReplyManager) {
    autoReplyManager = createAutoReplyManager(services);
    console.log('[INT] Auto-reply manager initialized');
  }

  // Skip if bot message
  if (message.author.bot) return;

  // Handle !help command in channels
  if (message.content.toLowerCase().trim() === '!help') {
    console.log('[INT] !help command detected');
    try {
      const { showDMHelp } = await import('../handlers/dmHandlers.js');
      await showDMHelp(message);
    } catch (error: unknown) {
      console.error('[ERR] Failed to show help:', getErrorMessage(error));
    }
    return;
  }

  const botId = message.client.user.id;

  // Check for @bot mention
  const isMentioned = message.mentions.has(botId) ||
                     message.mentions.users?.has(botId) ||
                     message.content.includes(`<@${botId}>`) ||
                     message.content.includes(`<@!${botId}>`);

  // Check for reply to bot/persona
  let isReplyToBot = false;
  let repliedToPersona: string | null = null;
  if (message.reference) {
    try {
      const repliedTo = await message.channel.messages.fetch(message.reference.messageId);

      // Check if reply is to bot OR to bot's webhook (persona messages)
      const isDirectBotMessage = repliedTo && repliedTo.author.id === botId;
      const isBotWebhook = repliedTo && repliedTo.webhookId && repliedTo.applicationId === botId;

      isReplyToBot = isDirectBotMessage || isBotWebhook;

      // Detect which persona sent the replied message (via webhook)
      if (isReplyToBot && repliedTo.webhookId) {
        repliedToPersona = repliedTo.author.username;
        console.log(`[INT] Reply detected to persona: ${repliedToPersona}`);
      }
    } catch (error) {
      // Ignore fetch errors
    }
  }

  // Check for RP prefix format: "PersonaName: message"
  // This triggers response even without @mention
  let isRpPrefix = false;
  let rpPrefixData: RpPrefixResult | null = null;

  // ALWAYS check for RP prefix, regardless of other triggers
  console.log(`[RP-CHECK] Message from ${message.author.username}: "${message.content.substring(0, 80)}"`);
  console.log(`[RP-CHECK] isMentioned=${isMentioned}, isReplyToBot=${isReplyToBot}`);

  // Check RP prefix for ALL messages (not just non-mentioned ones)
  const personaListForRp = await services.personas.listPersonas();
  if (personaListForRp.ok) {
    rpPrefixData = detectRpPrefix(message.content, personaListForRp.data);
    isRpPrefix = rpPrefixData.isRp;
    console.log(`[RP-CHECK] isRpPrefix=${isRpPrefix}`);
    if (rpPrefixData.isRp) {
      console.log(`[INT] RP prefix detected: user is RPing as ${rpPrefixData.rpAsPersona}`);
    }
  } else {
    console.log(`[RP-CHECK] Failed to get persona list:`, personaListForRp.error);
  }

  // TRIGGER RULE: Must have @mention OR reply to bot OR RP prefix format
  if (!isMentioned && !isReplyToBot && !isRpPrefix) {
    // No valid trigger = no response
    return;
  }

  try {
    // Determine which persona to use
    let selectedPersona = null;
    let reason = '';
    let rpContext: string | undefined; // Track if user is roleplaying as a character

    if (isReplyToBot && repliedToPersona) {
      // Replying to a specific persona - continue with that persona
      selectedPersona = repliedToPersona;
      reason = 'reply_to_persona';
      console.log(`[INT] Continuing conversation with ${repliedToPersona}`);
    } else if (rpPrefixData?.isRp) {
      // User is RPing as a persona using "PersonaName:" prefix
      // Select a DIFFERENT persona to respond (not the one they're RPing as)
      rpContext = `roleplaying_as_${rpPrefixData.rpAsPersona}`;

      // Get personas to find a suitable responder
      const personaList = await services.personas.listPersonas();
      if (personaList.ok) {
        const personaData = personaList.data as any[];
        // Find another persona to respond - prefer based on character relationships
        const rpPersonaLower = rpPrefixData.rpAsPersona.toLowerCase();

        // Character relationship logic for better RP responses
        const relationships: Record<string, string[]> = {
          'elio': ['Bryce', 'Glordon', 'Olga'], // Elio's friends/family
          'bryce': ['Elio', 'Caleb'],           // Bryce talks to Elio, used to be friends with Caleb
          'caleb': ['Bryce', 'Elio'],           // Caleb bullies Elio, former friend of Bryce
          'glordon': ['Elio', 'Ambassador Questa'], // Glordon's connections
          'olga': ['Elio', 'Glordon'],          // Olga is Elio's aunt
        };

        // Try to find a related character, otherwise pick any different one
        const relatedPersonas = relationships[rpPersonaLower] || [];
        let responder = null;

        // First try related personas
        for (const relatedName of relatedPersonas) {
          const found = personaData.find((p) => p.name.toLowerCase() === relatedName.toLowerCase());
          if (found) {
            responder = found.name;
            break;
          }
        }

        // Fallback: pick any persona that isn't the one being RPed
        if (!responder) {
          const otherPersona = personaData.find((p) => p.name.toLowerCase() !== rpPersonaLower);
          if (otherPersona) {
            responder = otherPersona.name;
          }
        }

        if (responder) {
          selectedPersona = responder;
          reason = 'rp_prefix';
          console.log(`[INT] RP prefix: user as ${rpPrefixData.rpAsPersona}, responding as ${responder}`);
        }
      }
    } else if (isMentioned) {
      // @mentioned - check for persona name in message
      const contentWithoutMention = message.content
        .replace(/<@!?\d+>/g, '') // Remove @mentions
        .trim();

      // Get all personas and use smart addressee detection
      const personaList = await services.personas.listPersonas();
      if (personaList.ok) {
        const personaData = personaList.data as any[];
        // Use addressee detection to find who the user is talking to
        const { persona: detectedPersona, reason: detectionReason } = detectAddressee(
          contentWithoutMention,
          personaList.data
        );

        if (detectedPersona) {
          selectedPersona = detectedPersona;
          reason = `addressee_${detectionReason}`;
          console.log(`[INT] @mention + addressee detected: ${detectedPersona} (reason: ${detectionReason})`);
        }

        // LLM-based context analysis for complex scenarios (multiple personas mentioned or potential RP)
        const llamaAvailableForAnalysis = await isLlamaServerAvailable();
        const hasMultipleMentions = personaData.filter((p) =>
          contentWithoutMention.toLowerCase().includes(String(p.name).toLowerCase())
        ).length > 1;
        const hasRoleplayIndicators = /^\*[A-Za-z]/.test(contentWithoutMention.trim());

        if (llamaAvailableForAnalysis && (hasMultipleMentions || hasRoleplayIndicators)) {
          console.log('[INT] Running LLM context analysis...');

          // Get conversation history for context
          const existingHistory = services.conversationHistory?.getContext(
            message.channelId,
            message.author.id,
            selectedPersona || 'Elio',
            5
          ) || [];

          const contextAnalysis = await analyzeConversationContext(
            contentWithoutMention,
            existingHistory,
            personaData.map((p) => p.name)
          );

          if (contextAnalysis.ok && contextAnalysis.data && contextAnalysis.data.confidence >= 0.6) {
            const analysis = contextAnalysis.data;

            // Update persona selection based on LLM analysis
            if (analysis.speaking_to && analysis.speaking_to !== 'unclear') {
              // Verify the persona exists
              const targetPersona = personaData.find(
                (p) => p.name.toLowerCase() === analysis.speaking_to.toLowerCase()
              );
              if (targetPersona) {
                selectedPersona = targetPersona.name;
                reason = `context_analysis_${analysis.user_identity}`;
                console.log(`[INT] LLM analysis: speaking_to=${analysis.speaking_to}, user_identity=${analysis.user_identity}, confidence=${analysis.confidence}`);
              }
            }

            // Capture RP context if user is roleplaying
            if (analysis.user_identity && analysis.user_identity.startsWith('roleplaying_as_')) {
              const rp = String(analysis.user_identity);
              rpContext = rp;
              console.log(`[INT] User is roleplaying as: ${rp.replace('roleplaying_as_', '')}`);
            }
          } else if (contextAnalysis.ok) {
            console.log(`[INT] LLM analysis confidence too low: ${contextAnalysis.data?.confidence || 0}`);
          } else {
            console.log(`[INT] LLM analysis failed, using regex-based detection`);
          }
        }
      }

      // If no persona name found, default to Elio
      if (!selectedPersona) {
        selectedPersona = 'Elio';
        reason = 'bot_mention_default';
        console.log('[INT] @mention without persona name - using Elio');
      }
    }

    if (!selectedPersona) {
      console.log('[INT] No valid trigger - not replying');
      return;
    }

    console.log(`[INT] Auto-reply triggered: ${reason}, persona: ${selectedPersona}`);

    // Show typing indicator
    await message.channel.sendTyping();

    // Get persona
    const personaResult = await services.personas.getPersona(selectedPersona);
    let persona: any;
    if (!personaResult.ok) {
      console.error(`[ERR] Persona not found: ${selectedPersona}`);
      // Fallback to Elio if persona not found
      const fallbackResult = await services.personas.getPersona('Elio');
      if (!fallbackResult.ok) {
        await message.reply("*confused* Sorry, I'm having trouble connecting right now...");
        return;
      }
      persona = fallbackResult.data;
    } else {
      persona = personaResult.data;
    }

    // Get conversation history for this USER+persona in channel (per-user isolation)
    const history = (services.conversationHistory?.getContext(
      message.channelId,
      message.author.id,
      persona.name,
      10
    ) || []) as any[];

    // Build context with RAG if available
    let context = '';
    try {
      const ragResult = await services.ai.rag.search({ query: message.content, topK: 3, generateAnswer: false });
      if (ragResult.ok && ragResult.data.hits && ragResult.data.hits.length > 0) {
        const hits = ragResult.data.hits as any[];
        context = hits.map((r) => r.text || r.content).filter(Boolean).join('\n\n');
      }
    } catch (error: unknown) {
      console.error('[ERR] RAG search failed:', getErrorMessage(error));
    }

    // Generate response with persona using ML/statistical models
    const conversationContext = history.slice(-10).map((h) => ({
      role: h.role,
      content: h.content
    }));

    let result: any;
    let strategyUsedOverride: string | null = null;

    // Check if llama.cpp server is actually available (cached, 60s TTL)
    const llamaAvailable = await isLlamaServerAvailable();

    // Use llama.cpp only if it's actually reachable
    if (llamaAvailable) {
      console.log(`[INT] Using llama.cpp for ${persona.name} (may take 20-30s)`);

      // Use llama.cpp with persona's system_prompt
      const llamaResult = await generatePersonaReply(
        message.content,
        persona, // Pass full persona object with system_prompt
        conversationContext,
        rpContext ? { rpContext } : {} // Pass RP context for roleplay scenarios
      );

      if (llamaResult.ok) {
        result = {
          ok: true,
          data: {
            text: llamaResult.data.text,
            strategy: 'llama.cpp',
            tokensPredicted: llamaResult.data.tokensPredicted,
            latencyMs: llamaResult.data.latencyMs,
          }
        };
        strategyUsedOverride = 'llama.cpp';
        console.log(`[INT] llama.cpp replied in ${llamaResult.data.latencyMs}ms`);
      } else {
        console.warn('[WARN] llama.cpp failed, falling back to personaLogic:', getErrorMessage(llamaResult.error));
        // Invalidate cache so next request re-checks
        llamaServerAvailable = null;
        // Fallback directly to personaLogic (uses training corpus retrieval)
        result = await services.ai.personaLogic.reply({
          persona: persona.name,
          message: message.content,
          history: conversationContext,
          topK: 5,
          maxLen: 80
        });
        strategyUsedOverride = 'personaLogic_fallback';
      }
    } else {
      // llama.cpp not available - try personaLogic first, then local fallback
      console.log(`[INT] llama.cpp unavailable, trying personaLogic for ${persona.name}`);

      try {
        result = await services.ai.personaLogic.reply({
          persona: persona.name,
          message: message.content,
          history: conversationContext,
          topK: 5,
          maxLen: 80
        });
      } catch (personaLogicErr: unknown) {
        const msg = getErrorMessage(personaLogicErr);
        console.warn('[WARN] personaLogic threw error:', msg);
        result = { ok: false, error: { message: msg } };
      }

      // If personaLogic fails, use LOCAL fallback (no external service needed)
      if (!result.ok) {
        console.warn('[WARN] personaLogic failed, using local training data fallback');
        result = await localPersonaReply(persona.name, message.content, { topK: 5 });
        strategyUsedOverride = 'local_fallback';
      }
    }

    if (!result.ok) {
      console.error(`[ERR] All AI strategies failed: ${result.error?.message || 'unknown error'}`);
      await message.reply("*pauses* Sorry, I'm having trouble thinking right now. Can you try again?");
      return;
    }

    // Get response and apply filters
    let responseText = result.data.text || result.data.response || result.data.content;

    // CRITICAL 1: Remove format leakage (User:, Assistant:, Me:, etc.) INCLUDING persona's own name
    responseText = removeFormatLeakage(responseText, persona.name);

    // CRITICAL 2: Filter third-person pronouns
    const hadThirdPerson = detectThirdPerson(responseText, persona.name);
    if (hadThirdPerson) {
      console.log(`[WARN] Third-person detected in ${persona.name} response, applying filter...`);
    }
    responseText = fixThirdPersonPronouns(responseText, persona.name);

    // CRITICAL 3: Ensure complete sentence ending (no truncation mid-sentence)
    responseText = ensureCompleteSentence(responseText);

    // Ensure response doesn't exceed Discord's limit
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + '...';
    }

    // Get the strategy used for feedback tracking
    const strategyUsed = strategyUsedOverride || result.data?.strategy || result.data?.metadata?.strategy || 'unknown';
    const responseSource = String(strategyUsed).startsWith('llama')
      ? 'llm'
      : String(strategyUsed).includes('local')
        ? 'fallback'
        : 'personaLogic';

    // Log interaction immediately to get ID for feedback buttons
    let interactionId = null;
    try {
      const logResult: any = await interactionLogger.logImmediate({
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        username: message.author.username,
        persona: persona.name,
        userMessage: message.content,
        botResponse: responseText,
        responseSource,
        similarity: result.data?.confidence || null,
        strategy: strategyUsed,
      });
      if (logResult.ok && logResult.data?.id) {
        interactionId = logResult.data.id;
      }
    } catch (logError: unknown) {
      console.log('[WARN] Failed to log interaction:', getErrorMessage(logError));
    }

    // Send response via webhook to show persona's avatar and name
    try {
      await services.webhooks.personaSay(
        message.channelId,
        {
          name: persona.name,
          avatar: persona.avatar
        },
        {
          content: `<@${message.author.id}> ${responseText}`,
        }
      );
    } catch (webhookError: unknown) {
      console.log(`[WARN] Webhook failed, using reply fallback:`, getErrorMessage(webhookError));
      await message.reply({ content: responseText });
    }

    // Record conversation (CRITICAL: per-user isolation)
    if (services.conversationHistory) {
      services.conversationHistory.addMessage(
        message.channelId,
        message.author.id,
        persona.name,
        'user',
        message.content
      );
      services.conversationHistory.addMessage(
        message.channelId,
        message.author.id,
        persona.name,
        'assistant',
        responseText
      );
    }

    // Track bot reply for multi-turn conversation
    autoReplyManager.recordBotReply(message.channelId, message.author.id, persona.name);

    console.log(`[INT] Auto-replied as ${persona.name} (${responseText.length} chars, strategy: ${strategyUsed})${hadThirdPerson ? ' [filtered]' : ''}${rpContext ? ` [RP: ${rpContext.replace('roleplaying_as_', '')}]` : ''}`);

  } catch (error) {
    console.error('[ERR] messageCreate auto-reply error:', error);

    // Try to send error message to user
    try {
      await message.reply("*looks confused* Sorry, something went wrong. Can you try again?");
    } catch (replyError) {
      console.error('[ERR] Failed to send error reply:', replyError);
    }
  }
}
