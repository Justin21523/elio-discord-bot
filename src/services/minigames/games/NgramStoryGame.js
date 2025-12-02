import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";

const require = createRequire(import.meta.url);
const storySeeds = require("../../../../data/minigames/ngram-story.json");

/**
 * N-gram/Markov story chain: players submit keywords and Markov generates the next segment.
 */
export class NgramStoryGame extends BaseGame {
  async initialize() {
    await super.initialize();
    this.gameData = {
      story: [this.pickSeed()],
      steps: 0,
      maxSteps: 5,
    };
  }

  pickSeed() {
    const seeds = storySeeds.seeds || [];
    return seeds[Math.floor(Math.random() * seeds.length)] || "Once upon a time";
  }

  async start() {
    this.status = "active";
    await this.channel.send({
      embeds: [
        {
          title: "📚 N-gram Story Weave",
          description: `Current story:\n${this.gameData.story.join(" ")}\n\nUse \`/minigame narrate keyword:<word>\` to generate the next segment. ${this.gameData.maxSteps} turns total.`,
          color: 0x9b59b6,
        },
      ],
    });
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };
    if (action !== "narrate") return { ok: false, error: "Unknown action" };

    const keyword = data.keyword || "";
    const next = await this.generateNext(keyword);
    if (!next) return { ok: false, error: "Failed to generate story" };

    this.gameData.story.push(next);
    this.gameData.steps += 1;

    await this.channel.send({
      embeds: [
        {
          title: "📚 Story Continues",
          description: this.gameData.story.join(" "),
          color: 0x9b59b6,
          footer: { text: `${this.gameData.steps}/${this.gameData.maxSteps} steps` },
        },
      ],
    });

    if (this.gameData.steps >= this.gameData.maxSteps) {
      this.status = "ended";
      await this.end("completed");
    }

    return { ok: true };
  }

  async generateNext(keyword) {
    if (!AI_ENABLED || !this.options.ai?.markov) {
      return `${keyword || "…"}`;
    }
    try {
      const res = await this.options.ai.markov.generate({
        seed: `${this.gameData.story.join(" ")} ${keyword}`,
        maxLen: 20,
        temperature: 0.9,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return res.data.text;
    } catch (e) {
      logger.debug("[NGRAM] generate failed", { error: e.message });
    }
    return `${keyword || "…"}`;
  }

  getGameName() {
    return "N-gram Story";
  }
}

export default NgramStoryGame;
