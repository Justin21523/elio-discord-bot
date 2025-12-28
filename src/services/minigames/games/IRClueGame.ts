import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { logger } from "../../../util/logger.js";
import { AI_ENABLED } from "../../../config.js";
import TrainingDataLoader from "../TrainingDataLoader.js";

const require = createRequire(import.meta.url);
const clueData = require("../../../../data/minigames/clues.json");

export class IRClueGame extends BaseGame {
  indexDocs: any[] = [];

  async initialize() {
    await super.initialize();

    // Load documents from training data + static data
    this.indexDocs = this.loadDocuments();

    this.gameData = {
      queriesLeft: 3,
      target: this.pickDoc(),
      score: 0,
    };
  }

  loadDocuments() {
    // Get documents from training data
    const trainingDocs = TrainingDataLoader.getRandomPassages(50);

    // Get static documents
    const staticDocs = (clueData.documents || []) as any[];

    // Merge both sources
    const merged = [
      ...trainingDocs.map((d, idx) => ({
        id: d.id || `train_${idx}`,
        answer: d.character || d.scenario || "Mystery",
        passage: d.text || d.passage,
        text: d.text || d.passage,
        source: "training",
      })),
      ...staticDocs.map((d: any) => ({ ...d, source: "static" })),
    ];

    logger.info(`[IRClueGame] Loaded ${merged.length} documents (${trainingDocs.length} from training, ${staticDocs.length} static)`);

    return merged;
  }

  pickDoc() {
    const docs = this.indexDocs || clueData.documents || [];
    if (docs.length === 0) {
      return { id: "fallback", answer: "Unknown", passage: "No documents available" };
    }
    return docs[Math.floor(Math.random() * docs.length)] || docs[0];
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
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

  async handleAction(userId: string, action: string, data: any = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action === "clue") return this.handleClue(data.query);
    if (action === "answer") return this.handleAnswer(userId, data.text);
    return { ok: false, error: "Unknown action" };
  }

  async handleClue(query: string) {
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

  async handleAnswer(userId: string, text: string) {
    if (!text) return { ok: false, error: "Answer required" };
    const normalized = text.trim().toLowerCase();
    const target = this.gameData.target.answer.toLowerCase();
    if (normalized === target) {
      this.winner = this.getPlayer(userId) || { userId, username: "player" };
      this.winner.won = true;
      this.status = "ended";

      // Send victory message
      await this.channel.send({
        embeds: [
          {
            title: "🎉 Correct!",
            description: `<@${userId}> found the answer: **${this.gameData.target.answer}**`,
            color: 0x2ecc71,
          },
        ],
      });

      // Clean up game session
      await this.end("completed");
      return { ok: true, correct: true, target: this.gameData.target.answer };
    }
    return { ok: true, correct: false };
  }

  async remoteSearch(query: string) {
    if (!AI_ENABLED || !this.options.aiService?.ir) {
      return { ok: false, error: { message: "IR service not enabled" } };
    }
    return this.options.aiService.ir.clueSearch({
      docs: this.indexDocs.map((d: any) => ({ id: d.id, text: d.passage || d.text || d.passage })),
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

  async generateFlavor(seed: string) {
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
      const msg = e instanceof Error ? e.message : String(e);
      logger.debug("[IRCLUE] Markov flavor failed", { error: msg });
    }
    return "";
  }
}

export default IRClueGame;
