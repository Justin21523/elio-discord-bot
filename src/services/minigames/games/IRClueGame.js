import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { logger } from "../../../util/logger.js";
import { AI_ENABLED } from "../../../config.js";

const require = createRequire(import.meta.url);
const clueData = require("../../../../data/minigames/clues.json");

export class IRClueGame extends BaseGame {
  async initialize() {
    await super.initialize();
    this.gameData = {
      queriesLeft: 3,
      target: this.pickDoc(),
      score: 0,
    };
    this.indexDocs = clueData.documents || [];
  }

  pickDoc() {
    const docs = clueData.documents || [];
    return docs[Math.floor(Math.random() * docs.length)];
  }

  async start() {
    this.status = "active";
    await this.channel.send({
      embeds: [
        {
          title: "🔍 IR Clue Hunt",
          description:
            "Use `/minigame clue query:<keywords>` to fetch hints (3 queries max), then `/minigame answer text:<guess>` to solve. Fewer queries and faster answers score higher.",
          color: 0x1abc9c,
          fields: [
            { name: "Queries", value: "3", inline: true },
            { name: "Hint Source", value: "TF-IDF top snippet", inline: true },
            { name: "Goal", value: "Find the hidden answer", inline: false },
          ],
        },
      ],
    });
    const flavor = await this.generateFlavor("clue hunt start");
    if (flavor) {
      await this.channel.send({ content: flavor });
    }
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action === "clue") return this.handleClue(data.query);
    if (action === "answer") return this.handleAnswer(userId, data.text);
    return { ok: false, error: "Unknown action" };
  }

  async handleClue(query) {
    if (!query) return { ok: false, error: "Query required" };
    if (this.gameData.queriesLeft <= 0) {
      return { ok: false, error: "No queries left" };
    }
    this.gameData.queriesLeft -= 1;
    const res = await this.remoteSearch(query);
    if (!res.ok) {
      return { ok: false, error: res.error?.message || "IR service unavailable" };
    }
    return {
      ok: true,
      snippet: res.data.snippet,
      queriesLeft: this.gameData.queriesLeft,
    };
  }

  handleAnswer(userId, text) {
    if (!text) return { ok: false, error: "Answer required" };
    const normalized = text.trim().toLowerCase();
    const target = this.gameData.target.answer.toLowerCase();
    if (normalized === target) {
      this.winner = this.getPlayer(userId) || { userId, username: "player" };
      this.winner.won = true;
      this.status = "ended";
      return { ok: true, correct: true, target: this.gameData.target.answer };
    }
    return { ok: true, correct: false };
  }

  async remoteSearch(query) {
    if (!AI_ENABLED || !this.options.ai?.ir) {
      return { ok: false, error: { message: "IR service not enabled" } };
    }
    return this.options.ai.ir.clueSearch({
      docs: this.indexDocs.map((d) => ({ id: d.id, text: d.passage || d.text || d.passage })),
      query,
    });
  }

  getGameName() {
    return "IR Clue Hunt";
  }

  getStatusEmbed() {
    return {
      title: "🔍 IR Clue Hunt",
      description: `Queries left: ${this.gameData.queriesLeft}`,
      color: 0x1abc9c,
    };
  }

  async generateFlavor(seed) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed,
        maxLen: 15,
        temperature: 0.8,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return `_${res.data.text}_`;
    } catch (e) {
      logger.debug("[IRCLUE] Markov flavor failed", { error: e.message });
    }
    return "";
  }
}

export default IRClueGame;
