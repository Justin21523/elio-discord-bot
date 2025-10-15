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