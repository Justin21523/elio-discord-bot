/**
 * Enhanced Message Create Event with Complete Auto-Reply System
 *
 * NEW TRIGGER RULES (2024-12):
 * 1. MUST @tag the bot to trigger any response
 * 2. @tag bot + persona name = respond with that persona's avatar webhook
 * 3. @tag bot without persona name = respond as Elio (default)
 * 4. Just persona name without @tag = NO response
 * 5. Reply to bot/persona message = continue conversation with that persona
 *
 * Features:
 * - Third-person pronoun filtering
 * - Conversation history tracking
 * - Multi-turn conversation support
 */

import { Events } from 'discord.js';
import { createAutoReplyManager } from '../services/autoReply.js';
import { fixThirdPersonPronouns, detectThirdPerson, removeFormatLeakage, ensureCompleteSentence } from '../utils/pronounFilter.js';
import { createFeedbackButtons } from '../handlers/feedbackHandlers.js';
import { interactionLogger } from '../services/interactionLogger.js';
import { generatePersonaReply, isLlamaEnabled, checkLlamaHealth } from '../services/ai/adapters/llamaCppAdapter.js';
import { USE_LLAMA_SERVER } from '../config.js';
import { localPersonaReply } from '../services/ai/localPersonaFallback.js';

// Cache llama.cpp server availability (check every 60 seconds)
let llamaServerAvailable = null;
let lastLlamaCheck = 0;
const LLAMA_CHECK_INTERVAL_MS = 60000; // 1 minute

async function isLlamaServerAvailable() {
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
function detectAddressee(content, personaList) {
  const contentLower = content.toLowerCase();
  const personaNames = personaList.map(p => p.name.toLowerCase());

  // Find all persona mentions with their positions
  const mentions = [];
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
  if (mentions.length === 1) return { persona: mentions[0].name, reason: 'single_mention' };

  // Multiple mentions - determine addressee using linguistic patterns

  // Pattern 1: Vocative at start with comma ("Hey Bryce,", "Bryce,", "Yo Caleb,")
  const startVocativeMatch = contentLower.match(/^(?:hey|hi|yo|oh|dear|excuse me)?\s*(\w+)\s*,/i);
  if (startVocativeMatch) {
    const potentialName = startVocativeMatch[1].toLowerCase();
    for (const p of personaList) {
      if (p.name.toLowerCase() === potentialName) {
        return { persona: p.name, reason: 'vocative_start' };
      }
    }
  }

  // Pattern 2: Vocative at end with comma (", Caleb" at end of sentence)
  const endVocativeMatch = contentLower.match(/,\s*(\w+)\s*[.!?]?\s*$/i);
  if (endVocativeMatch) {
    const potentialName = endVocativeMatch[1].toLowerCase();
    for (const p of personaList) {
      if (p.name.toLowerCase() === potentialName) {
        return { persona: p.name, reason: 'vocative_end' };
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
  const potentialAddressees = mentions.filter(m => !m.isObject);

  if (potentialAddressees.length === 1) {
    return { persona: potentialAddressees[0].name, reason: 'filtered_object' };
  }

  // Default: use the first mentioned persona that isn't an object
  if (potentialAddressees.length > 0) {
    return { persona: potentialAddressees[0].name, reason: 'first_non_object' };
  }

  // Ultimate fallback: first mentioned overall
  return { persona: mentions[0].name, reason: 'first_mentioned' };
}

let autoReplyManager = null;

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message, services) {
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
    } catch (error) {
      console.error('[ERR] Failed to show help:', error.message);
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
  let repliedToPersona = null;
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

  // NEW RULE: Must have @mention OR be replying to bot to trigger response
  if (!isMentioned && !isReplyToBot) {
    // No @tag and not a reply = no response (even if persona name is mentioned)
    return;
  }

  try {
    // Determine which persona to use
    let selectedPersona = null;
    let reason = '';

    if (isReplyToBot && repliedToPersona) {
      // Replying to a specific persona - continue with that persona
      selectedPersona = repliedToPersona;
      reason = 'reply_to_persona';
      console.log(`[INT] Continuing conversation with ${repliedToPersona}`);
    } else if (isMentioned) {
      // @mentioned - check for persona name in message
      const contentWithoutMention = message.content
        .replace(/<@!?\d+>/g, '') // Remove @mentions
        .trim();

      // Get all personas and use smart addressee detection
      const personaList = await services.personas.listPersonas();
      if (personaList.ok) {
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
    if (!personaResult.ok) {
      console.error(`[ERR] Persona not found: ${selectedPersona}`);
      // Fallback to Elio if persona not found
      const fallbackResult = await services.personas.getPersona('Elio');
      if (!fallbackResult.ok) {
        await message.reply("*confused* Sorry, I'm having trouble connecting right now...");
        return;
      }
      var persona = fallbackResult.data;
    } else {
      var persona = personaResult.data;
    }

    // Get conversation history for this USER+persona in channel (per-user isolation)
    const history = services.conversationHistory?.getContext(
      message.channelId,
      message.author.id,
      persona.name,
      10
    ) || [];

    // Build context with RAG if available
    let context = '';
    try {
      const ragResult = await services.ai.rag.search({ query: message.content, topK: 3, generateAnswer: false });
      if (ragResult.ok && ragResult.data.hits && ragResult.data.hits.length > 0) {
        context = ragResult.data.hits
          .map(r => r.text || r.content)
          .filter(Boolean)
          .join('\n\n');
      }
    } catch (error) {
      console.error('[ERR] RAG search failed:', error.message);
    }

    // Generate response with persona using ML/statistical models
    const conversationContext = history.slice(-10).map(h => ({
      role: h.role,
      content: h.content
    }));

    let result;
    let strategyUsedOverride = null;

    // Check if llama.cpp server is actually available (cached, 60s TTL)
    const llamaAvailable = await isLlamaServerAvailable();

    // Use llama.cpp only if it's actually reachable
    if (llamaAvailable) {
      console.log(`[INT] Using llama.cpp for ${persona.name} (may take 20-30s)`);

      // Use llama.cpp with persona's system_prompt
      const llamaResult = await generatePersonaReply(
        message.content,
        persona, // Pass full persona object with system_prompt
        conversationContext
      );

      if (llamaResult.ok) {
        result = {
          ok: true,
          data: {
            text: llamaResult.data.text,
            strategy: 'llama.cpp',
            tokensUsed: llamaResult.data.tokensUsed,
            latencyMs: llamaResult.data.latencyMs,
          }
        };
        strategyUsedOverride = 'llama.cpp';
        console.log(`[INT] llama.cpp replied in ${llamaResult.data.latencyMs}ms`);
      } else {
        console.warn('[WARN] llama.cpp failed, falling back to personaLogic:', llamaResult.error?.message);
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
      } catch (personaLogicErr) {
        console.warn('[WARN] personaLogic threw error:', personaLogicErr.message);
        result = { ok: false, error: { message: personaLogicErr.message } };
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

    // Log interaction immediately to get ID for feedback buttons
    let interactionId = null;
    try {
      const logResult = await interactionLogger.logImmediate({
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        username: message.author.username,
        persona: persona.name,
        userMessage: message.content,
        botResponse: responseText,
        responseSource: 'hybrid',
        similarity: result.data?.confidence || null,
        strategy: strategyUsed,
      });
      if (logResult.ok && logResult.data?.id) {
        interactionId = logResult.data.id;
      }
    } catch (logError) {
      console.log('[WARN] Failed to log interaction:', logError.message);
    }

    // Create feedback buttons if we have an interaction ID
    const feedbackRow = interactionId ? createFeedbackButtons(interactionId) : null;

    // Send response via webhook to show persona's avatar and name
    try {
      const messageOptions = {
        content: `<@${message.author.id}> ${responseText}`,
      };
      if (feedbackRow) {
        messageOptions.components = [feedbackRow];
      }

      await services.webhooks.personaSay(
        message.channelId,
        {
          name: persona.name,
          avatar: persona.avatar
        },
        messageOptions
      );
    } catch (webhookError) {
      console.log(`[WARN] Webhook failed, using reply fallback:`, webhookError.message);
      const replyOptions = { content: responseText };
      if (feedbackRow) {
        replyOptions.components = [feedbackRow];
      }
      await message.reply(replyOptions);
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

    console.log(`[INT] Auto-replied as ${persona.name} (${responseText.length} chars, strategy: ${strategyUsed})${hadThirdPerson ? ' [filtered]' : ''}`);

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
