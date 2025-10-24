/**
 * autoPersonaChat.js
 * Personas proactively join conversations and interact with community members
 */

import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";

/**
 * Personas proactively comment on recent messages
 */
export async function run(client) {
  try {
    logger.info("[JOB] autoPersonaChat started");

    const config = await getAutoPersonaChatConfig();

    if (!config.enabled) {
      logger.info("[JOB] autoPersonaChat is disabled");
      return;
    }

    const { default: ai } = await import("../services/ai/index.js");
    const { default: webhooks } = await import("../services/webhooks.js");

    // Get all active personas
    const personas = await getCollection("personas").find({}).toArray();

    if (personas.length === 0) {
      logger.warn("[JOB] No personas found");
      return;
    }

    // Process each configured channel
    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel?.isTextBased()) {
          logger.warn(`[JOB] Channel ${channelId} not found or not text-based`);
          continue;
        }

        // Fetch recent messages (last hour)
        const messages = await channel.messages.fetch({ limit: 50 });
        const recentMessages = messages.filter((msg) => {
          const hourAgo = Date.now() - 60 * 60 * 1000;
          return msg.createdTimestamp > hourAgo && !msg.author.bot;
        });

        if (recentMessages.size === 0) {
          logger.info(`[JOB] No recent messages in ${channel.name}`);
          continue;
        }

        // Analyze conversation context
        const conversationContext = recentMessages
          .reverse()
          .map((msg) => `${msg.author.username}: ${msg.content}`)
          .join("\n");

        // Decide if a persona should join
        const shouldJoinPrompt = `Analyze this recent Discord conversation:

${conversationContext}

Should any of the Communiverse characters (Elio, Glordon, Olga, etc.) naturally join this conversation?

Consider:
1. Is the topic relevant to space, sci-fi, or Communiverse lore?
2. Is someone asking a question a character could answer?
3. Is there an opportunity for fun character interaction?
4. Would it feel natural and not forced?

Respond with JSON:
{
  "should_join": true/false,
  "persona": "name of persona who should join",
  "reason": "why they would join",
  "response_tone": "helpful/funny/curious/concerned"
}`;

        const decisionResult = await ai.llm.generate(shouldJoinPrompt, {
          maxTokens: 150,
          temperature: 0.7,
        });

        if (!decisionResult.ok) {
          logger.warn("[JOB] Failed to analyze conversation");
          continue;
        }

        // Parse decision
        const decisionText = decisionResult.data.text;
        const jsonMatch = decisionText.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
          logger.warn("[JOB] No valid decision found");
          continue;
        }

        const decision = JSON.parse(jsonMatch[0]);

        if (!decision.should_join) {
          logger.info(`[JOB] No persona needs to join conversation in ${channel.name}`);
          continue;
        }

        // Find the persona
        const persona = personas.find(
          (p) => p.name.toLowerCase() === decision.persona.toLowerCase()
        );

        if (!persona) {
          logger.warn(`[JOB] Persona ${decision.persona} not found`);
          continue;
        }

        // Use RAG to get relevant lore/knowledge
        const ragQuery = `${persona.name} knowledge about ${conversationContext.slice(-200)}`;
        const ragResult = await ai.rag.search({
          query: ragQuery,
          topK: 3,
        });

        let contextKnowledge = "";
        if (ragResult.ok && ragResult.data.hits?.length > 0) {
          contextKnowledge = "\n\nRelevant knowledge:\n" + ragResult.data.hits
            .map((h) => h.chunk)
            .slice(0, 2)
            .join("\n");
        }

        // Generate persona's response with RAG context
        const responsePrompt = `You are ${persona.name}.

Recent conversation:
${conversationContext}

${decision.reason}
${contextKnowledge}

Write a natural, in-character response (1-3 sentences). Tone: ${decision.response_tone}.
Use your knowledge naturally - don't explicitly cite sources.`;

        const responseResult = await ai.llm.generate(responsePrompt, {
          system: persona.prompt || "",
          maxTokens: 250,
          temperature: 0.8,
        });

        if (!responseResult.ok) {
          logger.warn("[JOB] Failed to generate persona response");
          continue;
        }

        const response = responseResult.data.text.trim();

        // Post response via webhook
        await webhooks.sendAsPersona(
          channel,
          {
            name: persona.name,
            avatar: persona.avatar,
            color: persona.color,
          },
          response
        );

        logger.info(`[JOB] ${persona.name} joined conversation in ${channel.name}`);

        // Track in database
        await getCollection("persona_chats").insertOne({
          channelId,
          personaName: persona.name,
          response,
          context: conversationContext,
          decision: decision,
          postedAt: new Date(),
        });

        // Only one persona joins per run to avoid spam
        break;
      } catch (error) {
        logger.error(`[JOB] Failed to process channel ${channelId}`, {
          error: error.message,
        });
      }
    }

    logger.info("[JOB] autoPersonaChat completed");
  } catch (error) {
    logger.error("[JOB] autoPersonaChat failed", { error: error.message });
  }
}

/**
 * Get auto persona chat configuration
 */
async function getAutoPersonaChatConfig() {
  try {
    const configCol = getCollection("bot_config");
    let config = await configCol.findOne({ key: "auto_persona_chat" });

    if (!config) {
      config = {
        key: "auto_persona_chat",
        enabled: true,
        channelIds: [],
        frequency: "0 */2 * * *", // Every 2 hours
        minMessageGap: 30, // minutes between persona messages
        updatedAt: new Date(),
      };

      await configCol.insertOne(config);
    }

    return config;
  } catch (error) {
    logger.error("[JOB] Failed to get auto persona chat config", {
      error: error.message,
    });
    return { enabled: false, channelIds: [] };
  }
}

/**
 * Update auto persona chat configuration
 */
export async function updateConfig(updates) {
  try {
    const configCol = getCollection("bot_config");

    await configCol.updateOne(
      { key: "auto_persona_chat" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info("[JOB] Auto persona chat config updated");
  } catch (error) {
    logger.error("[JOB] Failed to update auto persona chat config", {
      error: error.message,
    });
  }
}
