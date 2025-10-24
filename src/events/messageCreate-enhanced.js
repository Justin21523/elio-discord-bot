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
import { fixThirdPersonPronouns, detectThirdPerson } from '../utils/pronounFilter.js';

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
  const botId = services.client.user.id;
  const isMentioned = message.mentions.has(botId) ||
                     message.mentions.users?.has(botId) ||
                     message.content.includes(`<@${botId}>`) ||
                     message.content.includes(`<@!${botId}>`);

  let isReplyToBot = false;
  if (message.reference) {
    try {
      const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
      isReplyToBot = repliedTo && repliedTo.author.id === botId;
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
      decision.persona = await autoReplyManager.selectPersonaForMessage(message, message.content.toLowerCase());
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
    const persona = await services.personas.get(decision.persona);
    if (!persona) {
      console.error(`[ERR] Persona not found: ${decision.persona}`);
      // Fallback to Elio if persona not found
      const fallback = await services.personas.get('Elio');
      if (!fallback) {
        await message.reply("*confused* Sorry, I'm having trouble connecting right now...");
        return;
      }
      persona = fallback;
    }

    // Get conversation history for this persona and user
    const history = await services.conversationHistory?.get(
      message.channelId,
      message.author.id,
      persona.name
    ) || [];

    // Build context with RAG if available
    let context = '';
    try {
      const ragResult = await services.ai.rag.query(message.content, { topK: 3 });
      if (ragResult.ok && ragResult.data.results && ragResult.data.results.length > 0) {
        context = ragResult.data.results
          .map(r => r.text || r.content)
          .filter(Boolean)
          .join('\n\n');
      }
    } catch (error) {
      console.error('[ERR] RAG query failed:', error.message);
    }

    // Generate response with persona
    const conversationContext = history.slice(-10).map(h => ({
      role: h.role,
      content: h.content
    }));

    const result = await services.ai.persona.compose(
      message.content,
      persona,
      {
        context,
        conversationHistory: conversationContext,
        maxTokens: parseInt(process.env.MAX_MESSAGE_LENGTH || '2000')
      }
    );

    if (!result.ok) {
      console.error(`[ERR] Persona compose failed: ${result.error || 'unknown error'}`);
      await message.reply("*pauses* Sorry, I'm having trouble thinking right now. Can you try again?");
      return;
    }

    // Get response and apply pronoun filter
    let responseText = result.data.text || result.data.response || result.data.content;

    // CRITICAL: Filter third-person pronouns
    const hadThirdPerson = detectThirdPerson(responseText, persona.name);
    if (hadThirdPerson) {
      console.log(`[WARN] Third-person detected in ${persona.name} response, applying filter...`);
    }
    responseText = fixThirdPersonPronouns(responseText, persona.name);

    // Ensure response doesn't exceed Discord's limit
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + '...';
    }

    // Send response
    await message.reply(responseText);

    // Record conversation
    if (services.conversationHistory) {
      await services.conversationHistory.add(
        message.channelId,
        message.author.id,
        persona.name,
        [
          { role: 'user', content: message.content },
          { role: 'assistant', content: responseText }
        ]
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
