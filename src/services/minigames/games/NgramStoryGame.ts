import { createRequire } from "module";
import { BaseGame } from "../BaseGame.js";
import { AI_ENABLED } from "../../../config.js";
import { logger } from "../../../util/logger.js";
import TrainingDataLoader from "../TrainingDataLoader.js";

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
    // Try training data seeds first
    const trainingSeeds = TrainingDataLoader.getRandomStorySeeds(20);
    if (trainingSeeds && trainingSeeds.length > 0) {
      const randomSeed = trainingSeeds[Math.floor(Math.random() * trainingSeeds.length)];
      logger.info(`[NgramStoryGame] Using training seed from ${randomSeed.character}`);
      return randomSeed.seed;
    }

    // Fallback to static seeds
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

  async handleAction(userId: string, action: string, data: any = {}) {
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

  async generateNext(keyword: string) {
    if (!AI_ENABLED || !this.options.aiService?.markov) {
      return `${keyword || "…"}`;
    }
    try {
      const res = await this.options.aiService.markov.generate({
        seed: `${this.gameData.story.join(" ")} ${keyword}`,
        maxLen: 20,
        temperature: 0.9,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return res.data.text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.debug("[NGRAM] generate failed", { error: msg });
    }
    return `${keyword || "…"}`;
  }

  getGameName() {
    return "N-gram Story";
  }
}

export default NgramStoryGame;
