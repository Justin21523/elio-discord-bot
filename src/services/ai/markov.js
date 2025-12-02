// src/services/ai/markov.js
import { post } from "./client.js";
import { logger } from "../../util/logger.js";

export async function train({ corpus, order = 2, modelName = "default" }) {
  if (!Array.isArray(corpus) || corpus.length === 0) {
    return { ok: false, error: { code: "BAD_REQUEST", message: "corpus required" } };
  }
  const res = await post("/markov/train", { corpus, order, model_name: modelName });
  if (!res.ok) {
    logger.error("[MARKOV] Train failed", { error: res.error });
  }
  return res;
}

export async function generate({ seed = "", maxLen = 50, temperature = 1.0, repetitionPenalty = 1.1, modelName = "default" }) {
  const res = await post("/markov/generate", {
    seed,
    max_len: maxLen,
    temperature,
    repetition_penalty: repetitionPenalty,
    model_name: modelName,
  });
  if (!res.ok) {
    logger.error("[MARKOV] Generate failed", { error: res.error });
  }
  return res;
}

export default { train, generate };
