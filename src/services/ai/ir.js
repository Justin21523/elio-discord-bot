// src/services/ai/ir.js
import { post } from "./client.js";
import { logger } from "../../util/logger.js";

export async function clueSearch({ docs, query }) {
  // Correct path: /ir/ir/clue (router prefix + endpoint)
  const res = await post("/ir/ir/clue", { docs, query });
  if (!res.ok) {
    logger.error("[IR] Clue search failed", { error: res.error });
  }
  return res;
}

export async function docSearch({ docs, query }) {
  // Correct path: /ir/ir/doc (router prefix + endpoint)
  const res = await post("/ir/ir/doc", { docs, query });
  if (!res.ok) {
    logger.error("[IR] Doc search failed", { error: res.error });
  }
  return res;
}

export default { clueSearch, docSearch };
