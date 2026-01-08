/**
 * events/threadUpdate.ts
 * Keep assistant scene state in sync when threads are archived/unarchived.
 * All code/comments in English only.
 */

import { Events } from "discord.js";
import { endScene } from "../services/assistantScenes.js";
import { logger } from "../util/logger.js";

export const name = Events.ThreadUpdate;
export const once = false;

export async function execute(oldThread: any, newThread: any) {
  try {
    const guildId = String(newThread?.guildId ?? oldThread?.guildId ?? "");
    const threadId = String(newThread?.id ?? oldThread?.id ?? "");
    if (!guildId || !threadId) return;

    const wasArchived = oldThread?.archived === true;
    const isArchived = newThread?.archived === true;

    // We only auto-end scenes when a thread transitions to archived.
    // If someone unarchives the thread later, require explicit /scene adopt to reactivate.
    if (!wasArchived && isArchived) {
      const endRes = await endScene({ guildId, threadId, endedByUserId: "system" });
      if (endRes.ok && endRes.data.ended) {
        logger.info("[SCENE] Auto-ended scene due to thread archive", { guildId, threadId });
      }
    }
  } catch (error: unknown) {
    logger.warn("[SCENE] threadUpdate handler failed (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export default { name, once, execute };

