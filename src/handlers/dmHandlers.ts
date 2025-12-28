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
import { detectPersona } from "../services/personaSwitcher.js";
import {
  checkLlamaHealth,
  generatePersonaReply,
  isLlamaEnabled,
} from "../services/ai/adapters/llamaCppAdapter.js";
import {
  detectThirdPerson,
  ensureCompleteSentence,
  fixThirdPersonPronouns,
  removeFormatLeakage,
} from "../utils/pronounFilter.js";

// DM Session storage (in-memory for now)
const dmSessions = new Map<string, any>();

// Cache llama.cpp server availability (check every 60 seconds)
let llamaServerAvailable: boolean | null = null;
let lastLlamaCheck = 0;
const LLAMA_CHECK_INTERVAL_MS = 60000; // 1 minute

async function isLlamaServerAvailable(): Promise<boolean> {
  const now = Date.now();
  if (
    llamaServerAvailable !== null &&
    now - lastLlamaCheck < LLAMA_CHECK_INTERVAL_MS
  ) {
    return llamaServerAvailable;
  }

  if (isLlamaEnabled()) {
    const health = await checkLlamaHealth();
    llamaServerAvailable = health.ok;
    lastLlamaCheck = now;
    if (!health.ok) {
      logger.warn("[DM] llama.cpp server unavailable", { status: health.status });
    }
    return llamaServerAvailable;
  }

  return false;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Handle DM messages with AI-powered responses
 * @param {Message} message - Discord DM message
 * @param {Object} services - Bot services
 */
export async function handleDMMessage(message: any, services: any) {
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
  } catch (error: any) {
    logger.error("[DM] Error handling DM", {
      error: error?.message,
      stack: error?.stack,
    });

    await message.channel.send(
      "❌ Sorry, something went wrong! Try again or use `!help` for assistance."
    );
  }
}

/**
 * Get or create a DM session for a user
 */
function getOrCreateSession(userId: string) {
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
async function handleDMCommand(message: any, session: any, services: any) {
  const args = message.content.slice(1).trim().split(/\s+/);
  const command = (args[0] ?? "").toLowerCase();

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
 * Show DM help menu - comprehensive command guide
 * Exported for use in channel !help command
 */
export async function showDMHelp(message: any) {
  // Send multiple embeds for comprehensive help

  // Embed 1: DM Commands
  const dmEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🤖 Elio Bot - Complete Command Guide")
    .setDescription(
      "Welcome! This is your complete guide to using Elio Bot.\n" +
      "You can use commands in DMs or servers."
    )
    .addFields(
      {
        name: "━━━━━━━━ DM Commands ━━━━━━━━",
        value: "These commands work in Direct Messages:",
        inline: false,
      },
      {
        name: "💬 Chat",
        value: "Just send any message to chat with AI! I'll remember our conversation.",
        inline: false,
      },
      {
        name: "🎭 !persona <name>",
        value: "Chat with a specific character\n`!persona Elio` · `!persona Glordon` · `!persona Caleb`",
        inline: false,
      },
      {
        name: "🎮 !game <type>",
        value: "Start a mini game in DM\n`!game trivia` · `!game riddle` · `!game story`",
        inline: false,
      },
      {
        name: "📖 !story <theme>",
        value: "Generate an interactive story\n`!story space adventure` · `!story mystery`",
        inline: false,
      },
      {
        name: "🗑️ !clear",
        value: "Clear conversation history",
        inline: true,
      },
      {
        name: "📊 !status",
        value: "Show session status",
        inline: true,
      }
    );

  // Embed 2: Server Slash Commands - Games
  const gamesEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎮 Server Commands - Games & Fun")
    .setDescription("Use these slash commands in any server with the bot:")
    .addFields(
      {
        name: "/minigame start <type>",
        value:
          "Start a mini-game! Types:\n" +
          "• `trivia` - Test your knowledge\n" +
          "• `adventure` - Choose your path\n" +
          "• `reaction` - Test reflexes\n" +
          "• `battle` - Turn-based duel\n" +
          "• `dice-roll` - Dice duel\n" +
          "• `guess-number` - Logic game\n" +
          "Options: `vs_bot`, `rounds`, `topic`, `mode`",
        inline: false,
      },
      {
        name: "/minigame recommend",
        value: "Get personalized game recommendations",
        inline: true,
      },
      {
        name: "/minigame stats",
        value: "View your game statistics",
        inline: true,
      },
      {
        name: "/minigame stop",
        value: "Stop current game",
        inline: true,
      },
      {
        name: "/game start",
        value: "Quick reaction game",
        inline: true,
      },
      {
        name: "/loot pull",
        value: "Draw random items",
        inline: true,
      },
      {
        name: "/inventory list",
        value: "View your items",
        inline: true,
      }
    );

  // Embed 3: AI & Chat Commands
  const aiEmbed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🤖 Server Commands - AI & Chat")
    .addFields(
      {
        name: "/ai ask <question>",
        value: "Ask AI a question using RAG (lore-grounded answers)",
        inline: false,
      },
      {
        name: "/ai check",
        value: "Check AI service health",
        inline: true,
      },
      {
        name: "/greet now",
        value: "Get a greeting from a character",
        inline: true,
      },
      {
        name: "/persona list",
        value: "View all available personas",
        inline: false,
      },
      {
        name: "/persona meet <name>",
        value: "Have a persona appear in channel",
        inline: true,
      },
      {
        name: "/persona ask <name> <question>",
        value: "Ask a persona a question",
        inline: true,
      },
      {
        name: "/story generate <prompt>",
        value: "Generate an AI story",
        inline: false,
      },
      {
        name: "/rag query <question>",
        value: "Search the knowledge base",
        inline: true,
      }
    );

  // Embed 4: Economy & Profile
  const economyEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("💰 Server Commands - Economy & Profile")
    .addFields(
      {
        name: "/points balance",
        value: "Check your points",
        inline: true,
      },
      {
        name: "/points award <user> <amount>",
        value: "Give points (admin)",
        inline: true,
      },
      {
        name: "/profile [user]",
        value: "View profile and stats",
        inline: true,
      },
      {
        name: "/leaderboard [limit]",
        value: "View server rankings",
        inline: true,
      },
      {
        name: "/drop set <time> <channel>",
        value: "Schedule daily drops",
        inline: true,
      },
      {
        name: "/drop now",
        value: "Drop media now",
        inline: true,
      }
    );

  // Embed 5: Admin Commands
  const adminEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("⚙️ Server Commands - Admin & Config")
    .setDescription("These require appropriate permissions:")
    .addFields(
      {
        name: "/config-proactive get/set",
        value: "Configure proactive AI features (meme drops, auto-chat, etc.)",
        inline: false,
      },
      {
        name: "/scenario start",
        value: "Start interactive scenario quiz",
        inline: true,
      },
      {
        name: "/schedule list/cancel",
        value: "Manage scheduled jobs",
        inline: true,
      },
      {
        name: "/admin-data update/status",
        value: "Manage dynamic data",
        inline: true,
      },
      {
        name: "/history sync/search",
        value: "Manage channel history",
        inline: true,
      },
      {
        name: "/privacy settings",
        value: "Manage your data privacy",
        inline: true,
      }
    )
    .setFooter({
      text: "💡 Use /help in servers for quick access | Powered by AI",
    })
    .setTimestamp();

  // Send all embeds
  await message.channel.send({ embeds: [dmEmbed] });
  await message.channel.send({ embeds: [gamesEmbed] });
  await message.channel.send({ embeds: [aiEmbed] });
  await message.channel.send({ embeds: [economyEmbed] });
  await message.channel.send({ embeds: [adminEmbed] });

  incCounter("dm_help_views");
}

/**
 * Handle persona selection/chat
 */
async function handlePersonaCommand(message: any, session: any, services: any, args: string[]) {
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
 * Supports persona detection via keywords and displays persona avatar using embeds
 */
async function handleDMChat(message: any, session: any, services: any) {
  const ai = services.ai;

  try {
    // STEP 1: Detect persona from keywords (like channel behavior)
    let activePersona = null;
    let usePersonaAvatar = false; // Only show avatar when persona is explicitly detected

    // Try keyword-based persona detection
    const detection = await detectPersona(
      message.content,
      null,
      services,
      "dm" // No guild ID in DMs
    );

    if (detection.persona && detection.confidence > 0.5) {
      // Found a persona via keywords - load full persona data
      const personaResult = await getPersona(detection.persona);
      if (personaResult.ok) {
        activePersona = personaResult.data;
        usePersonaAvatar = true; // Show avatar for keyword-triggered persona

        // Only update session persona if it's a high confidence match
        if (detection.confidence > 0.7) {
          session.persona = activePersona;
        }

        logger.info("[DM] Persona detected from keywords", {
          userId: session.userId,
          persona: activePersona.name,
          confidence: detection.confidence,
          reason: detection.reason,
        });
      }
    }

    // If no keyword match but we have an active session persona, use it (but without avatar)
    if (!activePersona && session.persona) {
      activePersona = session.persona;
      usePersonaAvatar = false; // No avatar for continuation messages
    }

    // Default to Elio if no persona detected (no avatar for default)
    if (!activePersona) {
      const defaultPersonaResult = await getPersona("Elio");
      if (defaultPersonaResult.ok) {
        activePersona = defaultPersonaResult.data;
        usePersonaAvatar = false; // No avatar for default
      }
    }

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

    // Show typing indicator (best-effort)
    await message.channel.sendTyping().catch(() => {});

    // Generate AI response (prefer llama.cpp; fallback to personaLogic)
    let response = "";
    let strategyUsed = "fallback";

    // Build history for personaLogic
    // IMPORTANT: exclude the current user message we just appended above; it is passed separately.
    const historyPayload = session.conversationHistory
      .slice(0, -1)
      .slice(-5)
      .map((h: any) => ({
        role: h.role,
        content: h.content,
      }));

    // Prefer llama.cpp if enabled and reachable (cached, 60s TTL)
    const llamaAvailable = await isLlamaServerAvailable();
    if (llamaAvailable) {
      try {
        logger.info("[DM] Using llama.cpp for DM reply", {
          persona: activePersona?.name || "Elio",
          messageLength: message.content.length,
        });

        const llamaRes = await generatePersonaReply(
          message.content,
          activePersona,
          historyPayload,
          { maxTokens: 80 }
        );

        if (llamaRes?.ok && llamaRes.data?.text) {
          response = String(llamaRes.data.text).trim();
          strategyUsed = "llama.cpp";
          logger.info("[DM] llama.cpp reply generated", {
            latencyMs: llamaRes.data.latencyMs,
            tokensPredicted: llamaRes.data.tokensPredicted,
            responseLength: response.length,
          });
        } else {
          logger.warn("[DM] llama.cpp returned invalid response", {
            ok: llamaRes?.ok,
            errorCode: llamaRes?.error?.code,
            errorMsg: llamaRes?.error?.message,
          });
          // Invalidate cache so next request re-checks
          llamaServerAvailable = null;
        }
      } catch (error: any) {
        logger.error("[DM] llama.cpp threw error", {
          error: error?.message,
          stack: error?.stack,
        });
        llamaServerAvailable = null;
      }
    }

    // Fallback: CPU-only personaLogic service (if available)
    if (!response && ai?.personaLogic?.reply) {
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
          maxLen: 120, // API limit is 120
        });

        logger.debug("[DM] personaLogic.reply result", {
          ok: logicRes?.ok,
          hasData: !!logicRes?.data,
          hasText: !!logicRes?.data?.text,
          textLength: logicRes?.data?.text?.length,
          strategy: logicRes?.data?.strategy,
        });

        if (logicRes?.ok && logicRes.data?.text) {
          response = String(logicRes.data.text).trim();
          strategyUsed = "personaLogic";
          logger.info("[DM] Using personaLogic response", {
            strategy: logicRes.data.strategy,
            responseLength: response.length,
            mood: logicRes.data.mood,
          });
        } else {
          logger.warn("[DM] personaLogic returned invalid response", {
            ok: logicRes?.ok,
            errorCode: logicRes?.error?.code,
            errorMsg: logicRes?.error?.message,
          });
        }
      } catch (error: any) {
        logger.error("[DM] personaLogic.reply threw error", {
          error: error.message,
          stack: error.stack,
        });
      }
    }

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
        fallbackResponses[
          Math.floor(Math.random() * fallbackResponses.length)
        ] ??
        fallbackResponses[0] ??
        "Tell me more about that.";
      logger.debug("[DM] Used fallback response");
    }

    // Apply the same safety/cleanup as guild chat
    const personaName = activePersona?.name || "Elio";
    response = removeFormatLeakage(response, personaName);
    const hadThirdPerson = detectThirdPerson(response, personaName);
    if (hadThirdPerson) {
      logger.warn("[DM] Third-person detected in response, applying filter", {
        persona: personaName,
      });
    }
    response = fixThirdPersonPronouns(response, personaName);
    response = ensureCompleteSentence(response);

    // Ensure response doesn't exceed Discord's message limit
    if (response.length > 2000) {
      response = response.substring(0, 1997) + "...";
    }

    // Add AI response to history
    session.conversationHistory.push({
      role: "assistant",
      content: response,
      timestamp: Date.now(),
    });

    // STEP 2: Send response - only use persona embed when explicitly triggered
    if (usePersonaAvatar && activePersona) {
      // Persona was explicitly detected - show avatar
      await sendAsPersonaInDM(message.channel, activePersona, response);
    } else {
      // No persona keyword detected - send plain text (like channel behavior)
      await message.channel.send(response);
    }

    incCounter("dm_chat_messages", {
      has_persona: activePersona ? "yes" : "no",
      persona: activePersona?.name || "none",
      used_avatar: usePersonaAvatar ? "yes" : "no",
      strategy: strategyUsed,
    });

    logger.info("[DM] Chat response sent", {
      userId: session.userId,
      persona: activePersona?.name || "none",
      responseLength: response.length,
      usedAvatar: usePersonaAvatar,
      strategy: strategyUsed,
    });
  } catch (error: any) {
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
 * Send a message as a persona in DM (using embed with avatar since webhooks don't work in DMs)
 * @param {DMChannel} channel - DM channel
 * @param {Object} persona - Persona object with name, avatar, color
 * @param {string} content - Message content
 */
async function sendAsPersonaInDM(channel: any, persona: any, content: any) {
  if (!persona) {
    // No persona - send as regular bot message
    await channel.send(content);
    return;
  }

  // Get avatar URL - support both `avatar` and `avatarUrl` fields
  const avatarUrl = persona.avatar || persona.avatarUrl || persona.image;

  // Debug log for avatar
  logger.debug("[DM] Sending as persona", {
    personaName: persona.name,
    avatarUrl: avatarUrl || "none",
    personaFields: Object.keys(persona),
  });

  // Get persona color or default (handle hex string or number)
  let color = persona.color || 0x5865f2;
  if (typeof color === "string") {
    color = parseInt(color.replace("#", ""), 16);
  }

  // Build embed that simulates persona appearance
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: persona.name,
      iconURL: avatarUrl || undefined,
    })
    .setDescription(content);

  // Add persona thumbnail for more visual presence
  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  await channel.send({ embeds: [embed] });
}

/**
 * Start a DM mini game
 */
async function startDMGame(message: any, session: any, services: any, args: string[]) {
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
async function startTriviaGame(message: any, session: any, services: any) {
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
    if (!trivia) {
      await message.channel.send(
        "❌ Failed to load a trivia question. Please try again!"
      );
      return;
    }
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
  } catch (error: any) {
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
async function startRiddleGame(message: any, session: any, services: any) {
  // Similar to trivia but with riddles
  await message.channel.send(
    "🧩 **Riddle Game**\n\nComing soon! Try `!game trivia` instead."
  );
}

/**
 * Start interactive story game
 */
async function startStoryGame(message: any, session: any, services: any) {
  // Interactive choose-your-own-adventure style
  await message.channel.send(
    "📖 **Story Game**\n\nComing soon! Try `!story <theme>` for story generation."
  );
}

/**
 * Start AI story generation (CPU-only using Markov/template system)
 */
async function startDMStory(message: any, session: any, services: any, args: string[]) {
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
      } catch (error: any) {
        logger.warn("[DM] Markov story generation failed", {
          error: error.message,
        });
      }
    }

    // Fallback: Use pre-defined story templates
    if (!storyText) {
      const storyTemplates: Record<string, string> = {
        "space adventure": `You find yourself aboard a mysterious spacecraft drifting through the cosmos. The stars twinkle outside the viewport as you notice two doors ahead.\n\n**Choice A:** Open the door marked "Bridge"\n**Choice B:** Open the door marked "Engine Room"`,
        adventure: `You stand at the edge of an ancient forest. The path ahead splits into two directions. To the left, you hear rushing water. To the right, a faint glow flickers through the trees.\n\n**Choice A:** Follow the sound of water\n**Choice B:** Investigate the mysterious glow`,
        mystery: `A strange letter arrived this morning with no return address. Inside, a cryptic message reads: "The truth lies where shadows meet light."\n\n**Choice A:** Visit the old lighthouse\n**Choice B:** Search the abandoned library`,
        default: `Your adventure begins in a world of endless possibilities. Before you lie two paths, each leading to unknown destinations.\n\n**Choice A:** Take the path of courage\n**Choice B:** Take the path of wisdom`,
      };

      const themeLower = theme.toLowerCase();
      const partialMatchKey = Object.keys(storyTemplates).find((k) =>
        themeLower.includes(k)
      );
      storyText =
        storyTemplates[themeLower] ||
        (partialMatchKey ? storyTemplates[partialMatchKey] : undefined) ||
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
  } catch (error: any) {
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
async function showSessionStatus(message: any, session: any) {
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
