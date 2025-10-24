/**
 * services/minigames/games/TriviaGame.js
 * Communiverse lore trivia game - bot can play as opponent
 */

import { BaseGame } from "../BaseGame.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../../util/logger.js";

export class TriviaGame extends BaseGame {
  async initialize() {
    await super.initialize();

    // Game-specific settings
    this.gameData = {
      totalQuestions: this.options.rounds || 5,
      currentQuestion: 0,
      questions: [],
      timeLimit: this.options.timeLimit || 30000, // 30 seconds per question
      difficulty: this.options.difficulty || "medium",
      currentQuestionStart: null,
      answers: new Map(), // Map<userId, answerIndex>
    };

    // Add bot as opponent if requested
    if (this.options.vsBot) {
      this.addBotOpponent();
    }
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();

    await this.channel.send({
      embeds: [
        {
          title: "🧠 Communiverse Trivia Challenge!",
          description: `Test your knowledge of the Elio universe!\n\n**Rules:**\n- ${this.gameData.totalQuestions} questions\n- ${this.gameData.timeLimit / 1000} seconds per question\n- Click the correct answer button\n- Fastest correct answer gets bonus points!`,
          color: 0x3498db,
          fields: [
            {
              name: "Players",
              value: this.players.map((p) =>
                p.isBot ? `🤖 ${p.username}` : `<@${p.userId}>`
              ).join("\n"),
              inline: false,
            },
          ],
        },
      ],
    });

    // Generate questions
    await this.generateQuestions();

    // Start first question
    setTimeout(() => this.askQuestion(), 2000);
  }

  async generateQuestions() {
    // Use AI service to generate questions from RAG if available
    if (this.options.aiService?.rag) {
      await this.generateQuestionsWithRAG();
    } else {
      // Fallback to hardcoded questions
      this.generateFallbackQuestions();
    }
  }

  async generateQuestionsWithRAG() {
    try {
      const { aiService, guildId } = this.options;

      // Search for diverse lore topics
      const topics = [
        "Elio Solis character",
        "Glordon personality",
        "Communiverse council",
        "Lord Grigon villain",
        "wormhole travel",
      ];

      for (const topic of topics.slice(0, this.gameData.totalQuestions)) {
        const ragResult = await aiService.rag.search({
          query: topic,
          guildId,
          topK: 1,
          generateAnswer: false,
        });

        if (ragResult.ok && ragResult.data.hits?.length > 0) {
          const context = ragResult.data.hits[0].chunk;

          // Use LLM to generate a trivia question from the context
          const llmResult = await aiService.llm.generate(
            `Based on this information about Elio/Communiverse:\n\n${context}\n\nGenerate a multiple-choice trivia question with 4 options (A, B, C, D). Format:\nQ: [question]\nA) [option 1]\nB) [option 2]\nC) [option 3]\nD) [option 4]\nCorrect: [A/B/C/D]`,
            { max_length: 200 }
          );

          if (llmResult.ok) {
            const question = this.parseGeneratedQuestion(llmResult.data.text);
            if (question) {
              this.gameData.questions.push(question);
            }
          }
        }
      }

      // Fill with fallback if needed
      while (this.gameData.questions.length < this.gameData.totalQuestions) {
        this.gameData.questions.push(this.getFallbackQuestion());
      }
    } catch (error) {
      logger.warn("[TRIVIA] RAG generation failed, using fallback", { error: error.message });
      this.generateFallbackQuestions();
    }
  }

  parseGeneratedQuestion(text) {
    try {
      const lines = text.trim().split("\n");
      const qLine = lines.find((l) => l.startsWith("Q:"));
      const options = lines.filter((l) => /^[A-D]\)/.test(l));
      const correctLine = lines.find((l) => l.startsWith("Correct:"));

      if (!qLine || options.length !== 4 || !correctLine) {
        return null;
      }

      const question = qLine.replace("Q:", "").trim();
      const correctAnswer = correctLine.match(/[A-D]/)?.[0];

      if (!correctAnswer) return null;

      return {
        question,
        options: options.map((o) => o.replace(/^[A-D]\)\s*/, "").trim()),
        correctIndex: correctAnswer.charCodeAt(0) - 65, // A=0, B=1, C=2, D=3
      };
    } catch (error) {
      return null;
    }
  }

  generateFallbackQuestions() {
    const questions = [
      {
        question: "Who is the main protagonist of Elio?",
        options: ["Glordon", "Elio Solis", "Lord Grigon", "Olga Solis"],
        correctIndex: 1,
      },
      {
        question: "What is Glordon's shape often compared to?",
        options: ["A star", "A potato", "A moon", "A comet"],
        correctIndex: 1,
      },
      {
        question: "Who is Elio's aunt?",
        options: ["Major Olga Solis", "Mira", "Questa", "Auva"],
        correctIndex: 0,
      },
      {
        question: "What is the name of the intergalactic alliance?",
        options: ["The Federation", "Communiverse", "The Empire", "Galactic Union"],
        correctIndex: 1,
      },
      {
        question: "Who is the main antagonist of Elio?",
        options: ["Caleb", "Glordon", "Lord Grigon", "Bryce"],
        correctIndex: 2,
      },
      {
        question: "What is Caleb's role?",
        options: ["Warrior", "Chef", "Chauffeur", "Scientist"],
        correctIndex: 2,
      },
      {
        question: "How do characters travel between planets?",
        options: ["Rockets", "Wormholes", "Teleportation", "Time travel"],
        correctIndex: 1,
      },
      {
        question: "What studio produced Elio?",
        options: ["DreamWorks", "Pixar", "Blue Sky", "Illumination"],
        correctIndex: 1,
      },
    ];

    // Shuffle and pick required number
    const shuffled = questions.sort(() => Math.random() - 0.5);
    this.gameData.questions = shuffled.slice(0, this.gameData.totalQuestions);
  }

  getFallbackQuestion() {
    const fallback = [
      {
        question: "What year was Elio released?",
        options: ["2023", "2024", "2025", "2026"],
        correctIndex: 2,
      },
    ];
    return fallback[0];
  }

  async askQuestion() {
    if (this.gameData.currentQuestion >= this.gameData.totalQuestions) {
      await this.endGame();
      return;
    }

    const question = this.gameData.questions[this.gameData.currentQuestion];
    this.gameData.currentQuestionStart = Date.now();
    this.gameData.answers.clear();

    // Build buttons for options
    const rows = [];
    const buttons = question.options.map((option, idx) =>
      new ButtonBuilder()
        .setCustomId(`trivia_answer_${this.sessionId}_${idx}`)
        .setLabel(option)
        .setStyle(ButtonStyle.Primary)
    );

    // Split into rows (max 5 buttons per row, we have 4)
    rows.push(new ActionRowBuilder().addComponents(buttons));

    await this.channel.send({
      embeds: [
        {
          title: `❓ Question ${this.gameData.currentQuestion + 1}/${this.gameData.totalQuestions}`,
          description: question.question,
          color: 0xf39c12,
          footer: { text: `You have ${this.gameData.timeLimit / 1000} seconds to answer!` },
        },
      ],
      components: rows,
    });

    // Bot answers if playing
    if (this.options.vsBot) {
      setTimeout(() => this.botAnswer(question), Math.random() * 5000 + 2000);
    }

    // Set timeout for question
    this.gameData.questionTimeout = setTimeout(
      () => this.timeoutQuestion(),
      this.gameData.timeLimit
    );
  }

  async botAnswer(question) {
    const botPlayer = this.players.find((p) => p.isBot);
    if (!botPlayer || this.gameData.answers.has(botPlayer.userId)) {
      return; // Already answered or not playing
    }

    // Bot has 80% chance to get it right (adjustable)
    const botAccuracy = this.options.botDifficulty === "easy" ? 0.6 : 0.8;
    const correctIdx = question.correctIndex;

    let answerIdx;
    if (Math.random() < botAccuracy) {
      answerIdx = correctIdx;
    } else {
      // Pick random wrong answer
      const wrongOptions = [0, 1, 2, 3].filter((i) => i !== correctIdx);
      answerIdx = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }

    await this.submitAnswer(botPlayer.userId, answerIdx);
  }

  async submitAnswer(userId, answerIndex) {
    if (this.gameData.answers.has(userId)) {
      return { ok: false, error: "Already answered" };
    }

    const player = this.getPlayer(userId);
    if (!player) {
      return { ok: false, error: "Not in game" };
    }

    const question = this.gameData.questions[this.gameData.currentQuestion];
    const isCorrect = answerIndex === question.correctIndex;

    this.gameData.answers.set(userId, answerIndex);

    // Calculate points (correct + speed bonus)
    if (isCorrect) {
      const timeElapsed = Date.now() - this.gameData.currentQuestionStart;
      const speedBonus = Math.max(
        0,
        Math.floor((this.gameData.timeLimit - timeElapsed) / 1000)
      );
      const points = 10 + speedBonus;

      player.score += points;

      if (!player.isBot) {
        await this.channel.send(
          `✅ <@${userId}> got it right! +${points} points (${speedBonus} speed bonus)`
        );
      } else {
        await this.channel.send(`🤖 Bot got it right! +${points} points`);
      }
    } else {
      if (!player.isBot) {
        await this.channel.send(`❌ <@${userId}> got it wrong!`);
      } else {
        await this.channel.send(`🤖 Bot got it wrong!`);
      }
    }

    // Check if all players answered
    if (this.gameData.answers.size >= this.players.length) {
      clearTimeout(this.gameData.questionTimeout);
      await this.nextQuestion();
    }

    return { ok: true, isCorrect, player };
  }

  async timeoutQuestion() {
    await this.channel.send({
      embeds: [
        {
          title: "⏰ Time's up!",
          description: `The correct answer was: **${
            this.gameData.questions[this.gameData.currentQuestion].options[
              this.gameData.questions[this.gameData.currentQuestion].correctIndex
            ]
          }**`,
          color: 0xe74c3c,
        },
      ],
    });

    await this.nextQuestion();
  }

  async nextQuestion() {
    this.gameData.currentQuestion++;

    if (this.gameData.currentQuestion >= this.gameData.totalQuestions) {
      await this.endGame();
    } else {
      setTimeout(() => this.askQuestion(), 3000);
    }
  }

  async endGame() {
    // Determine winner
    const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);
    this.winner = sortedPlayers[0];
    this.winner.won = true;

    await this.channel.send({
      embeds: [
        {
          title: "🏆 Trivia Complete!",
          description: `Winner: ${this.winner.isBot ? "🤖 Bot" : `<@${this.winner.userId}>`}`,
          color: 0x00ff00,
          fields: sortedPlayers.map((p, idx) => ({
            name: `${idx + 1}. ${p.isBot ? "🤖 Bot" : p.username}`,
            value: `${p.score} points`,
            inline: false,
          })),
        },
      ],
    });

    await this.end("completed");
  }

  async handleAction(userId, action, data = {}) {
    if (action === "answer") {
      return await this.submitAnswer(userId, data.answerIndex);
    }

    return { ok: false, error: "Unknown action" };
  }

  addBotOpponent() {
    this.players.push({
      userId: "bot_opponent",
      username: "Bot Opponent",
      score: 0,
      won: false,
      isBot: true,
    });
  }

  getGameName() {
    return "Communiverse Trivia";
  }
}

export default TriviaGame;
