import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";
import TrainingDataLoader from "../TrainingDataLoader.js";

const require = createRequire(import.meta.url);
const docData = require("../../../../data/minigames/docs.json");

/**
 * Document hunt with pseudo-Rocchio feedback.
 * Players send /minigame docquery query:<q> to get snippets, /minigame docanswer text:<ans> to solve.
 */
export class IRDocHuntGame extends BaseGame {
  docs: any[] = [];

  async initialize() {
    await super.initialize();

    // Load documents from training data + static data
    this.docs = this.loadDocuments();

    this.gameData = {
      queriesLeft: 4,
      target: this.pickDoc(),
    };
  }

  loadDocuments() {
    // Get documents from training data
    const trainingDocs = TrainingDataLoader.getRandomPassages(50);

    // Get static documents
    const staticDocs = (docData.documents || []) as any[];

    // Merge both sources
    const merged = [
      ...trainingDocs.map((d, idx) => ({
        id: d.id || `train_${idx}`,
        answer: d.character || d.scenario || "Mystery",
        text: d.text || d.passage,
        source: "training",
      })),
      ...staticDocs.map((d: any) => ({ ...d, source: "static" })),
    ];

    logger.info(`[IRDocHuntGame] Loaded ${merged.length} documents (${trainingDocs.length} from training, ${staticDocs.length} static)`);

    return merged;
  }

  pickDoc() {
    if (this.docs.length === 0) {
      return { id: "fallback", answer: "Unknown", text: "No documents available" };
    }
    return this.docs[Math.floor(Math.random() * this.docs.length)] || this.docs[0];
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
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

  async handleAction(userId: string, action: string, data: any = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action === "docquery") return this.handleQuery(data.query);
    if (action === "docanswer") return this.handleAnswer(userId, data.text);
    return { ok: false, error: "Unknown action" };
  }

  async handleQuery(query: string) {
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

  async handleAnswer(userId: string, text: string) {
    if (!text) return { ok: false, error: "Answer required" };
    const norm = text.trim().toLowerCase();
    const target = this.gameData.target.answer.toLowerCase();
    if (norm === target) {
      this.winner = this.getPlayer(userId) || { userId, username: "player" };
      this.winner.won = true;
      this.status = "ended";

      // Send victory message
      await this.channel.send({
        embeds: [
          {
            title: "🎉 Document Found!",
            description: `<@${userId}> found the answer: **${this.gameData.target.answer}**`,
            color: 0x2980b9,
          },
        ],
      });

      // Clean up game session
      await this.end("completed");
      return { ok: true, correct: true, target: this.gameData.target.answer };
    }
    return { ok: true, correct: false };
  }

  async remoteDocSearch(query: string) {
    if (!AI_ENABLED || !this.options.aiService?.ir) {
      return { ok: false, error: { message: "IR service not enabled" } };
    }
    return this.options.aiService.ir.docSearch({
      docs: this.docs.map((d: any) => ({ id: d.id, text: d.text })),
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

  async generateFlavor(seed: string) {
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
      const msg = e instanceof Error ? e.message : String(e);
      logger.debug("[DOCHUNT] Markov flavor failed", { error: msg });
    }
    return "";
  }
}

export default IRDocHuntGame;
