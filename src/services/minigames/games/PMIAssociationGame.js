import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";

const require = createRequire(import.meta.url);
const assocData = require("../../../../data/minigames/clues.json");

/**
 * PMI-based keyword association: guess related terms.
 */
export class PMIAssociationGame extends BaseGame {
  async initialize() {
    await super.initialize();
    this.corpusTokens = this.buildCorpus();
    this.gameData = {
      round: 0,
      maxRounds: 5,
      score: 0,
    };
  }

  buildCorpus() {
    return assocData.documents
      .map((d) =>
        (d.passage || d.text || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter(Boolean)
      )
      .flat();
  }

  async start() {
    this.status = "active";
    await this.channel.send({
      embeds: [
        {
          title: "🔗 PMI Association",
          description: "Use `/minigame pmi guess:<word>` to guess a related term. 5 rounds; higher PMI scores mean closer association.",
          color: 0x3498db,
        },
      ],
    });
    await this.nextRound();
  }

  async nextRound() {
    this.gameData.round += 1;
    this.target = this.pickToken();
    await this.channel.send({
      content: `Round ${this.gameData.round}/${this.gameData.maxRounds}. Guess a word related to **${this.target}**.`,
    });
  }

  pickToken() {
    const tokens = this.corpusTokens.filter((t) => t.length > 3);
    return tokens[Math.floor(Math.random() * tokens.length)];
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action !== "pmi") return { ok: false, error: "Unknown action" };

    const guess = (data.guess || "").toLowerCase().trim();
    if (!guess) return { ok: false, error: "Guess required" };

    const score = this.computePMI(this.target, guess);
    this.gameData.score += score > 0 ? 1 : 0;

    await this.channel.send({
      embeds: [
        {
          title: "Result",
          description: `Target: **${this.target}**\nYour guess: **${guess}**\nPMI score: ${score.toFixed(3)}`,
          color: score > 0 ? 0x2ecc71 : 0xe74c3c,
        },
      ],
    });

    if (this.gameData.round >= this.gameData.maxRounds) {
      this.status = "ended";
      await this.channel.send({
        embeds: [
          {
            title: "🏁 PMI Game Over",
            description: `Total correct (PMI>0): ${this.gameData.score}/${this.gameData.maxRounds}`,
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

  computePMI(a, b) {
    const tokens = this.corpusTokens;
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
    return "PMI Association";
  }
}

export default PMIAssociationGame;
