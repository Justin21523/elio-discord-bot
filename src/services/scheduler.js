<<<<<<< HEAD
/**
 * services/scheduler.js
 * Idempotent job scheduler using node-cron.
 * Loads schedules from DB on boot, supports dynamic arm/disarm.
 */

import cron from "node-cron";
import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";

// Active cron jobs keyed by {guildId}_{kind}
const activeJobs = new Map();

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
    return { ok: true, data: { total: schedules.length, armed } };
  } catch (error) {
    logger.error("Failed to boot scheduler", { error: error.message });
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
export async function arm({ guildId, channelId, kind, hhmm, handler }) {
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
      } catch (error) {
        logger.error("Scheduled job failed", {
          guildId,
          kind,
          error: error.message,
        });
      }
    });

    activeJobs.set(jobKey, { task, guildId, channelId, kind, hhmm });

    logger.job("Job armed", { guildId, kind, hhmm, cronExpression });
    return { ok: true, data: { guildId, kind, hhmm } };
  } catch (error) {
    logger.error("Failed to arm job", {
      guildId,
      kind,
      error: error.message,
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
export async function disarm({ guildId, kind }) {
  try {
    const jobKey = `${guildId}_${kind}`;
    const existing = activeJobs.get(jobKey);

    if (existing) {
      existing.task.stop();
      activeJobs.delete(jobKey);
      logger.job("Job disarmed", { guildId, kind });
    }

    return { ok: true, data: { guildId, kind, disarmed: !!existing } };
  } catch (error) {
    logger.error("Failed to disarm job", {
      guildId,
      kind,
      error: error.message,
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
export async function reloadForGuild(guildId) {
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
  } catch (error) {
    logger.error("Failed to reload schedules", {
      guildId,
      error: error.message,
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
function getDefaultHandler(kind) {
  // Import handlers dynamically to avoid circular dependencies
  return async ({ guildId, channelId }) => {
    logger.job(`Default handler for ${kind}`, { guildId, channelId });
    // Handler implementation will be added per phase
    // For now, just log
  };
}

/**
 * Get all active jobs (for debugging/monitoring)
 * @returns {Array} List of active job metadata
 */
export function getActiveJobs() {
  return Array.from(activeJobs.values()).map(
    ({ guildId, channelId, kind, hhmm }) => ({
      guildId,
      channelId,
      kind,
      hhmm,
    })
  );
=======
// /src/services/scheduler.js
// Node-cron based scheduler. Idempotent jobs keyed by {guildId, kind}.
// It can arm jobs from DB and fire domain actions (media drop, ...).

import cron from 'node-cron';
import { collections } from '../db/mongo.js';
import { logger } from '../util/logger.js';
import { incCounter, setGauge, startTimer, METRIC_NAMES } from '../util/metrics.js';
import MediaRepo from './mediaRepo.js';
import { postGreeting } from './greetings.js';

const log = logger.child({ svc: 'Scheduler' });

let _client = null; // discord.js client
const jobs = new Map(); // key -> cron task
const toKey = ({ guildId, kind }) => `${guildId}:${kind}`;

function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

/** Inject discord client (index.js on boot). */
export function setClient(client) { _client = client; }


/** Internal runner for a scheduled job. */
async function runJob({ guildId, channelId, kind }) {
  const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: `job.${kind}` });
  try {
    if (!_client) throw new Error('Discord client not set');

    if (kind === 'drop') {
      const pick = await MediaRepo.pickRandom({ nsfwAllowed: false });
      if (!pick.ok || !pick.data) {
        log.warn('No media available for drop', { guildId, channelId });
        stop(); return;
      }
      const ch = await _client.channels.fetch(String(channelId));
      if (!ch?.isTextBased()) throw new Error('Channel not text-based');
      const media = pick.data;
      const content = media.type === 'gif' ? media.url : undefined;
      const embed = media.type === 'image'
        ? {
            title: '🎁 Daily Drop',
            description: media.tags?.length ? `Tags: ${media.tags.join(', ')}` : undefined,
            image: { url: media.url }
          }
        : undefined;
      await ch.send({ content, embeds: embed ? [embed] : [] });
      incCounter(METRIC_NAMES.jobs_total, { kind: 'drop' }, 1);
      stop(); return;
    }

    if (kind === 'greet') {
      const ctx = { guildId, guildName: '', userTag: '', weekday: new Date().toLocaleDateString('en-US', { weekday: 'long' }) };
      const res = await postGreeting({ channelId, personaName: 'Elio', tags: undefined, context: ctx });
      if (!res.ok) log.warn('postGreeting failed', { err: res.error });
      incCounter(METRIC_NAMES.jobs_total, { kind: 'greet' }, 1);
      stop(); return;
    }

    log.warn('Unsupported job kind', { kind });
    stop();
  } catch (e) {
    log.error('Job run failed', { guildId, channelId, kind, e: String(e) });
  }
}

/** Arm one cron job (idempotent in-memory). Does NOT write DB. */
export async function arm({ guildId, channelId, kind, hhmm }) {
  try {
    if (!/^\d{2}:\d{2}$/.test(String(hhmm))) {
      return err('VALIDATION_FAILED', 'hhmm must be HH:MM (00-23:00-59)');
    }
    const [H, M] = String(hhmm).split(':').map(Number);
    const expr = `${M} ${H} * * *`; // UTC minute-hour daily

    const key = toKey({ guildId, kind });
    const existing = jobs.get(key);
    if (existing) {
      existing.stop();
      jobs.delete(key);
    }

    const task = cron.schedule(
      expr,
      () => runJob({ guildId, channelId, kind }),
      { timezone: 'UTC' }
    );
    jobs.set(key, task);
    setGauge(METRIC_NAMES.scheduled_jobs, jobs.size);
    return ok({ jobKey: key });
  } catch (e) {
    return err('SCHEDULE_ERROR', 'Failed to arm job', e);
  }
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
}

/** Disarm one job in memory. */
export async function disarm({ guildId, kind }) {
  try {
    const key = toKey({ guildId, kind });
    const t = jobs.get(key);
    if (t) { t.stop(); jobs.delete(key); }
    setGauge(METRIC_NAMES.scheduled_jobs, jobs.size);
    return ok({ removed: !!t });
  } catch (e) {
    return err('SCHEDULE_ERROR', 'Failed to disarm', e);
  }
}

/** Boot all enabled schedules from DB and arm them. */
export async function bootFromDb() {
  try {
    const rows = await collections('schedules')
      .find({ enabled: true })
      .project({ guildId: 1, channelId: 1, kind: 1, hhmm: 1 })
      .toArray();

    let count = 0;
    for (const s of rows) {
      const a = await arm({
        guildId: String(s.guildId),
        channelId: String(s.channelId),
        kind: String(s.kind),
        hhmm: String(s.hhmm),
      });
      if (a.ok) count++;
    }
    setGauge(METRIC_NAMES.scheduled_jobs, jobs.size);
    log.info('[JOB] bootFromDb armed', { count });
    return ok({ armed: count });
  } catch (e) {
    return err('SCHEDULE_ERROR', 'Failed to boot schedules', e);
  }
}

/** Reload all jobs for a guild from DB (disarm + arm). */
export async function reloadForGuild(guildId) {
  try {
    // Disarm current
    for (const key of Array.from(jobs.keys())) {
      if (key.startsWith(`${guildId}:`)) {
        const t = jobs.get(key);
        if (t) t.stop();
        jobs.delete(key);
      }
    }
    // Re-arm
    const rows = await collections('schedules').find({ guildId: String(guildId), enabled: true }).toArray();
    let count = 0;
    for (const s of rows) {
      const a = await arm({ guildId: String(s.guildId), channelId: String(s.channelId), kind: String(s.kind), hhmm: String(s.hhmm) });
      if (a.ok) count++;
    }
    setGauge(METRIC_NAMES.scheduled_jobs, jobs.size);
    return ok({ armed: count });
  } catch (e) {
    return err('SCHEDULE_ERROR', 'Failed to reload guild schedules', e);
  }
}

export default { setClient, arm, disarm, bootFromDb, reloadForGuild };