import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";
import TrainingDataLoader from "../TrainingDataLoader.js";

const require = createRequire(import.meta.url);
const seqData = require("../../../../data/minigames/sequence.json");

/**
 * HMM sequence game: player advances steps, transitions sampled by probabilities and flavored text.
 * Enhanced with training data for dynamic state generation.
 */
export class HMMSequenceGame extends BaseGame {
  states: Record<string, any> = {};

  async initialize() {
    await super.initialize();

    // Build dynamic states from training data + static data
    this.states = this.buildStates();

    this.gameData = {
      state: "start",
      steps: 0,
      maxSteps: 6,
    };
  }

  buildStates() {
    // Start with static states
    const states = { ...seqData.states };

    // Try to get dynamic states from training data
    const trainingSeeds = TrainingDataLoader.getRandomStorySeeds(30);

    if (trainingSeeds && trainingSeeds.length > 10) {
      logger.info(`[HMMSequenceGame] Enhancing with ${trainingSeeds.length} training seeds`);

      // Create dynamic intermediate states from training data
      const dynamicStates = trainingSeeds.slice(0, 10).map((seed, idx) => ({
        id: `dynamic_${idx}`,
        text: seed.seed,
        character: seed.character,
      }));

      // Add dynamic states with transitions
      dynamicStates.forEach((ds, idx) => {
        const nextStates: Record<string, number> = {};

        // Connect to other dynamic states or end states
        if (idx < dynamicStates.length - 1) {
          nextStates[`dynamic_${idx + 1}`] = 0.4;
        }
        if (states.success) nextStates.success = 0.2;
        if (states.fail) nextStates.fail = 0.1;
        if (states.partial) nextStates.partial = 0.15;

        // Add some randomness to other dynamic states
        const otherIdx = (idx + 3) % dynamicStates.length;
        if (otherIdx !== idx) {
          nextStates[`dynamic_${otherIdx}`] = 0.15;
        }

        states[ds.id] = {
          text: ds.text,
          transitions: nextStates,
        };
      });

      // Update start state to include dynamic transitions
      if (states.start && dynamicStates.length > 0) {
        states.start.transitions = {
          ...states.start.transitions,
          dynamic_0: 0.3,
          dynamic_1: 0.2,
        };
      }
    }

    return states;
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    await this.sendState("Sequence started");
  }

  currentNode() {
    return this.states[this.gameData.state] || seqData.states[this.gameData.state];
  }

  async handleAction(userId: string, action: string, data: any = {}) {
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

  sampleTransition(transitions: Record<string, number>) {
    const entries = Object.entries(transitions || {}) as Array<[string, number]>;
    if (entries.length === 0) return "start";
    const total = entries.reduce((acc, [, p]) => acc + Number(p || 0), 0);
    let r = Math.random() * total;
    for (const [state, prob] of entries) {
      r -= Number(prob || 0);
      if (r <= 0) return state;
    }
    return entries[entries.length - 1]?.[0] || "start";
  }

  async sendState(prefix: string) {
    const node = this.currentNode();
    const flavor = await this.generateFlavor(node?.text || "sequence");
    const transitions = node?.transitions
      ? Object.entries(node.transitions)
          .map(([k, v]) => `• ${k} (${Math.round(Number(v) * 100)}%)`)
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

  async generateFlavor(seed: string) {
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
      const msg = e instanceof Error ? e.message : String(e);
      logger.debug("[HMM] Markov flavor failed", { error: msg });
    }
    return "";
  }
}

export default HMMSequenceGame;
