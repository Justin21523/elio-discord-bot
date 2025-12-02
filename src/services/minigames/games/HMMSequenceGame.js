import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";

const require = createRequire(import.meta.url);
const seqData = require("../../../../data/minigames/sequence.json");

/**
 * HMM sequence game: player advances steps, transitions sampled by probabilities and flavored text.
 */
export class HMMSequenceGame extends BaseGame {
  async initialize() {
    await super.initialize();
    this.gameData = {
      state: "start",
      steps: 0,
      maxSteps: 6,
    };
  }

  async start() {
    this.status = "active";
    await this.sendState("Sequence started");
  }

  currentNode() {
    return seqData.states[this.gameData.state];
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action !== "next") return { ok: false, error: "Unknown action" };

    const node = this.currentNode();
    if (!node) return { ok: false, error: "Invalid state" };

    if (node.end) {
      this.status = "ended";
      this.winner = { userId, username: "player" };
      this.winner.won = node.end === "success";
      await this.channel.send({
        embeds: [
          {
            title: node.end === "success" ? "✅ Success" : node.end === "fail" ? "❌ Fail" : "ℹ️ Partial",
            description: node.text,
            color: node.end === "success" ? 0x2ecc71 : node.end === "fail" ? 0xe74c3c : 0xf1c40f,
          },
        ],
      });
      await this.end(node.end);
      return { ok: true };
    }

    const nextState = this.sampleTransition(node.transitions || {});
    this.gameData.state = nextState;
    this.gameData.steps += 1;

    await this.sendState(`Moved to ${nextState}`);
    return { ok: true };
  }

  sampleTransition(transitions) {
    const entries = Object.entries(transitions || {});
    if (entries.length === 0) return "start";
    const total = entries.reduce((acc, [, p]) => acc + p, 0);
    let r = Math.random() * total;
    for (const [state, prob] of entries) {
      r -= prob;
      if (r <= 0) return state;
    }
    return entries[entries.length - 1][0];
  }

  async sendState(prefix) {
    const node = this.currentNode();
    const flavor = await this.generateFlavor(node?.text || "sequence");
    const transitions = node?.transitions
      ? Object.entries(node.transitions)
          .map(([k, v]) => `• ${k} (${Math.round(v * 100)}%)`)
          .join("\n")
      : "End state";

    await this.channel.send({
      embeds: [
        {
          title: "🔁 HMM Sequence",
          description: `${node?.text || ""}${flavor ? `\n\n${flavor}` : ""}`,
          color: 0x8e44ad,
          fields: [
            { name: "Steps", value: `${this.gameData.steps}/${this.gameData.maxSteps}`, inline: true },
            { name: "Next Probabilities", value: transitions, inline: false },
            { name: "Action", value: "Use `/minigame next` to advance", inline: false },
          ],
        },
      ],
    });
  }

  getGameName() {
    return "HMM Sequence";
  }

  async generateFlavor(seed) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed: seed || "sequence",
        maxLen: 18,
        temperature: 0.85,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return `_${res.data.text}_`;
    } catch (e) {
      logger.debug("[HMM] Markov flavor failed", { error: e.message });
    }
    return "";
  }
}

export default HMMSequenceGame;
