/**
 * services/minigames/games/TriviaGame.js
 * Communiverse lore trivia game - CPU-only, fixed dataset with modes & scoring
 */

import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../../util/logger.js";
import { AI_ENABLED } from "../../../config.js";
import TrainingDataLoader from "../TrainingDataLoader.js";

const require = createRequire(import.meta.url);
const triviaData = require("../../../../data/minigames/trivia.json");
const triviaExpanded = require("../../../../data/minigames/trivia-expanded.json");

const ANSWER_COOLDOWN_MS = 1500;
const FAST_BONUS_MS = 4000;
const WRONG_PENALTY = 1;

export class TriviaGame extends BaseGame {
  async initialize() {
    await super.initialize();

    this.gameData = {
      totalQuestions: this.options.rounds || 5,
      currentQuestion: 0,
      questions: [],
      timeLimit: this.options.timeLimit || 30000, // ms
      difficulty: this.options.difficulty || "medium",
      topic: this.options.topic || "mixed",
      mode: this.options.mode || "standard", // standard | buzz
      currentQuestionStart: null,
      answers: new Map(), // userId -> { idx, at }
      lastAnswerAt: new Map(), // userId -> timestamp
      scores: new Map(), // userId -> score
    };

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
          description: `Rules:\n- ${this.gameData.totalQuestions} questions\n- ${this.gameData.timeLimit / 1000}s per question\n- Fast bonus if answered within ${FAST_BONUS_MS / 1000}s\n- Wrong answers: -${WRONG_PENALTY} pt\n- Mode: ${this.gameData.mode === "buzz" ? "Buzz (first correct ends)" : "Standard"}`,
          color: 0x3498db,
          fields: [
            {
              name: "Players",
              value: this.players
                .map((p) => (p.isBot ? `🤖 ${p.username}` : `<@${p.userId}>`))
                .join("\n"),
              inline: false,
            },
          ],
        },
      ],
    });

    this.generateQuestions();
    setTimeout(() => this.askQuestion(), 1500);
  }

  generateQuestions() {
    // First, try to get questions from training data
    const trainingQuestions = TrainingDataLoader.getRandomTrivia(
      this.gameData.totalQuestions * 2, // Get extra to have variety
      this.gameData.topic !== "mixed" ? this.gameData.topic : null
    );

    // Also get static questions from JSON files
    const topics = { ...(triviaData?.topics || {}), ...(triviaExpanded?.topics || {}) };
    let staticPool = [];

    if (this.gameData.topic === "mixed") {
      staticPool = Object.values(topics).flat();
    } else {
      staticPool = topics[this.gameData.topic] || [];
    }

    // Convert training questions to trivia format
    const trainingPool = trainingQuestions.map((tq: any) => ({
      question: tq.question,
      options: this.shuffleOptions([tq.correctAnswer, ...tq.wrongOptions]),
      correctIndex: 0, // Will be recalculated after shuffle
      _correctAnswer: tq.correctAnswer,
      source: "training",
      character: tq.character,
    })).map((q: any) => {
      // Fix correctIndex after shuffle
      q.correctIndex = q.options.findIndex((opt: any) => opt === q._correctAnswer);
      delete (q as any)._correctAnswer;
      return q;
    }).filter((q: any) => q.options.length >= 2 && q.correctIndex >= 0);

    // Merge pools - prioritize training data for variety
    let pool: any[] = [];
    if (trainingPool.length > 0) {
      pool = [...trainingPool];
      logger.info(`[TRIVIA] Loaded ${trainingPool.length} questions from training data`);
    }

    // Add static questions as fallback
    if (staticPool.length > 0) {
      const shuffledStatic = [...staticPool].sort(() => Math.random() - 0.5);
      pool = [...pool, ...shuffledStatic];
    }

    if (pool.length === 0) {
      logger.warn("[TRIVIA] No trivia dataset found, using empty list.");
      this.gameData.questions = [];
      return;
    }

    // Shuffle and select required number
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    this.gameData.questions = shuffled.slice(0, this.gameData.totalQuestions);

    logger.info(`[TRIVIA] Generated ${this.gameData.questions.length} questions`);
  }

  shuffleOptions(options: any[]) {
    const shuffled = [...options].filter(Boolean);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4); // Max 4 options
  }

  async askQuestion() {
    if (this.gameData.currentQuestion >= this.gameData.totalQuestions) {
      await this.endGame();
      return;
    }

    const question = this.gameData.questions[this.gameData.currentQuestion];
    this.gameData.currentQuestionStart = Date.now();
    this.gameData.answers.clear();
    this.gameData.lastAnswerAt.clear();

    const buttons = (question.options as any[]).map((option: any, idx: number) =>
      new ButtonBuilder()
        .setCustomId(`trivia_answer_${this.sessionId}_${idx}`)
        .setLabel(String(option))
        .setStyle(ButtonStyle.Primary)
    );

    const row: any = new ActionRowBuilder().addComponents(buttons as any);

    await this.channel.send({
      embeds: [
        {
          title: `❓ Question ${this.gameData.currentQuestion + 1}/${this.gameData.totalQuestions}`,
          description: question.question,
          color: 0xf39c12,
          footer: { text: `You have ${this.gameData.timeLimit / 1000}s to answer!` },
        },
      ],
      components: [row],
    });

    if (this.options.vsBot) {
      setTimeout(() => this.botAnswer(question), Math.random() * 5000 + 2000);
    }

    this.gameData.questionTimeout = setTimeout(
      () => this.timeoutQuestion(),
      this.gameData.timeLimit
    );
  }

  async botAnswer(question: any) {
    const botPlayer = this.players.find((p) => p.isBot);
    if (!botPlayer || this.gameData.answers.has(botPlayer.userId)) return;

    const botAccuracy = this.options.botDifficulty === "easy" ? 0.6 : 0.8;
    const correctIdx = question.correctIndex;
    let answerIdx;
    if (Math.random() < botAccuracy) {
      answerIdx = correctIdx;
    } else {
      const wrongOptions = [0, 1, 2, 3].filter((i) => i !== correctIdx);
      answerIdx = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }

    await this.submitAnswer(botPlayer.userId, answerIdx);
  }

  async submitAnswer(userId: string, answerIndex: number) {
    const now = Date.now();
    const last = this.gameData.lastAnswerAt.get(userId) || 0;
    if (now - last < ANSWER_COOLDOWN_MS) {
      return { ok: false, error: "Too fast. Wait before answering again." };
    }
    this.gameData.lastAnswerAt.set(userId, now);

    if (this.gameData.answers.has(userId)) {
      return { ok: false, error: "Already answered" };
    }

    const player = this.getPlayer(userId);
    if (!player) {
      return { ok: false, error: "Not in game" };
    }

    const question = this.gameData.questions[this.gameData.currentQuestion];
    const isCorrect = answerIndex === question.correctIndex;

    this.gameData.answers.set(userId, { idx: answerIndex, at: now });

    if (this.gameData.mode === "buzz" && isCorrect) {
      clearTimeout(this.gameData.questionTimeout);
      await this.resolveQuestion(true);
      return { ok: true, isCorrect, player };
    }

    if (this.gameData.answers.size >= this.players.length) {
      clearTimeout(this.gameData.questionTimeout);
      await this.resolveQuestion(false);
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

    await this.resolveQuestion(false);
  }

  async resolveQuestion(early = false) {
    const question = this.gameData.questions[this.gameData.currentQuestion];
    const correctIdx = question.correctIndex;

    const results = [];
    for (const [userId, entry] of this.gameData.answers.entries()) {
      const { idx, at } = entry;
      const isCorrect = idx === correctIdx;
      results.push({ userId, answerIndex: idx, isCorrect, at });

      const current = this.gameData.scores.get(userId) || 0;
      let delta = 0;
      if (isCorrect) {
        delta = 2;
        if (at - this.gameData.currentQuestionStart <= FAST_BONUS_MS) delta += 1;
      } else {
        delta = -WRONG_PENALTY;
      }
      this.gameData.scores.set(userId, current + delta);
    }

    await this.channel.send({
      embeds: [
        {
          title: "✅ Answer revealed",
          description: `Correct answer: **${question.options[correctIdx]}**`,
          color: 0x2ecc71,
          fields: results.map((r) => ({
            name: `<@${r.userId}>`,
            value: `${r.isCorrect ? "✅ Correct" : "❌ Wrong"} (${question.options[r.answerIndex]})`,
            inline: false,
          })),
        },
      ],
    });

    const flavor = await this.generateFlavor(question.question);
    if (flavor) {
      await this.channel.send({ content: flavor });
    }

    if (this.gameData.scores.size > 0) {
      await this.channel.send({
        embeds: [
          {
            title: "📊 Scoreboard",
            color: 0x3498db,
            fields: (Array.from(this.gameData.scores.entries()) as Array<[string, number]>)
              .sort((a, b) => b[1] - a[1])
              .map(([uid, score]) => ({
                name: `<@${uid}>`,
                value: `${score} pts`,
                inline: true,
              })),
          },
        ],
      });
    }

    this.gameData.currentQuestion++;

    if (this.gameData.currentQuestion >= this.gameData.totalQuestions) {
      await this.endGame();
      return;
    }

    setTimeout(() => this.askQuestion(), early ? 1500 : 3000);
  }

  async endGame() {
    const scoreList = (Array.from(this.gameData.scores.entries()) as Array<[string, number]>).sort(
      (a, b) => b[1] - a[1]
    );
    const sortedPlayers = scoreList
      .map(([uid, score]) => {
        const player: any =
          this.players.find((p) => p.userId === uid) || { userId: uid, username: uid, score: 0, won: false };
        player.score = score;
        return player;
      })
      .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));

    this.winner = sortedPlayers[0] || null;
    if (this.winner) this.winner.won = true;

    await this.channel.send({
      embeds: [
        {
          title: "🏆 Trivia Complete!",
          description: this.winner
            ? `Winner: ${this.winner.isBot ? "🤖 Bot" : `<@${this.winner.userId}>`}`
            : "No winner",
          color: 0x00ff00,
          fields: (sortedPlayers as any[]).map((p: any, idx: number) => ({
            name: `${idx + 1}. ${p.isBot ? "🤖 Bot" : p.username}`,
            value: `${p.score} points`,
            inline: false,
          })),
        },
      ],
    });

    await this.end("completed");
  }

  async generateFlavor(seed: string) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed: seed || "trivia",
        maxLen: 20,
        temperature: 0.9,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) {
        return `_${res.data.text}_`;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.debug("[TRIVIA] Markov flavor failed", { error: msg });
    }
    return "";
  }

  async handleAction(userId: string, action: string, data: any = {}) {
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
