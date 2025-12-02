import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { COOLDOWNS } from "../../../config/cooldowns.js";
import { AI_ENABLED } from "../../../config.js";

const require = createRequire(import.meta.url);
const guessConfig = require("../../../../data/minigames/guess-number.json");

export class GuessNumberGame extends BaseGame {
  async initialize() {
    await super.initialize();

    const min = this.options.min ?? guessConfig.min;
    const max = this.options.max ?? guessConfig.max;
    const maxAttempts = this.options.maxAttempts ?? guessConfig.maxAttempts;
    const target =
      typeof this.options.targetNumber === "number"
        ? this.options.targetNumber
        : Math.floor(Math.random() * (max - min + 1)) + min;

    this.gameData = {
      min,
      max,
      target,
      maxAttempts,
      attemptsLeft: maxAttempts,
      guesses: [],
      lastGuessAt: new Map(),
    };
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    this.currentTurn = 0;

    const flavor = await this.generateFlavor("guess number");

    await this.channel.send({
      embeds: [
        {
          title: "🔢 Guess the Number",
          description: `I'm thinking of a number between **${this.gameData.min}** and **${this.gameData.max}**.\nUse \`/minigame guess value:<number>\` to submit. You have **${this.gameData.maxAttempts}** attempts.${flavor ? `\n\n${flavor}` : ""}`,
          color: 0xf1c40f,
        },
      ],
    });
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") {
      return { ok: false, error: "Game already ended" };
    }

    if (action !== "guess") {
      return { ok: false, error: "Unknown action" };
    }

    const now = Date.now();
    const last = this.gameData.lastGuessAt.get(userId) || 0;
    if (now - last < COOLDOWNS.guessMs) {
      return { ok: false, error: "You're guessing too fast. Wait a moment." };
    }
    this.gameData.lastGuessAt.set(userId, now);

    const value = Number(data.value);
    if (Number.isNaN(value)) {
      return { ok: false, error: "Please provide a valid number." };
    }

    if (value < this.gameData.min || value > this.gameData.max) {
      return {
        ok: false,
        error: `Guess must be between ${this.gameData.min} and ${this.gameData.max}.`,
      };
    }

    const player = this.getPlayer(userId) || { userId, username: "player" };
    this.gameData.guesses.push({ userId, value });
    this.gameData.attemptsLeft -= 1;

    if (value === this.gameData.target) {
      this.winner = player;
      this.winner.won = true;
      this.status = "ended";

      await this.channel.send(
        `🎉 <@${userId}> guessed **${value}** correctly!`
      );

      return { ok: true, endReason: "guessed" };
    }

    if (this.gameData.attemptsLeft <= 0) {
      this.status = "ended";
      await this.channel.send(
        `❌ Out of attempts! The number was **${this.gameData.target}**.`
      );
      return { ok: true, endReason: "out_of_attempts" };
    }

    const hint = value < this.gameData.target ? "higher" : "lower";
    const flavor = await this.generateFlavor(`guess ${value} ${hint}`);
    await this.channel.send(
      `🤔 <@${userId}> guessed **${value}** — try **${hint}**! Attempts left: **${this.gameData.attemptsLeft}**${flavor ? `\n${flavor}` : ""}`
    );

    return { ok: true };
  }

  getGameName() {
    return "Guess the Number";
  }

  getStatusEmbed() {
    return {
      title: "🔢 Guess the Number",
      description: `Range: ${this.gameData.min}-${this.gameData.max}\nAttempts left: ${this.gameData.attemptsLeft}`,
      color: 0xf1c40f,
      fields: [
        {
          name: "Guesses",
          value:
            this.gameData.guesses.length > 0
              ? this.gameData.guesses
                  .map((g) => `<@${g.userId}>: ${g.value}`)
                  .join("\n")
              : "No guesses yet",
          inline: false,
        },
      ],
    };
  }

  getEndMessage(reason) {
    if (reason === "guessed" && this.winner) {
      return `<@${this.winner.userId}> guessed the number!`;
    }
    if (reason === "out_of_attempts") {
      return `No one guessed it. The number was **${this.gameData.target}**.`;
    }
    return "Game ended.";
  }

  async generateFlavor(seed) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed: seed || "guess",
        maxLen: 12,
        temperature: 0.9,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return `_${res.data.text}_`;
    } catch (e) {
      // ignore
    }
    return "";
  }
}

export default GuessNumberGame;
