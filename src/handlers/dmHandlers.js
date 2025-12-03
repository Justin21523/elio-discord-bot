/**
 * handlers/dmHandlers.js
 * Handle Direct Message interactions with full AI integration
 * Supports: Chat, Games, Story generation, Persona interactions
 */

import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";
import { listPersonas, getPersona } from "../services/persona.js";
import { incCounter } from "../util/metrics.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// DM Session storage (in-memory for now)
const dmSessions = new Map();

/**
 * Handle DM messages with AI-powered responses
 * @param {Message} message - Discord DM message
 * @param {Object} services - Bot services
 */
export async function handleDMMessage(message, services) {
  try {
    logger.info("[DM] Received DM", {
      userId: message.author.id,
      content: message.content.substring(0, 50),
    });

    // Get or create DM session
    const session = getOrCreateSession(message.author.id);

    // Check for special commands
    if (message.content.startsWith("!")) {
      return await handleDMCommand(message, session, services);
    }

    // Default: AI-powered chat
    return await handleDMChat(message, session, services);
  } catch (error) {
    logger.error("[DM] Error handling DM", {
      error: error.message,
      stack: error.stack,
    });

    await message.channel.send(
      "❌ Sorry, something went wrong! Try again or use `!help` for assistance."
    );
  }
}

/**
 * Get or create a DM session for a user
 */
function getOrCreateSession(userId) {
  if (!dmSessions.has(userId)) {
    dmSessions.set(userId, {
      userId,
      persona: null, // Currently active persona
      mode: "chat", // chat, game, story
      gameState: null,
      storyContext: [],
      conversationHistory: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  }

  const session = dmSessions.get(userId);
  session.lastActivity = Date.now();
  return session;
}

/**
 * Handle DM commands (!help, !persona, !game, !story, etc.)
 */
async function handleDMCommand(message, session, services) {
  const args = message.content.slice(1).trim().split(/\s+/);
  const command = args[0].toLowerCase();

  logger.info("[DM] Command", { userId: session.userId, command, args });

  switch (command) {
    case "help":
      return await showDMHelp(message);

    case "persona":
      return await handlePersonaCommand(message, session, services, args);

    case "game":
      return await startDMGame(message, session, services, args);

    case "story":
      return await startDMStory(message, session, services, args);

    case "clear":
      session.conversationHistory = [];
      session.storyContext = [];
      return await message.channel.send("✅ Conversation history cleared!");

    case "status":
      return await showSessionStatus(message, session);

    default:
      return await message.channel.send(
        `❓ Unknown command: \`!${command}\`. Use \`!help\` for available commands.`
      );
  }
}

/**
 * Show DM help menu
 */
async function showDMHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🤖 Elio Bot - DM Commands")
    .setDescription(
      "Welcome to your personal AI assistant! Here's what you can do:"
    )
    .addFields(
      {
        name: "💬 Chat",
        value:
          "Just send any message to chat with AI! I'll remember our conversation.",
        inline: false,
      },
      {
        name: "🎭 !persona <name>",
        value:
          "Chat with a specific persona (Elio, Glordon, Caleb, Olga)\nExample: `!persona Elio`",
        inline: false,
      },
      {
        name: "🎮 !game <type>",
        value:
          "Start a mini game!\nTypes: `trivia`, `riddle`, `story`\nExample: `!game trivia`",
        inline: false,
      },
      {
        name: "📖 !story <theme>",
        value:
          "Generate an interactive story\nExample: `!story space adventure`",
        inline: false,
      },
      {
        name: "🗑️ !clear",
        value: "Clear conversation history",
        inline: true,
      },
      {
        name: "📊 !status",
        value: "Show current session status",
        inline: true,
      }
    )
    .setFooter({
      text: "Powered by AI - RAG, LLM, VLM, and more!",
    })
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
  incCounter("dm_help_views");
}

/**
 * Handle persona selection/chat
 */
async function handlePersonaCommand(message, session, services, args) {
  if (args.length < 2) {
    // List available personas
    const personas = await listPersonas();
    if (!personas.ok || personas.data.length === 0) {
      return await message.channel.send("❌ No personas available.");
    }

    const personaList = personas.data
      .map((p) => `• **${p.name}** - ${p.description || "No description"}`)
      .join("\n");

    return await message.channel.send(
      `🎭 **Available Personas:**\n\n${personaList}\n\nUse \`!persona <name>\` to chat with one!`
    );
  }

  const personaName = args.slice(1).join(" ");
  const result = await getPersona(personaName);

  if (!result.ok) {
    return await message.channel.send(
      `❌ Persona "${personaName}" not found. Use \`!persona\` to list available personas.`
    );
  }

  session.persona = result.data;
  session.mode = "chat";

  logger.info("[DM] Persona selected", {
    userId: session.userId,
    persona: session.persona.name,
  });

  const embed = new EmbedBuilder()
    .setColor(session.persona.color || 0x00ff00)
    .setTitle(`🎭 Now chatting with ${session.persona.name}!`)
    .setDescription(
      session.persona.description ||
        "Ready to chat! Send any message to start."
    )
    .setThumbnail(session.persona.avatar || session.persona.avatarUrl);

  await message.channel.send({ embeds: [embed] });
  incCounter("dm_persona_selected", { persona: session.persona.name });
}

/**
 * Handle DM chat (AI-powered conversation)
 */
async function handleDMChat(message, session, services) {
  const { ai } = services;

  if (!ai) {
    return await message.channel.send(
      "❌ AI service is currently unavailable. Please try again later."
    );
  }

  try {
    // Add to conversation history
    session.conversationHistory.push({
      role: "user",
      content: message.content,
      timestamp: Date.now(),
    });

    // Keep only last 10 messages for context
    if (session.conversationHistory.length > 10) {
      session.conversationHistory = session.conversationHistory.slice(-10);
    }

    // Build context from history
    const conversationContext = session.conversationHistory
      .slice(-5)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // Generate AI response using CPU-only personaLogic service
    let response;

    // Get or default to Elio persona for DM
    let activePersona = session.persona;
    if (!activePersona) {
      const defaultPersonaResult = await getPersona("Elio");
      if (defaultPersonaResult.ok) {
        activePersona = defaultPersonaResult.data;
      }
    }

    // Build history for personaLogic
    const historyPayload = session.conversationHistory.slice(-5).map((h) => ({
      role: h.role,
      content: h.content,
    }));

    // Try CPU-only personaLogic service first (preferred)
    if (ai?.personaLogic?.reply) {
      try {
        logger.info("[DM] Calling personaLogic.reply", {
          persona: activePersona?.name || "Elio",
          messageLength: message.content.length,
        });

        const logicRes = await ai.personaLogic.reply({
          persona: activePersona?.name || "Elio",
          message: message.content,
          history: historyPayload,
          topK: 5,
          maxLen: 90,
        });

        logger.info("[DM] personaLogic.reply result", {
          ok: logicRes?.ok,
          hasText: !!logicRes?.data?.text,
          strategy: logicRes?.data?.strategy,
        });

        if (logicRes?.ok && logicRes.data?.text) {
          response = logicRes.data.text.trim();
          logger.info("[DM] Using personaLogic response", {
            strategy: logicRes.data.strategy,
            responseLength: response.length,
          });
        }
      } catch (error) {
        logger.error("[DM] personaLogic.reply threw error", {
          error: error.message,
          stack: error.stack,
        });
      }
    } else {
      logger.warn("[DM] personaLogic.reply not available", {
        hasPersonaLogic: !!ai?.personaLogic,
        hasReply: !!ai?.personaLogic?.reply,
      });
    }

    // Skip persona.compose fallback in CPU-only mode (it requires LLM)
    // Go directly to template fallback

    // Final fallback: simple template response
    if (!response) {
      const fallbackResponses = [
        "That's interesting! Tell me more about that.",
        "I see! What else is on your mind?",
        "Hmm, that's a good point. What do you think?",
        "Thanks for sharing! Anything else you'd like to chat about?",
        "I hear you! What's next?",
      ];
      response =
        fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      logger.debug("[DM] Used fallback response");
    }

    // Add AI response to history
    session.conversationHistory.push({
      role: "assistant",
      content: response,
      timestamp: Date.now(),
    });

    await message.channel.send(response);

    incCounter("dm_chat_messages", {
      has_persona: session.persona ? "yes" : "no",
    });

    logger.info("[DM] Chat response sent", {
      userId: session.userId,
      persona: session.persona?.name || "none",
      responseLength: response.length,
    });
  } catch (error) {
    logger.error("[DM] Chat generation failed", {
      error: error.message,
      userId: session.userId,
    });

    await message.channel.send(
      "❌ Sorry, I couldn't generate a response. Please try again!"
    );
  }
}

/**
 * Start a DM mini game
 */
async function startDMGame(message, session, services, args) {
  const gameType = args[1]?.toLowerCase() || "trivia";

  logger.info("[DM] Starting game", { userId: session.userId, type: gameType });

  session.mode = "game";
  session.gameState = {
    type: gameType,
    started: Date.now(),
    score: 0,
    round: 1,
  };

  switch (gameType) {
    case "trivia":
      return await startTriviaGame(message, session, services);

    case "riddle":
      return await startRiddleGame(message, session, services);

    case "story":
      return await startStoryGame(message, session, services);

    default:
      return await message.channel.send(
        `❓ Unknown game type: \`${gameType}\`\n\nAvailable games: \`trivia\`, \`riddle\`, \`story\``
      );
  }
}

/**
 * Start AI-generated trivia game (CPU-only using pre-defined questions)
 */
async function startTriviaGame(message, session, services) {
  try {
    // CPU-only mode: Use pre-defined trivia questions instead of LLM generation
    const triviaQuestions = [
      {
        question: "What is the name of the main character in Communiverse?",
        options: ["A) Glordon", "B) *Elio*", "C) Caleb", "D) Olga"],
        answer: "B",
      },
      {
        question: "Which persona is known for their cosmic wisdom?",
        options: ["A) Caleb", "B) Olga", "C) *Glordon*", "D) Elio"],
        answer: "C",
      },
      {
        question: "What type of bot is Elio?",
        options: [
          "A) Music bot",
          "B) *AI-powered Discord bot*",
          "C) Moderation bot",
          "D) Gaming bot",
        ],
        answer: "B",
      },
      {
        question: "What technology powers the Communiverse responses?",
        options: [
          "A) Simple rules",
          "B) *Machine Learning*",
          "C) Random selection",
          "D) Manual responses",
        ],
        answer: "B",
      },
      {
        question: "Which ML technique is used for text search?",
        options: ["A) Neural Networks", "B) Random Forest", "C) *BM25*", "D) K-means"],
        answer: "C",
      },
    ];

    // Pick a random question
    const trivia =
      triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    const triviaText = `**Question:** ${trivia.question}\n\n${trivia.options.join("\n")}`;

    // Store trivia question in game state
    session.gameState.currentQuestion = triviaText;
    session.gameState.correctAnswer = trivia.answer;
    session.gameState.waitingForAnswer = true;

    const embed = new EmbedBuilder()
      .setColor(0xff6600)
      .setTitle(`🎮 Trivia Game - Round ${session.gameState.round}`)
      .setDescription(triviaText)
      .setFooter({ text: "Reply with A, B, C, or D to answer!" });

    await message.channel.send({ embeds: [embed] });

    incCounter("dm_games_started", { type: "trivia" });
  } catch (error) {
    logger.error("[DM] Trivia game failed", {
      error: error.message,
      userId: session.userId,
    });

    await message.channel.send(
      "❌ Failed to start trivia game. Please try again!"
    );
  }
}

/**
 * Start riddle game
 */
async function startRiddleGame(message, session, services) {
  // Similar to trivia but with riddles
  await message.channel.send(
    "🧩 **Riddle Game**\n\nComing soon! Try `!game trivia` instead."
  );
}

/**
 * Start interactive story game
 */
async function startStoryGame(message, session, services) {
  // Interactive choose-your-own-adventure style
  await message.channel.send(
    "📖 **Story Game**\n\nComing soon! Try `!story <theme>` for story generation."
  );
}

/**
 * Start AI story generation (CPU-only using Markov/template system)
 */
async function startDMStory(message, session, services, args) {
  const theme = args.slice(1).join(" ") || "space adventure";

  logger.info("[DM] Starting story", { userId: session.userId, theme });

  session.mode = "story";
  session.storyContext = [{ theme, started: Date.now() }];

  try {
    const { ai } = services;

    // CPU-only: Try Markov chain story generation
    let storyText = null;

    if (ai?.markov) {
      try {
        const markovRes = await ai.markov.generate({
          seed: theme,
          maxLength: 150,
        });
        if (markovRes?.ok && markovRes.data?.text) {
          storyText = markovRes.data.text;
        }
      } catch (error) {
        logger.warn("[DM] Markov story generation failed", {
          error: error.message,
        });
      }
    }

    // Fallback: Use pre-defined story templates
    if (!storyText) {
      const storyTemplates = {
        "space adventure": `You find yourself aboard a mysterious spacecraft drifting through the cosmos. The stars twinkle outside the viewport as you notice two doors ahead.\n\n**Choice A:** Open the door marked "Bridge"\n**Choice B:** Open the door marked "Engine Room"`,
        adventure: `You stand at the edge of an ancient forest. The path ahead splits into two directions. To the left, you hear rushing water. To the right, a faint glow flickers through the trees.\n\n**Choice A:** Follow the sound of water\n**Choice B:** Investigate the mysterious glow`,
        mystery: `A strange letter arrived this morning with no return address. Inside, a cryptic message reads: "The truth lies where shadows meet light."\n\n**Choice A:** Visit the old lighthouse\n**Choice B:** Search the abandoned library`,
        default: `Your adventure begins in a world of endless possibilities. Before you lie two paths, each leading to unknown destinations.\n\n**Choice A:** Take the path of courage\n**Choice B:** Take the path of wisdom`,
      };

      const themeLower = theme.toLowerCase();
      storyText =
        storyTemplates[themeLower] ||
        storyTemplates[
          Object.keys(storyTemplates).find((k) => themeLower.includes(k))
        ] ||
        storyTemplates.default;
    }

    session.storyContext.push({ text: storyText, timestamp: Date.now() });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`📖 Your Story: ${theme}`)
      .setDescription(storyText)
      .setFooter({
        text: "Reply with A or B to continue the story!",
      });

    await message.channel.send({ embeds: [embed] });

    incCounter("dm_stories_started");
  } catch (error) {
    logger.error("[DM] Story generation failed", {
      error: error.message,
      userId: session.userId,
    });

    await message.channel.send(
      "❌ Failed to generate story. Please try again!"
    );
  }
}

/**
 * Show current session status
 */
async function showSessionStatus(message, session) {
  const uptime = Math.floor((Date.now() - session.createdAt) / 1000);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("📊 Session Status")
    .addFields(
      {
        name: "Mode",
        value: session.mode || "chat",
        inline: true,
      },
      {
        name: "Active Persona",
        value: session.persona?.name || "None",
        inline: true,
      },
      {
        name: "Messages",
        value: session.conversationHistory.length.toString(),
        inline: true,
      },
      {
        name: "Session Uptime",
        value: `${uptime}s`,
        inline: true,
      },
      {
        name: "Last Activity",
        value: `${lastActivity}s ago`,
        inline: true,
      }
    );

  if (session.gameState) {
    embed.addFields({
      name: "Game",
      value: `${session.gameState.type} (Round ${session.gameState.round}, Score: ${session.gameState.score})`,
      inline: false,
    });
  }

  await message.channel.send({ embeds: [embed] });
}

// Clean up old sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes

  for (const [userId, session] of dmSessions.entries()) {
    if (now - session.lastActivity > TIMEOUT) {
      dmSessions.delete(userId);
      logger.info("[DM] Session cleaned up", { userId });
    }
  }
}, 30 * 60 * 1000);
