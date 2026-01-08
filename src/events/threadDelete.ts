/**
 * events/threadDelete.ts
 * Keep assistant scene state in sync when threads are deleted.
 * All code/comments in English only.
 */

import { Events } from "discord.js";
import { endScene } from "../services/assistantScenes.js";
import { logger } from "../util/logger.js";

export const name = Events.ThreadDelete;
export const once = false;

export async function execute(thread: any) {
  try {
    const guildId = String(thread?.guildId ?? "");
    const threadId = String(thread?.id ?? "");
    if (!guildId || !threadId) return;

    const endRes = await endScene({ guildId, threadId, endedByUserId: "system" });
    if (endRes.ok && endRes.data.ended) {
      logger.info("[SCENE] Auto-ended scene due to thread delete", { guildId, threadId });
    }
  } catch (error: unknown) {
    logger.warn("[SCENE] threadDelete handler failed (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export default { name, once, execute };

