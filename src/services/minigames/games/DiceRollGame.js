import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { COOLDOWNS } from "../../../config/cooldowns.js";
import { AI_ENABLED } from "../../../config.js";

const require = createRequire(import.meta.url);
const diceConfig = require("../../../../data/minigames/dice-roll.json");

export class DiceRollGame extends BaseGame {
  async initialize() {
    await super.initialize();

    this.gameData = {
      sides: this.options.sides ?? diceConfig.sides,
      maxRounds: this.options.maxRounds ?? diceConfig.maxRounds,
      rolls: [], // { userId, value }
      rolledUsers: [],
      lastRollAt: new Map(),
    };
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    this.currentTurn = 0;

    const button = new ButtonBuilder()
      .setCustomId(`dice-roll_roll_${this.sessionId}`)
      .setLabel("Roll 🎲")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await this.channel.send({
      embeds: [
        {
          title: "🎲 Dice Duel",
          description: `Click **Roll** to throw a d${this.gameData.sides}. Highest roll wins. One roll per player, up to ${this.gameData.maxRounds} rolls.`,
          color: 0x9b59b6,
        },
      ],
      components: [row],
    });
  }

  async handleAction(userId, action) {
    if (this.status !== "active") {
      return { ok: false, error: "Game already ended" };
    }

    if (action !== "roll") {
      return { ok: false, error: "Unknown action" };
    }

    if (this.gameData.rolledUsers.includes(userId)) {
      return { ok: false, error: "You already rolled in this round." };
    }

    const now = Date.now();
    const last = this.gameData.lastRollAt.get(userId) || 0;
    if (now - last < COOLDOWNS.diceMs) {
      return { ok: false, error: "Too fast. Wait a moment before rolling again." };
    }
    this.gameData.lastRollAt.set(userId, now);

    const player = this.getPlayer(userId) || { userId, username: "player" };
    if (!this.getPlayer(userId)) {
      this.addPlayer({ id: userId, username: player.username });
    }

    const roll = this.randomRoll();

    this.gameData.rolledUsers.push(userId);
    this.gameData.rolls.push({ userId, value: roll });

    await this.channel.send(`<@${userId}> rolled **${roll}** 🎯`);
    const flavor = await this.generateFlavor(`roll ${roll}`);
    if (flavor) {
      await this.channel.send(flavor);
    }

    if (this.gameData.rolls.length >= this.gameData.maxRounds) {
      this.finishGame();
      return { ok: true, endReason: "max_rounds" };
    }

    return { ok: true };
  }

  finishGame() {
    if (this.status === "ended") return;
    this.status = "ended";

    const sorted = [...this.gameData.rolls].sort(
      (a, b) => b.value - a.value
    );

    if (sorted.length > 0) {
      const top = sorted[0];
      this.winner = this.getPlayer(top.userId) || { userId: top.userId };
      this.winner.won = true;
    }
  }

  randomRoll() {
    return Math.floor(Math.random() * this.gameData.sides) + 1;
  }

  getGameName() {
    return "Dice Duel";
  }

  getStatusEmbed() {
    const summary =
      this.gameData.rolls.length > 0
        ? this.gameData.rolls
            .map((r) => `<@${r.userId}> rolled ${r.value}`)
            .join("\n")
        : "No rolls yet.";

    return {
      title: "🎲 Dice Duel",
      description: `Rolls so far: ${this.gameData.rolls.length}/${this.gameData.maxRounds}`,
      color: 0x9b59b6,
      fields: [
        {
          name: "Results",
          value: summary,
        },
      ],
    };
  }

  getEndMessage() {
    if (this.winner) {
      return `<@${this.winner.userId}> wins the dice duel!`;
    }
    return "No rolls recorded.";
  }

  async generateFlavor(seed) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed: seed || "dice",
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

export default DiceRollGame;
