// src/services/ai/ir.js
import { post } from "./client.js";
import { logger } from "../../util/logger.js";

export async function clueSearch({ docs, query }) {
  const res = await post("/ir/clue", { docs, query });
  if (!res.ok) {
    logger.error("[IR] Clue search failed", { error: res.error });
  }
  return res;
}

export async function docSearch({ docs, query }) {
  const res = await post("/ir/doc", { docs, query });
  if (!res.ok) {
    logger.error("[IR] Doc search failed", { error: res.error });
  }
  return res;
}

export default { clueSearch, docSearch };
