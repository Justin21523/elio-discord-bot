/**
 * jobs/sceneRecap.ts
 * Generate automatic recaps for ended RP scenes and store them in Mongo.
 * All code/comments in English only.
 */

import { logger } from "../util/logger.js";
import { bumpSceneRecapAttempt, listScenesNeedingRecap, markSceneRecapFailed, setSceneRecap } from "../services/assistantScenes.js";
import { generateSceneRecap } from "../services/sceneRecapGenerator.js";

const MAX_SCENES_PER_GUILD = 5;

let running = false;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function run(client: any) {
  if (running) return;
  running = true;

  try {
    const guilds = client?.guilds?.cache?.values?.();
    if (!guilds) return;

    for (const guild of guilds) {
      const guildId = String(guild?.id ?? "");
      if (!guildId) continue;

      const pendingRes = await listScenesNeedingRecap(guildId, MAX_SCENES_PER_GUILD);
      if (!pendingRes.ok) continue;

      const scenes = pendingRes.data.scenes ?? [];
      if (!scenes.length) continue;

      for (const scene of scenes) {
        const threadId = String(scene.threadId ?? "");
        if (!threadId) continue;

        try {
          const channel = await client.channels.fetch(threadId).catch(() => null);
          if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased()) {
            await markSceneRecapFailed({ guildId, threadId, errorMessage: "Thread not found or not text-based" });
            continue;
          }

          const bumpRes = await bumpSceneRecapAttempt({ guildId, threadId });
          if (!bumpRes.ok) {
            await markSceneRecapFailed({ guildId, threadId, errorMessage: bumpRes.error.message });
            continue;
          }

          const recapRes = await generateSceneRecap({ thread: channel, title: scene.title ?? null });
          if (!recapRes.ok) {
            await markSceneRecapFailed({ guildId, threadId, errorMessage: recapRes.error.message });
            continue;
          }

          await setSceneRecap({
            guildId,
            threadId,
            recap: recapRes.data.recap,
            messageCount: recapRes.data.messageCount,
            model: recapRes.data.model,
          });

          logger.info("[SCENE] Recap generated", { guildId, threadId, messageCount: recapRes.data.messageCount });
        } catch (error: unknown) {
          await markSceneRecapFailed({ guildId, threadId, errorMessage: getErrorMessage(error) });
        }
      }
    }
  } catch (error: unknown) {
    logger.warn("[JOB] sceneRecap failed (non-fatal)", { error: getErrorMessage(error) });
  } finally {
    running = false;
  }
}

export default { run };
