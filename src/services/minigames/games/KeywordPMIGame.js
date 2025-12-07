import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";
import TrainingDataLoader from "../TrainingDataLoader.js";

const require = createRequire(import.meta.url);
const sourceData = require("../../../../data/minigames/docs.json");

/**
 * Keyword PMI / association: user selects from options based on PMI scores.
 */
export class KeywordPMIGame extends BaseGame {
  async initialize() {
    await super.initialize();
    this.tokens = this.buildTokens();
    this.gameData = {
      round: 0,
      maxRounds: 5,
      score: 0,
    };
  }

  buildTokens() {
    // Try to get tokens from training data first
    const pmiCorpus = TrainingDataLoader.getPMICorpus();

    if (pmiCorpus && pmiCorpus.tokens && pmiCorpus.tokens.length > 100) {
      logger.info(`[KeywordPMIGame] Using training corpus with ${pmiCorpus.tokens.length} tokens`);
      return pmiCorpus.tokens;
    }

    // Fallback to static data
    logger.info("[KeywordPMIGame] Using static corpus");
    return sourceData.documents
      .map((d) =>
        (d.text || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((t) => t.length > 3)
      )
      .flat();
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    await this.channel.send({
      embeds: [
        {
          title: "🔗 PMI Multiple Choice",
          description: "Pick the word most related to the target. Use `/minigame pmichoice option:<number>`.",
          color: 0x8e44ad,
        },
      ],
    });
    await this.nextRound();
  }

  async nextRound() {
    this.gameData.round += 1;
    this.target = this.pickToken();
    this.options = this.pickOptions(this.target);
    await this.channel.send({
      embeds: [
        {
          title: `Round ${this.gameData.round}/${this.gameData.maxRounds}`,
          description: `Target: **${this.target}**\nOptions:\n${this.options
            .map((opt, i) => `${i + 1}. ${opt}`)
            .join("\n")}`,
          color: 0x8e44ad,
        },
      ],
    });
  }

  pickToken() {
    return this.tokens[Math.floor(Math.random() * this.tokens.length)];
  }

  pickOptions(target) {
    // Get 3 random distractor words (not including target)
    const distractors = new Set();
    let attempts = 0;
    while (distractors.size < 3 && attempts < 100) {
      attempts++;
      const word = this.tokens[Math.floor(Math.random() * this.tokens.length)];
      if (word !== target) {
        distractors.add(word);
      }
    }

    // Find the word with highest PMI to target (this will be the "best" answer)
    let bestWord = target; // fallback
    let bestPMI = -Infinity;
    for (const word of distractors) {
      const pmi = this.computePMI(target, word);
      if (pmi > bestPMI) {
        bestPMI = pmi;
        bestWord = word;
      }
    }

    // Build options array: 3 distractors + best word (which has highest PMI)
    const options = Array.from(distractors);

    // Shuffle the options
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    // If we don't have 4 options, add the best word
    if (options.length < 4) {
      options.push(bestWord);
    }

    // Shuffle again to randomize position
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    return options;
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action !== "pmichoice") return { ok: false, error: "Unknown action" };

    const idx = (data.option || 1) - 1;
    if (idx < 0 || idx >= this.options.length) {
      return { ok: false, error: "Invalid option" };
    }

    const choice = this.options[idx];
    const best = this.bestOption(this.target, this.options);
    const correct = choice === best;
    if (correct) this.gameData.score += 1;

    await this.channel.send({
      embeds: [
        {
          title: correct ? "✅ Correct" : "❌ Wrong",
          description: `Target: **${this.target}**\nYour choice: **${choice}**\nBest PMI: **${best}**`,
          color: correct ? 0x2ecc71 : 0xe74c3c,
        },
      ],
    });

    if (this.gameData.round >= this.gameData.maxRounds) {
      this.status = "ended";
      await this.channel.send({
        embeds: [
          {
            title: "🏁 PMI Game Over",
            description: `Score: ${this.gameData.score}/${this.gameData.maxRounds}`,
            color: 0x9b59b6,
          },
        ],
      });
      await this.end("completed");
    } else {
      await this.nextRound();
    }

    return { ok: true };
  }

  bestOption(target, options) {
    let best = options[0];
    let bestScore = -Infinity;
    for (const opt of options) {
      const pmi = this.computePMI(target, opt);
      if (pmi > bestScore) {
        bestScore = pmi;
        best = opt;
      }
    }
    return best;
  }

  computePMI(a, b) {
    const tokens = this.tokens;
    const N = tokens.length;
    const countA = tokens.filter((t) => t === a).length;
    const countB = tokens.filter((t) => t === b).length;
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    const countAB = bigrams.filter((bg) => bg === `${a} ${b}` || bg === `${b} ${a}`).length;

    if (countA === 0 || countB === 0 || countAB === 0) return -1;
    return Math.log((countAB / N) / ((countA / N) * (countB / N)));
  }

  getGameName() {
    return "PMI Choice";
  }
}

export default KeywordPMIGame;
