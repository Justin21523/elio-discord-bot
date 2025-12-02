/**
 * Enhanced Message Create Event with Complete Auto-Reply System
 *
 * Features:
 * - Guaranteed reply on @mention or reply to bot
 * - Smart persona selection for multi-keyword messages
 * - Third-person pronoun filtering
 * - Conversation history tracking
 * - Multi-turn conversation support
 */

import { Events } from 'discord.js';
import { createAutoReplyManager } from '../services/autoReply.js';
import { fixThirdPersonPronouns, detectThirdPerson, removeFormatLeakage, ensureCompleteSentence } from '../utils/pronounFilter.js';

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

  // CRITICAL: Always respond to mentions and replies
  const botId = message.client.user.id;
  const isMentioned = message.mentions.has(botId) ||
                     message.mentions.users?.has(botId) ||
                     message.content.includes(`<@${botId}>`) ||
                     message.content.includes(`<@!${botId}>`);

  let isReplyToBot = false;
  let repliedToPersona = null;
  if (message.reference) {
    try {
      const repliedTo = await message.channel.messages.fetch(message.reference.messageId);

      // CRITICAL: Check if reply is to bot OR to bot's webhook (persona messages)
      const isDirectBotMessage = repliedTo && repliedTo.author.id === botId;
      const isBotWebhook = repliedTo && repliedTo.webhookId && repliedTo.applicationId === botId;

      isReplyToBot = isDirectBotMessage || isBotWebhook;

      // CRITICAL: Detect which persona sent the replied message (via webhook)
      if (isReplyToBot && repliedTo.webhookId) {
        // Message sent via webhook - extract persona name from webhook username
        repliedToPersona = repliedTo.author.username;
        console.log(`[INT] Reply detected to persona: ${repliedToPersona}`);
      }
    } catch (error) {
      // Ignore fetch errors
    }
  }

  // Force reply if mentioned or replied to
  const forceReply = isMentioned || isReplyToBot;

  try {
    // Check if should reply
    const decision = await autoReplyManager.shouldReplyToMessage(message);

    // Override decision if force reply
    if (forceReply && !decision.shouldReply) {
      console.log(`[INT] Force reply override - mentioned: ${isMentioned}, replied: ${isReplyToBot}`);
      decision.shouldReply = true;
      decision.reason = isMentioned ? 'bot_tagged_override' : 'reply_override';
      // CRITICAL: If replying to a specific persona, use THAT persona
      // If @mentioned, force reselect based on content (ignore active conversation)
      const forceReselect = isMentioned;
      decision.persona = repliedToPersona || await autoReplyManager.selectPersonaForMessage(message, message.content.toLowerCase(), forceReselect);
    }

    // CRITICAL: If user replied to a specific persona, override with that persona
    if (isReplyToBot && repliedToPersona && decision.shouldReply) {
      console.log(`[INT] Overriding persona to ${repliedToPersona} (user replied to this persona's message)`);
      decision.persona = repliedToPersona;
    }

    if (!decision.shouldReply) {
      // Log skipped messages with low relevance for debugging
      if (decision.relevance !== undefined && decision.relevance > 0) {
        console.log(`[INT] Skipped message (relevance: ${decision.relevance.toFixed(3)}): ${message.content.substring(0, 50)}...`);
      }
      return;
    }

    console.log(`[INT] Auto-reply triggered: ${decision.reason}, persona: ${decision.persona}, relevance: ${decision.relevance?.toFixed(3) || 'N/A'}`);

    // Show typing indicator
    await message.channel.sendTyping();

    // Get persona
    const personaResult = await services.personas.getPersona(decision.persona);
    if (!personaResult.ok) {
      console.error(`[ERR] Persona not found: ${decision.persona}`);
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

    // Use hybrid ensemble system (Markov + TF-IDF + HMM + Thompson Sampling + more)
    let result = await services.ai.hybrid.reply({
      persona: persona.name,
      message: message.content,
      history: conversationContext,
      userId: message.author.id,
      channelId: message.channelId,
      topK: 5,
      maxLen: 80
    });

    // Fallback: if hybrid fails, use basic persona logic
    if (!result.ok) {
      console.warn('[WARN] Hybrid reply failed, falling back to personaLogic');
      result = await services.ai.personaLogic.reply({
        persona: persona.name,
        message: message.content,
        history: conversationContext,
        topK: 5,
        maxLen: 80
      });
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

    // Send response via webhook to show persona's avatar and name
    try {
      await services.webhooks.personaSay(
        message.channelId,
        {
          name: persona.name,
          avatar: persona.avatar
        },
        {
          content: `<@${message.author.id}> ${responseText}`
        }
      );
    } catch (webhookError) {
      console.log(`[WARN] Webhook failed, using reply fallback:`, webhookError.message);
      await message.reply(responseText);
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

    console.log(`[INT] Auto-replied as ${persona.name} (${responseText.length} chars)${hadThirdPerson ? ' [filtered]' : ''}`);

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
