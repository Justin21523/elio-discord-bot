/**
 * jobs/sceneCleanup.ts
 * Periodically reconcile assistant_scenes.active with Discord thread state.
 * All code/comments in English only.
 */

import { logger } from "../util/logger.js";
import { listActiveScenes, endScene } from "../services/assistantScenes.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function run(client: any) {
  try {
    logger.debug("[JOB] sceneCleanup started");

    const guilds = client?.guilds?.cache?.values?.();
    if (!guilds) return;

    for (const guild of guilds) {
      const guildId = String(guild?.id ?? "");
      if (!guildId) continue;

      const scenesRes = await listActiveScenes(guildId, 200);
      if (!scenesRes.ok) continue;
      const scenes = scenesRes.data.scenes ?? [];
      if (!scenes.length) continue;

      let activeThreads: any;
      try {
        activeThreads = await guild.channels.fetchActiveThreads();
      } catch (error: unknown) {
        logger.warn("[JOB] sceneCleanup failed to fetch active threads", {
          guildId,
          error: getErrorMessage(error),
        });
        continue;
      }

      const activeThreadIds = new Set<string>();
      for (const [threadId] of activeThreads.threads) {
        activeThreadIds.add(String(threadId));
      }

      for (const scene of scenes) {
        const threadId = String(scene.threadId ?? "");
        if (!threadId) continue;

        if (!activeThreadIds.has(threadId)) {
          const endRes = await endScene({ guildId, threadId, endedByUserId: "system" });
          if (endRes.ok && endRes.data.ended) {
            logger.info("[SCENE] Auto-ended stale scene (thread not active)", { guildId, threadId });
          }
        }
      }
    }
  } catch (error: unknown) {
    logger.warn("[JOB] sceneCleanup failed (non-fatal)", { error: getErrorMessage(error) });
  }
}

export default { run };

