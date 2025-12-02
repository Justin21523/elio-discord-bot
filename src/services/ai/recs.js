// src/services/ai/recs.js
import { post } from "./client.js";
import { logger } from "../../util/logger.js";

export async function recommendGames({ userId, guildId, topK = 3 }) {
  const res = await post("/recs/games", {
    user_id: userId,
    guild_id: guildId,
    top_k: topK,
  });
  if (!res.ok) {
    logger.error("[RECS] recommendGames failed", { error: res.error });
  }
  return res;
}

export default { recommendGames };
