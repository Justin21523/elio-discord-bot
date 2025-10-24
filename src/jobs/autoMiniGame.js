/**
 * autoMiniGame.js
 * Personas proactively challenge members to 1v1 mini games
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";

/**
 * Proactively start mini games with random members
 */
export async function run(client) {
  try {
    logger.info("[JOB] autoMiniGame started");

    const config = await getAutoMiniGameConfig();

    if (!config.enabled) {
      logger.info("[JOB] autoMiniGame is disabled");
      return;
    }

    const { default: ai } = await import("../services/ai/index.js");
    const { default: webhooks } = await import("../services/webhooks.js");

    // Get all personas
    const personas = await getCollection("personas").find({}).toArray();

    if (personas.length === 0) {
      logger.warn("[JOB] No personas found");
      return;
    }

    // Pick a random persona to initiate the game
    const persona = personas[Math.floor(Math.random() * personas.length)];

    // Process each configured channel
    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel?.isTextBased()) {
          logger.warn(`[JOB] Channel ${channelId} not found or not text-based`);
          continue;
        }

        // Get recently active members (last 24 hours)
        const messages = await channel.messages.fetch({ limit: 100 });
        const activeMembers = new Set();

        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        messages.forEach((msg) => {
          if (msg.createdTimestamp > dayAgo && !msg.author.bot) {
            activeMembers.add(msg.author);
          }
        });

        if (activeMembers.size === 0) {
          logger.info(`[JOB] No active members in ${channel.name}`);
          continue;
        }

        // Pick a random active member
        const membersArray = Array.from(activeMembers);
        const challenger = membersArray[Math.floor(Math.random() * membersArray.length)];

        // Use AI Agent to design a creative game type
        const gameDesignTask = {
          goal: `Design a creative, fun 1v1 mini-game for ${persona.name} to challenge ${challenger.username}`,
          context: {
            personaStyle: persona.prompt || "friendly and playful",
            challengerName: challenger.username,
            setting: "Communiverse / sci-fi themed Discord bot",
          },
        };

        const gameDesignResult = await ai.agent.orchestrate(gameDesignTask);

        let gameType = null;

        // Try to use AI-designed game
        if (gameDesignResult.ok && gameDesignResult.data.gameIdea) {
          // AI suggested a custom game
          const aiIdea = gameDesignResult.data.gameIdea;
          gameType = {
            type: aiIdea.type || "custom_challenge",
            name: aiIdea.name || "Cosmic Challenge",
            description: aiIdea.description || "Let's play!",
            aiGenerated: true,
          };
        } else {
          // Fallback to predefined games
          const gameTypes = [
            {
              type: "trivia",
              name: "Communiverse Trivia",
              description: "Test your knowledge of the Communiverse!",
            },
            {
              type: "riddle",
              name: "Riddle Challenge",
              description: "Solve my riddle!",
            },
            {
              type: "story_completion",
              name: "Story Weaver",
              description: "Complete the story in the most creative way!",
            },
            {
              type: "reaction",
              name: "Quick Reaction",
              description: "Click the button as fast as you can!",
            },
            {
              type: "word_association",
              name: "Cosmic Word Chain",
              description: "Keep the word chain going!",
            },
          ];

          gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
        }

        // Generate challenge message
        const challengePrompt = `You are ${persona.name}. You want to challenge ${challenger.username} to a fun mini game called "${gameType.name}".

Write a short, enthusiastic challenge message (1-2 sentences) in character. Make it fun and inviting!`;

        const challengeResult = await ai.llm.generate(challengePrompt, {
          system: persona.prompt || "",
          maxTokens: 100,
          temperature: 0.9,
        });

        const challengeMessage = challengeResult.ok
          ? challengeResult.data.text.trim()
          : `Hey ${challenger.username}! Want to play ${gameType.name} with me?`;

        // Create game session
        const gameSession = await createGameSession(
          gameType.type,
          persona,
          challenger,
          channel
        );

        // Build interactive embed
        const embed = new EmbedBuilder()
          .setColor(persona.color || "#5865F2")
          .setAuthor({
            name: persona.name,
            iconURL: persona.avatar,
          })
          .setTitle(`🎮 ${gameType.name} Challenge!`)
          .setDescription(
            `${challengeMessage}\n\n**${gameType.description}**\n\nAre you ready to face me, ${challenger.username}?`
          )
          .setFooter({ text: "Click Accept to start!" })
          .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`game_accept_${gameSession._id}`)
            .setLabel("Accept Challenge")
            .setStyle(ButtonStyle.Success)
            .setEmoji("⚔️"),
          new ButtonBuilder()
            .setCustomId(`game_decline_${gameSession._id}`)
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🏳️")
        );

        // Send challenge via webhook
        const webhookMessage = await webhooks.sendAsPersona(
          channel,
          {
            name: persona.name,
            avatar: persona.avatar,
            color: persona.color,
          },
          { embeds: [embed], components: [buttons] }
        );

        // Update session with message ID
        await getCollection("game_sessions").updateOne(
          { _id: gameSession._id },
          {
            $set: {
              messageId: webhookMessage.id,
            },
          }
        );

        logger.info(
          `[JOB] ${persona.name} challenged ${challenger.username} to ${gameType.name}`
        );

        // Only one game per run
        break;
      } catch (error) {
        logger.error(`[JOB] Failed to process channel ${channelId}`, {
          error: error.message,
        });
      }
    }

    logger.info("[JOB] autoMiniGame completed");
  } catch (error) {
    logger.error("[JOB] autoMiniGame failed", { error: error.message });
  }
}

/**
 * Create a new game session
 */
async function createGameSession(gameType, persona, challenger, channel) {
  const { default: ai } = await import("../services/ai/index.js");

  let gameData = {};

  switch (gameType) {
    case "trivia": {
      // Use RAG to generate a Communiverse trivia question
      const ragResult = await ai.rag.search({
        query: "characters locations lore Communiverse",
        topK: 3,
      });

      const context = ragResult.ok
        ? ragResult.data.hits.map((h) => h.chunk).join("\n")
        : "";

      const triviaPrompt = `Based on this Communiverse lore:
${context}

Generate a trivia question with 4 multiple choice answers (A, B, C, D). One answer must be correct.

Output JSON format:
{
  "question": "What is...",
  "answers": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct": "A"
}`;

      const triviaResult = await ai.llm.generate(triviaPrompt, {
        maxTokens: 200,
        temperature: 0.7,
      });

      if (triviaResult.ok) {
        const jsonMatch = triviaResult.data.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          gameData = JSON.parse(jsonMatch[0]);
        }
      }

      if (!gameData.question) {
        gameData = {
          question: "Who is the Earth Ambassador in the Communiverse?",
          answers: [
            "A) Elio",
            "B) Glordon",
            "C) Olga",
            "D) Ambassador Questa",
          ],
          correct: "A",
        };
      }
      break;
    }

    case "riddle": {
      const riddlePrompt = `Generate a short, fun riddle related to space or sci-fi. Include the answer.

Output JSON:
{
  "riddle": "I have...",
  "answer": "..."
}`;

      const riddleResult = await ai.llm.generate(riddlePrompt, {
        maxTokens: 150,
        temperature: 0.8,
      });

      if (riddleResult.ok) {
        const jsonMatch = riddleResult.data.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          gameData = JSON.parse(jsonMatch[0]);
        }
      }

      if (!gameData.riddle) {
        gameData = {
          riddle:
            "I have no lungs but I breathe. I have no mouth but I speak. What am I?",
          answer: "wind",
        };
      }
      break;
    }

    case "reaction": {
      gameData = {
        startTime: null, // Will be set when game starts
        readyTime: Date.now() + 3000, // 3 seconds delay
      };
      break;
    }

    case "number_guess": {
      gameData = {
        targetNumber: Math.floor(Math.random() * 100) + 1,
        attempts: 0,
        maxAttempts: 5,
      };
      break;
    }

    case "story_completion": {
      // Use Story API to generate story beginning
      const storyPrompt = `Generate a compelling story opening (2-3 sentences) set in the Communiverse.
End with a cliffhanger or interesting situation that invites continuation.`;

      const storyResult = await ai.story.generate({
        prompt: storyPrompt,
        maxTokens: 150,
      });

      if (storyResult.ok) {
        gameData = {
          storyBeginning: storyResult.data.text,
          completions: [],
        };
      } else {
        gameData = {
          storyBeginning:
            "Elio and Glordon were exploring a mysterious asteroid when suddenly, all their equipment stopped working...",
          completions: [],
        };
      }
      break;
    }

    case "word_association": {
      const seed_words = ["galaxy", "alien", "starship", "wormhole", "nebula", "cosmic"];
      gameData = {
        currentWord: seed_words[Math.floor(Math.random() * seed_words.length)],
        wordChain: [],
        maxRounds: 5,
      };
      break;
    }

    case "custom_challenge":
    default: {
      // For AI-generated games, use Agent to create game rules
      const rulesPrompt = `Design complete game rules for this mini-game:
Name: ${gameType.name}
Description: ${gameType.description}

Output JSON:
{
  "objective": "...",
  "rules": ["rule 1", "rule 2", ...],
  "winCondition": "..."
}`;

      const rulesResult = await ai.llm.generate(rulesPrompt, {
        maxTokens: 300,
        temperature: 0.7,
      });

      if (rulesResult.ok) {
        const jsonMatch = rulesResult.data.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          gameData = JSON.parse(jsonMatch[0]);
        }
      }

      if (!gameData.objective) {
        gameData = {
          objective: gameType.description,
          rules: ["Be creative!", "Have fun!"],
          winCondition: "Most creative response wins",
        };
      }
      break;
    }
  }

  const session = {
    type: gameType,
    personaName: persona.name,
    challengerId: challenger.id,
    challengerName: challenger.username,
    channelId: channel.id,
    status: "pending", // pending, active, completed
    gameData,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  };

  const result = await getCollection("game_sessions").insertOne(session);
  session._id = result.insertedId;

  return session;
}

/**
 * Get auto mini game configuration
 */
async function getAutoMiniGameConfig() {
  try {
    const configCol = getCollection("bot_config");
    let config = await configCol.findOne({ key: "auto_mini_game" });

    if (!config) {
      config = {
        key: "auto_mini_game",
        enabled: true,
        channelIds: [],
        frequency: "0 */4 * * *", // Every 4 hours
        gameTypes: ["trivia", "riddle", "reaction", "number_guess"],
        updatedAt: new Date(),
      };

      await configCol.insertOne(config);
    }

    return config;
  } catch (error) {
    logger.error("[JOB] Failed to get auto mini game config", {
      error: error.message,
    });
    return { enabled: false, channelIds: [] };
  }
}

/**
 * Update auto mini game configuration
 */
export async function updateConfig(updates) {
  try {
    const configCol = getCollection("bot_config");

    await configCol.updateOne(
      { key: "auto_mini_game" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info("[JOB] Auto mini game config updated");
  } catch (error) {
    logger.error("[JOB] Failed to update auto mini game config", {
      error: error.message,
    });
  }
}
