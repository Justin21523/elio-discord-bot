/**
 * services/minigames/games/ReactionGame.js
 * Fast-paced reaction game - click the button as fast as you can
 */

import { BaseGame } from "../BaseGame.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export class ReactionGame extends BaseGame {
  async initialize() {
    await super.initialize();

    this.gameData = {
      rounds: this.options.rounds || 5,
      currentRound: 0,
      reactionTimes: new Map(), // Map<userId, Array<reactionTime>>
    };

    // Initialize player reaction times
    for (const player of this.players) {
      this.gameData.reactionTimes.set(player.userId, []);
    }
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();

    await this.channel.send({
      embeds: [
        {
          title: "⚡ Reaction Speed Challenge!",
          description: `Click the button as fast as you can when it appears!\n\n**${this.gameData.rounds}** rounds`,
          color: 0xe74c3c,
        },
      ],
    });

    setTimeout(() => this.startRound(), 2000);
  }

  async startRound() {
    if (this.gameData.currentRound >= this.gameData.rounds) {
      await this.endGame();
      return;
    }

    // Wait random time (1-5 seconds)
    const delay = Math.random() * 4000 + 1000;

    await this.channel.send(`⏳ Round ${this.gameData.currentRound + 1} - Get ready...`);

    setTimeout(async () => {
      this.gameData.roundStartTime = Date.now();
      this.gameData.clicked = new Set();

      const button = new ButtonBuilder()
        .setCustomId(`reaction_click_${this.sessionId}_${this.gameData.currentRound}`)
        .setLabel("CLICK ME!")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(button);

      await this.channel.send({
        content: "⚡ **NOW!**",
        components: [row],
      });
    }, delay);
  }

  async handleAction(userId, action, data = {}) {
    if (action === "click") {
      if (this.gameData.clicked.has(userId)) {
        return { ok: false, error: "Already clicked" };
      }

      const reactionTime = Date.now() - this.gameData.roundStartTime;
      this.gameData.clicked.add(userId);

      const times = this.gameData.reactionTimes.get(userId) || [];
      times.push(reactionTime);
      this.gameData.reactionTimes.set(userId, times);

      await this.channel.send(`<@${userId}> reacted in **${reactionTime}ms**!`);

      // Check if all players clicked
      if (this.gameData.clicked.size >= this.players.length) {
        this.gameData.currentRound++;
        setTimeout(() => this.startRound(), 2000);
      }

      return { ok: true, reactionTime };
    }

    return { ok: false, error: "Unknown action" };
  }

  async endGame() {
    // Calculate average reaction times
    const results = this.players.map((player) => {
      const times = this.gameData.reactionTimes.get(player.userId) || [];
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      return { ...player, avgTime: Math.round(avg) };
    });

    results.sort((a, b) => a.avgTime - b.avgTime);
    this.winner = results[0];
    this.winner.won = true;

    await this.channel.send({
      embeds: [
        {
          title: "🏁 Reaction Game Complete!",
          description: `Winner: <@${this.winner.userId}>`,
          color: 0x00ff00,
          fields: results.map((p, idx) => ({
            name: `${idx + 1}. ${p.username}`,
            value: `Avg: ${p.avgTime}ms`,
            inline: false,
          })),
        },
      ],
    });

    await this.end("completed");
  }

  getGameName() {
    return "Reaction Speed";
  }
}

export default ReactionGame;
