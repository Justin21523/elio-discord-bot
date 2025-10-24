/**
 * handlers/proactiveHandlers.js
 * Proactive AI features - Auto meme drops, persona chats, mini games, story weaving, world building
 * Integrates all AI modules: LLM, RAG, VLM, Story, Agent
 */

import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";
import { listPersonas, getPersona } from "../services/persona.js";
import { sendAsPersona } from "../services/webhooks.js";
import { incCounter } from "../util/metrics.js";

/**
 * Auto Meme Drop - Randomly drop media with AI-generated captions
 * Uses: VLM (image description) + LLM (caption generation)
 */
export async function handleAutoMemeDrop(client, services) {
  try {
    logger.info("[PROACTIVE] Starting auto meme drop");

    // Get all guilds with auto meme drop enabled
    const guilds = await getEnabledGuilds("auto_meme_drop");

    for (const guild of guilds) {
      try {
        // Get random media
        const mediaCol = getCollection("media");
        const mediaCount = await mediaCol.countDocuments({ enabled: true });
        if (mediaCount === 0) continue;

        const randomMedia = await mediaCol
          .aggregate([
            { $match: { enabled: true } },
            { $sample: { size: 1 } },
          ])
          .toArray();

        if (randomMedia.length === 0) continue;

        const media = randomMedia[0];

        // Get target channel
        const targetChannel = guild.config.auto_meme_drop_channel;
        if (!targetChannel) {
          logger.warn("[PROACTIVE] No target channel for meme drop", {
            guildId: guild.guildId,
          });
          continue;
        }

        const channel = await client.channels.fetch(targetChannel).catch(() => null);
        if (!channel) continue;

        // Generate caption using VLM + LLM
        let caption = "Check this out! 🎨";
        if (media.type === "image" && services.ai?.vlm) {
          try {
            // VLM: Describe the image
            const vlmResult = await services.ai.vlm.describe({
              imageUrl: media.url,
              question: "Describe this image in a fun, engaging way.",
              maxTokens: 150,
            });

            if (vlmResult.ok && vlmResult.data.description) {
              // LLM: Generate a fun caption based on description
              const llmResult = await services.ai.llm.generate({
                prompt: `Based on this image description, write a fun, short caption (1-2 sentences):\n\n${vlmResult.data.description}`,
                maxTokens: 100,
                temperature: 0.9,
              });

              if (llmResult.ok && llmResult.data.text) {
                caption = llmResult.data.text.trim();
              }
            }
          } catch (error) {
            logger.warn("[PROACTIVE] VLM/LLM caption failed", {
              error: error.message,
            });
          }
        }

        // Select random persona to post
        const personas = await listPersonas();
        if (personas.ok && personas.data.length > 0) {
          const randomPersona =
            personas.data[Math.floor(Math.random() * personas.data.length)];

          await sendAsPersona(channel.id, randomPersona, {
            content: caption,
            embeds: [
              {
                image: { url: media.url },
                color: randomPersona.color || 0x00ff00,
              },
            ],
          });

          incCounter("proactive_meme_drops_total");
          logger.info("[PROACTIVE] Meme drop successful", {
            guildId: guild.guildId,
            persona: randomPersona.name,
          });
        }
      } catch (error) {
        logger.error("[PROACTIVE] Meme drop error for guild", {
          guildId: guild.guildId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    logger.error("[PROACTIVE] Auto meme drop failed", { error: error.message });
  }
}

/**
 * Auto Persona Chat - Personas randomly start conversations
 * Uses: RAG (context) + LLM (topic generation) + Persona (styled response)
 */
export async function handleAutoPersonaChat(client, services) {
  try {
    logger.info("[PROACTIVE] Starting auto persona chat");

    const guilds = await getEnabledGuilds("auto_persona_chat");

    for (const guild of guilds) {
      try {
        // Get target channel
        const targetChannel = guild.config.auto_persona_chat_channel;
        if (!targetChannel) continue;

        const channel = await client.channels.fetch(targetChannel).catch(() => null);
        if (!channel) continue;

        // Select random persona
        const personas = await listPersonas();
        if (!personas.ok || personas.data.length === 0) continue;

        const randomPersona =
          personas.data[Math.floor(Math.random() * personas.data.length)];

        // RAG: Get random interesting topic from knowledge base
        let topic = null;
        if (services.ai?.rag) {
          try {
            const ragResult = await services.ai.rag.search({
              query: "interesting facts about the Communiverse",
              guildId: guild.guildId,
              topK: 3,
              generateAnswer: false,
            });

            if (ragResult.ok && ragResult.data.hits?.length > 0) {
              const randomHit =
                ragResult.data.hits[
                  Math.floor(Math.random() * ragResult.data.hits.length)
                ];
              topic = randomHit.chunk.substring(0, 200);
            }
          } catch (error) {
            logger.warn("[PROACTIVE] RAG topic fetch failed", {
              error: error.message,
            });
          }
        }

        // LLM: Generate conversation starter
        const promptText = topic
          ? `Based on this fact: "${topic}"\n\nStart an interesting conversation in 1-2 sentences.`
          : "Start a random interesting conversation about space, aliens, or friendship in 1-2 sentences.";

        const llmResult = await services.ai.llm.generate({
          prompt: promptText,
          maxTokens: 100,
          temperature: 0.8,
        });

        let conversationStarter = "Hey everyone! What's on your mind today? 🌟";
        if (llmResult.ok && llmResult.data.text) {
          conversationStarter = llmResult.data.text.trim();
        }

        // Persona: Style the message
        const personaResult = await services.ai.persona.compose(
          conversationStarter,
          randomPersona
        );

        const finalMessage = personaResult.ok
          ? personaResult.data.text
          : conversationStarter;

        // Send message
        await sendAsPersona(channel.id, randomPersona, { content: finalMessage });

        incCounter("proactive_persona_chats_total");
        logger.info("[PROACTIVE] Persona chat successful", {
          guildId: guild.guildId,
          persona: randomPersona.name,
        });
      } catch (error) {
        logger.error("[PROACTIVE] Persona chat error for guild", {
          guildId: guild.guildId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    logger.error("[PROACTIVE] Auto persona chat failed", {
      error: error.message,
    });
  }
}

/**
 * Auto Mini Game - Start surprise mini games
 * Uses: LLM (question generation) + RAG (trivia questions)
 */
export async function handleAutoMiniGame(client, services) {
  try {
    logger.info("[PROACTIVE] Starting auto mini game");

    const guilds = await getEnabledGuilds("auto_mini_game");

    for (const guild of guilds) {
      try {
        const targetChannel = guild.config.auto_mini_game_channel;
        if (!targetChannel) continue;

        const channel = await client.channels.fetch(targetChannel).catch(() => null);
        if (!channel) continue;

        // RAG: Get trivia from knowledge base
        let triviaContext = null;
        if (services.ai?.rag) {
          try {
            const ragResult = await services.ai.rag.search({
              query: "character facts trivia Communiverse",
              guildId: guild.guildId,
              topK: 2,
              generateAnswer: false,
            });

            if (ragResult.ok && ragResult.data.hits?.length > 0) {
              triviaContext = ragResult.data.hits[0].chunk;
            }
          } catch (error) {
            logger.warn("[PROACTIVE] RAG trivia failed", {
              error: error.message,
            });
          }
        }

        // LLM: Generate trivia question
        const promptText = triviaContext
          ? `Based on this information:\n${triviaContext}\n\nCreate a fun trivia question with 4 multiple choice answers (mark the correct one with *). Keep it short and engaging.`
          : "Create a fun trivia question about space, aliens, or the Communiverse with 4 multiple choice answers. Mark the correct one with *.";

        const llmResult = await services.ai.llm.generate({
          prompt: promptText,
          maxTokens: 200,
          temperature: 0.7,
        });

        if (!llmResult.ok || !llmResult.data.text) {
          logger.warn("[PROACTIVE] LLM trivia generation failed");
          continue;
        }

        // Select random persona to host
        const personas = await listPersonas();
        if (!personas.ok || personas.data.length === 0) continue;

        const hostPersona =
          personas.data[Math.floor(Math.random() * personas.data.length)];

        const triviaMessage =
          `🎮 **Surprise Trivia Time!**\n\n${llmResult.data.text}\n\n` +
          `React with your answer! First correct answer wins points! 🏆`;

        await sendAsPersona(channel.id, hostPersona, { content: triviaMessage });

        incCounter("proactive_mini_games_total");
        logger.info("[PROACTIVE] Mini game started", {
          guildId: guild.guildId,
          persona: hostPersona.name,
        });
      } catch (error) {
        logger.error("[PROACTIVE] Mini game error for guild", {
          guildId: guild.guildId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    logger.error("[PROACTIVE] Auto mini game failed", { error: error.message });
  }
}

/**
 * Auto Story Weave - Continue ongoing collaborative stories
 * Uses: Story module + LLM + RAG (story context)
 */
export async function handleAutoStoryWeave(client, services) {
  try {
    logger.info("[PROACTIVE] Starting auto story weave");

    const guilds = await getEnabledGuilds("auto_story_weave");

    for (const guild of guilds) {
      try {
        const targetChannel = guild.config.auto_story_weave_channel;
        if (!targetChannel) continue;

        const channel = await client.channels.fetch(targetChannel).catch(() => null);
        if (!channel) continue;

        // Story module: Generate story continuation
        if (!services.ai?.story) {
          logger.warn("[PROACTIVE] Story service not available");
          continue;
        }

        const storyResult = await services.ai.story.generate({
          prompt: "Continue the Communiverse adventure. What happens next in space?",
          length: 150,
          temperature: 0.8,
        });

        if (!storyResult.ok || !storyResult.data.text) {
          logger.warn("[PROACTIVE] Story generation failed");
          continue;
        }

        // Select storyteller persona
        const personas = await listPersonas();
        if (!personas.ok || personas.data.length === 0) continue;

        // Prefer Elio for stories (he loves stories!)
        let storyteller = personas.data.find((p) => p.name === "Elio");
        if (!storyteller) {
          storyteller =
            personas.data[Math.floor(Math.random() * personas.data.length)];
        }

        const storyMessage =
          `📖 **Story Time!**\n\n${storyResult.data.text}\n\n` +
          `_What happens next? React or reply to continue the story!_`;

        await sendAsPersona(channel.id, storyteller, { content: storyMessage });

        incCounter("proactive_story_weaves_total");
        logger.info("[PROACTIVE] Story weave successful", {
          guildId: guild.guildId,
          persona: storyteller.name,
        });
      } catch (error) {
        logger.error("[PROACTIVE] Story weave error for guild", {
          guildId: guild.guildId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    logger.error("[PROACTIVE] Auto story weave failed", {
      error: error.message,
    });
  }
}

/**
 * Auto World Builder - Share lore and world-building content
 * Uses: RAG (lore database) + LLM (format) + Agent (complex lore queries)
 */
export async function handleAutoWorldBuilder(client, services) {
  try {
    logger.info("[PROACTIVE] Starting auto world builder");

    const guilds = await getEnabledGuilds("auto_world_builder");

    for (const guild of guilds) {
      try {
        const targetChannel = guild.config.auto_world_builder_channel;
        if (!targetChannel) continue;

        const channel = await client.channels.fetch(targetChannel).catch(() => null);
        if (!channel) continue;

        // RAG: Get lore from knowledge base
        if (!services.ai?.rag) {
          logger.warn("[PROACTIVE] RAG service not available");
          continue;
        }

        const loreTopics = [
          "Communiverse history",
          "alien species",
          "wormhole technology",
          "planet cultures",
          "character backgrounds",
        ];

        const randomTopic =
          loreTopics[Math.floor(Math.random() * loreTopics.length)];

        const ragResult = await services.ai.rag.search({
          query: randomTopic,
          guildId: guild.guildId,
          topK: 3,
          generateAnswer: true,
        });

        if (!ragResult.ok || !ragResult.data.answer) {
          logger.warn("[PROACTIVE] RAG lore fetch failed");
          continue;
        }

        // LLM: Format as interesting lore post
        const llmResult = await services.ai.llm.generate({
          prompt: `Format this lore into an engaging Discord post with emoji and formatting:\n\n${ragResult.data.answer}`,
          maxTokens: 300,
          temperature: 0.7,
        });

        const loreContent = llmResult.ok
          ? llmResult.data.text
          : ragResult.data.answer;

        // Select lore keeper persona (prefer Glordon for structured info)
        const personas = await listPersonas();
        if (!personas.ok || personas.data.length === 0) continue;

        let loreKeeper = personas.data.find((p) => p.name === "Glordon");
        if (!loreKeeper) {
          loreKeeper =
            personas.data[Math.floor(Math.random() * personas.data.length)];
        }

        const loreMessage = `🌌 **Did You Know?**\n\n${loreContent}`;

        await sendAsPersona(channel.id, loreKeeper, { content: loreMessage });

        incCounter("proactive_world_builders_total");
        logger.info("[PROACTIVE] World builder successful", {
          guildId: guild.guildId,
          persona: loreKeeper.name,
          topic: randomTopic,
        });
      } catch (error) {
        logger.error("[PROACTIVE] World builder error for guild", {
          guildId: guild.guildId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    logger.error("[PROACTIVE] Auto world builder failed", {
      error: error.message,
    });
  }
}

/**
 * Helper: Get guilds with specific proactive feature enabled
 */
async function getEnabledGuilds(featureName) {
  try {
    const configCol = getCollection("guild_config");
    const query = {
      [`proactive.${featureName}`]: true,
    };

    const docs = await configCol.find(query).toArray();

    return docs.map((doc) => ({
      guildId: doc.guildId,
      config: doc.proactive || {},
    }));
  } catch (error) {
    logger.error("[PROACTIVE] Failed to get enabled guilds", {
      feature: featureName,
      error: error.message,
    });
    return [];
  }
}
