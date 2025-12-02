import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";

const require = createRequire(import.meta.url);
const docData = require("../../../../data/minigames/docs.json");

/**
 * Document hunt with pseudo-Rocchio feedback.
 * Players send /minigame docquery query:<q> to get snippets, /minigame docanswer text:<ans> to solve.
 */
export class IRDocHuntGame extends BaseGame {
  async initialize() {
    await super.initialize();
    this.docs = docData.documents || [];
    this.gameData = {
      queriesLeft: 4,
      target: this.pickDoc(),
    };
  }

  pickDoc() {
    return this.docs[Math.floor(Math.random() * this.docs.length)];
  }

  async start() {
    this.status = "active";
    await this.channel.send({
      embeds: [
        {
          title: "📜 Document Hunt (BM25/Rocchio)",
          description:
            "Use `/minigame docquery query:<keywords>` to fetch top snippets (max 4 queries).\nWhen ready, answer with `/minigame docanswer text:<answer>`.\nFewer queries and faster answers score higher.",
          color: 0x2980b9,
          fields: [
            { name: "Queries", value: "4", inline: true },
            { name: "IR", value: "TF-IDF + pseudo Rocchio", inline: true },
          ],
        },
      ],
    });
    const flavor = await this.generateFlavor("doc hunt start");
    if (flavor) await this.channel.send({ content: flavor });
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action === "docquery") return this.handleQuery(data.query);
    if (action === "docanswer") return this.handleAnswer(userId, data.text);
    return { ok: false, error: "Unknown action" };
  }

  async handleQuery(query) {
    if (!query) return { ok: false, error: "Query required" };
    if (this.gameData.queriesLeft <= 0) return { ok: false, error: "No queries left" };
    this.gameData.queriesLeft -= 1;

    const res = await this.remoteDocSearch(query);
    if (!res.ok) {
      return { ok: false, error: res.error?.message || "IR service unavailable" };
    }
    return {
      ok: true,
      snippet: res.data.snippet,
      score: res.data.score,
      queriesLeft: this.gameData.queriesLeft,
    };
  }

  handleAnswer(userId, text) {
    if (!text) return { ok: false, error: "Answer required" };
    const norm = text.trim().toLowerCase();
    const target = this.gameData.target.answer.toLowerCase();
    if (norm === target) {
      this.winner = this.getPlayer(userId) || { userId, username: "player" };
      this.winner.won = true;
      this.status = "ended";
      return { ok: true, correct: true, target: this.gameData.target.answer };
    }
    return { ok: true, correct: false };
  }

  async remoteDocSearch(query) {
    if (!AI_ENABLED || !this.options.ai?.ir) {
      return { ok: false, error: { message: "IR service not enabled" } };
    }
    return this.options.ai.ir.docSearch({
      docs: this.docs.map((d) => ({ id: d.id, text: d.text })),
      query,
    });
  }

  getGameName() {
    return "Document Hunt";
  }

  getStatusEmbed() {
    return {
      title: "📜 Document Hunt",
      description: `Queries left: ${this.gameData.queriesLeft}`,
      color: 0x2980b9,
    };
  }

  async generateFlavor(seed) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed,
        maxLen: 18,
        temperature: 0.85,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return `_${res.data.text}_`;
    } catch (e) {
      logger.debug("[DOCHUNT] Markov flavor failed", { error: e.message });
    }
    return "";
  }
}

export default IRDocHuntGame;
