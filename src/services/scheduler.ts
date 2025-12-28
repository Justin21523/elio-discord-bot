/**
 * services/scheduler.js
 * Idempotent job scheduler using node-cron.
 * Loads schedules from DB on boot, supports dynamic arm/disarm.
 */

import cron from "node-cron";
import { getDb as getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { spawn } from "child_process";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

// Active cron jobs keyed by {guildId}_{kind}
const activeJobs = new Map<string, any>();
const maintenanceJobs: any[] = [];

/**
 * Boot scheduler from database
 * Loads all enabled schedules and arms them
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function bootFromDb() {
  try {
    const db = getDB();
    const schedules = await db
      .collection("schedules")
      .find({ enabled: true })
      .toArray();

    let armed = 0;
    for (const schedule of schedules) {
      const result = await arm({
        guildId: schedule.guildId,
        channelId: schedule.channelId,
        kind: schedule.kind,
        hhmm: schedule.hhmm,
      });
      if (result.ok) armed++;
    }

    logger.job("Scheduler booted from DB", { total: schedules.length, armed });
    // Also arm maintenance cron (metrics/leaderboard/achievements) if not already
    armMaintenance();
    return { ok: true, data: { total: schedules.length, armed } };
  } catch (error: unknown) {
    logger.error("Failed to boot scheduler", { error: getErrorMessage(error) });
    return {
      ok: false,
      error: {
        code: ErrorCode.SCHEDULE_ERROR,
        message: "Failed to boot scheduler from database",
        cause: error,
      },
    };
  }
}

/**
 * Arm a scheduled job (idempotent - replaces existing)
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.channelId
 * @param {string} params.kind - Job kind (e.g., "drop", "digest")
 * @param {string} params.hhmm - Time in HH:MM format
 * @param {Function} params.handler - Optional handler function (default uses kind-based routing)
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function arm({ guildId, channelId, kind, hhmm, handler }: any) {
  try {
    // Validate hhmm format
    if (!/^\d{2}:\d{2}$/.test(hhmm)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid time format. Expected HH:MM (e.g., "09:30")',
        },
      };
    }

    const [hour, minute] = hhmm.split(":");
    const jobKey = `${guildId}_${kind}`;

    // Disarm existing job if present
    await disarm({ guildId, kind });

    // Create cron expression: "minute hour * * *" (daily)
    const cronExpression = `${minute} ${hour} * * *`;

    // Determine handler function
    const jobHandler = handler || getDefaultHandler(kind);

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Invalid cron expression",
        },
      };
    }

    // Schedule the job
    const task = cron.schedule(cronExpression, async () => {
      logger.job(`Executing scheduled job`, { guildId, kind, channelId });
      try {
        await jobHandler({ guildId, channelId, kind });
      } catch (error: unknown) {
        logger.error("Scheduled job failed", {
          guildId,
          kind,
          error: getErrorMessage(error),
        });
      }
    });

    activeJobs.set(jobKey, { task, guildId, channelId, kind, hhmm });

    logger.job("Job armed", { guildId, kind, hhmm, cronExpression });
    return { ok: true, data: { guildId, kind, hhmm } };
  } catch (error: unknown) {
    logger.error("Failed to arm job", {
      guildId,
      kind,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.SCHEDULE_ERROR,
        message: "Failed to arm scheduled job",
        cause: error,
      },
    };
  }
}

/**
 * Disarm a scheduled job
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.kind
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function disarm({ guildId, kind }: any) {
  try {
    const jobKey = `${guildId}_${kind}`;
    const existing = activeJobs.get(jobKey);

    if (existing) {
      existing.task.stop();
      activeJobs.delete(jobKey);
      logger.job("Job disarmed", { guildId, kind });
    }

    return { ok: true, data: { guildId, kind, disarmed: !!existing } };
  } catch (error: unknown) {
    logger.error("Failed to disarm job", {
      guildId,
      kind,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.SCHEDULE_ERROR,
        message: "Failed to disarm scheduled job",
        cause: error,
      },
    };
  }
}

/**
 * Reload all schedules for a guild
 * Useful after guild config changes
 * @param {string} guildId
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function reloadForGuild(guildId: string) {
  try {
    const db = getDB();
    const schedules = await db
      .collection("schedules")
      .find({ guildId, enabled: true })
      .toArray();

    // Disarm all existing jobs for this guild
    for (const [key, job] of activeJobs.entries()) {
      if (job.guildId === guildId) {
        job.task.stop();
        activeJobs.delete(key);
      }
    }

    // Re-arm from DB
    let armed = 0;
    for (const schedule of schedules) {
      const result = await arm({
        guildId: schedule.guildId,
        channelId: schedule.channelId,
        kind: schedule.kind,
        hhmm: schedule.hhmm,
      });
      if (result.ok) armed++;
    }

    logger.job("Schedules reloaded for guild", { guildId, armed });
    return { ok: true, data: { guildId, armed } };
  } catch (error: unknown) {
    logger.error("Failed to reload schedules", {
      guildId,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.SCHEDULE_ERROR,
        message: "Failed to reload schedules",
        cause: error,
      },
    };
  }
}

/**
 * Get default handler for a job kind
 * This will be expanded as we implement each feature
 */
function getDefaultHandler(kind: string) {
  // Import handlers dynamically to avoid circular dependencies
  if (kind === "maintenance") {
    return async () => runScript("npm", ["run", "cron:maintenance"]);
  }
  return async ({ guildId, channelId }: any) => {
    logger.job(`Default handler for ${kind}`, { guildId, channelId });
  };
}

/**
 * Get all active jobs (for debugging/monitoring)
 * @returns {Array} List of active job metadata
 */
export function getActiveJobs() {
  return Array.from(activeJobs.values()).map(
    ({ guildId, channelId, kind, hhmm }: any) => ({
      guildId,
      channelId,
      kind,
      hhmm,
    })
  );
}

// Singleton export as default
let _client = null;

function setClient(client: any) {
  _client = client;
}

function runScript(cmd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("error", (error: unknown) => {
      logger.error("[CRON] job spawn failed", {
        cmd,
        args,
        error: getErrorMessage(error),
      });
      resolve();
    });
    p.on("close", (code) => {
      if (code !== 0) {
        logger.error("[CRON] job failed", { cmd, args, code });
      }
      resolve();
    });
  });
}

// Arm maintenance on module load
function armMaintenance() {
  if (maintenanceJobs.length > 0) return;
  maintenanceJobs.push(
    cron.schedule("0 2 * * *", () => runScript("npm", ["run", "metrics"]))
  );
  maintenanceJobs.push(
    cron.schedule("0 3 * * 0", () => runScript("npm", ["run", "reset:leaderboard"]))
  );
  maintenanceJobs.push(
    cron.schedule("15 3 * * 0", () => runScript("npm", ["run", "reset:achievements"]))
  );
  // Daily export of user interactions for continuous learning (4:00 AM)
  maintenanceJobs.push(
    cron.schedule("0 4 * * *", async () => {
      const { weeklyExportJob } = await import("../jobs/exportInteractions.js");
      await weeklyExportJob();
    })
  );
  logger.info("[CRON] Maintenance jobs armed");
}
armMaintenance();

export default { setClient, arm, disarm, bootFromDb, reloadForGuild, getActiveJobs };
