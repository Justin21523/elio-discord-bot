/**
 * services/minigames/games/AdventureGame.js
 * Branching story with voting, items, rewards/penalties (CPU-only)
 */

import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../../util/logger.js";
import { AI_ENABLED } from "../../../config.js";
import { logEvent } from "../../analytics/events.js";

const require = createRequire(import.meta.url);
const adventureData = require("../../../../data/minigames/adventure.json");

const VOTE_TIMEOUT_MS = 20_000;
const VOTE_COOLDOWN_MS = 1500;

export class AdventureGame extends BaseGame {
  async initialize() {
    await super.initialize();

    this.gameData = {
      nodeId: "start",
      inventory: new Set(this.options.keyItems || []),
      votes: new Map(), // userId -> choiceIdx
      lastVoteAt: new Map(),
    };
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    await this.sendNode();
  }

  getNode() {
    return adventureData.story[this.gameData.nodeId];
  }

  async sendNode() {
    const node = this.getNode();
    if (!node) {
      await this.end("Unknown node");
      return;
    }

    // End states
    if (node.end) {
      const reward = node.reward || 0;
      const penalty = node.penalty || 0;
      this.winner = null; // Not competitive; cooperative path

      await this.channel.send({
        embeds: [
          {
            title: node.end === "success" ? "✅ Success" : node.end === "fail" ? "❌ Failed" : "ℹ️ Partial",
            description: node.text,
            color: node.end === "success" ? 0x2ecc71 : node.end === "fail" ? 0xe74c3c : 0xf1c40f,
            fields: [
              { name: "Reward", value: `${reward}`, inline: true },
              { name: "Penalty", value: `${penalty}`, inline: true },
              { name: "Inventory", value: this.prettyInventory(), inline: false },
            ],
          },
        ],
      });

      await this.end("completed");
      return;
    }

    const buttons = node.choices.map((choice, idx) => {
      const btn = new ButtonBuilder()
        .setCustomId(`adventure_choice_${this.sessionId}_${idx}`)
        .setLabel(choice.label)
        .setStyle(ButtonStyle.Primary);
      if (choice.requires?.item && !this.gameData.inventory.has(choice.requires.item)) {
        btn.setStyle(ButtonStyle.Secondary).setDisabled(true);
      }
      return btn;
    });

    const row = new ActionRowBuilder().addComponents(buttons);

    const flavor = await this.generateFlavor(node.text);

    await this.channel.send({
      embeds: [
        {
          title: "🗺️ Adventure",
          description: `${node.text}${flavor ? `\n\n${flavor}` : ""}`,
          color: 0x9b59b6,
          fields: [
            { name: "Inventory", value: this.prettyInventory() || "Empty", inline: false },
            { name: "Votes", value: "Cast your vote below!", inline: false },
          ],
        },
      ],
      components: [row],
    });

    // Start vote timeout
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = setTimeout(() => this.resolveVote(), VOTE_TIMEOUT_MS);
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action !== "choice") return { ok: false, error: "Unknown action" };

    const now = Date.now();
    const last = this.gameData.lastVoteAt.get(userId) || 0;
    if (now - last < VOTE_COOLDOWN_MS) {
      return { ok: false, error: "Too fast. Wait a moment before voting again." };
    }
    this.gameData.lastVoteAt.set(userId, now);

    const choiceIndex = data.choiceIndex;
    const node = this.getNode();
    if (!node || !node.choices[choiceIndex]) {
      return { ok: false, error: "Invalid choice" };
    }

    const choice = node.choices[choiceIndex];
    if (choice.requires?.item && !this.gameData.inventory.has(choice.requires.item)) {
      return { ok: false, error: "Requirement not met for this choice." };
    }

    this.gameData.votes.set(userId, choiceIndex);

    // Optional: if all players voted, resolve early
    if (this.gameData.votes.size >= this.players.length) {
      if (this.voteTimer) clearTimeout(this.voteTimer);
      await this.resolveVote();
    }

    return { ok: true };
  }

  tallyVotes(node) {
    const counts = new Map();
    for (const idx of this.gameData.votes.values()) {
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
    // majority; tie -> first option
    let bestIdx = 0;
    let bestCount = -1;
    for (const [idx, count] of counts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestIdx = idx;
      }
    }
    return node.choices[bestIdx] || node.choices[0];
  }

  async resolveVote() {
    const node = this.getNode();
    if (!node) return;

    const picked = this.tallyVotes(node);

    // Apply grant / reward / penalty
    if (picked.grant) this.gameData.inventory.add(picked.grant);
    if (picked.reward) this.applyReward(picked.reward);
    if (picked.penalty) this.applyPenalty(picked.penalty);

    this.gameData.nodeId = picked.next || node.end || "start";
    this.gameData.votes.clear();
    this.gameData.lastVoteAt.clear();

    await this.channel.send({
      content: `✅ Choice selected: **${picked.label}**`,
    });

    await logEvent({
      userId: this.initiator.id,
      username: this.initiator.username,
      guildId: this.options.guildId,
      gameType: "adventure",
      action: "choice",
      meta: { choice: picked.label, next: picked.next, reward: picked.reward, penalty: picked.penalty },
    });

    await this.sendNode();
  }

  async generateFlavor(baseText) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed: baseText.split(".")[0] || baseText,
        maxLen: 25,
        temperature: 0.8,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) {
        return `_${res.data.text}_`;
      }
    } catch (e) {
      logger.debug("[ADVENTURE] Markov flavor failed", { error: e.message });
    }
    return "";
  }

  applyReward(points) {
    for (const p of this.players) {
      p.score = (p.score || 0) + points;
    }
  }

  applyPenalty(points) {
    for (const p of this.players) {
      p.score = (p.score || 0) - points;
    }
  }

  prettyInventory() {
    return Array.from(this.gameData.inventory).join(", ") || "";
  }

  async endGame() {
    this.status = "ended";
    await this.end("completed");
  }

  getGameName() {
    return "Adventure";
  }
}

export default AdventureGame;
