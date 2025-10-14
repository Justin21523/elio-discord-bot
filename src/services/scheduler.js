// Scheduler service (Mongo-backed + node-cron runner)
// English-only. Public API: bootFromDb, arm, reloadForGuild, list, remove, setClient, setJobRunner.

import cron from 'node-cron';
import { collections } from '../db/mongo.js';
import { logInfo, logError } from '../util/logger.js';
import { incCounter, startTimer, METRIC_NAMES, setGauge  } from '../util/metrics.js';

const runners = new Map(); // key: `${guildId}:${kind}` -> { task, spec, channelId, meta }
let _client = null;
let _jobRunner = null; // optional: (kind, doc) => Promise<void>

export function setClient(client) { _client = client; }
export function setJobRunner(fn) { _jobRunner = fn; }
function key(guildId, kind) { return `${guildId}:${kind}`; }

async function scheduleOne(doc) {
  const { guildId, channelId, kind, spec, meta } = doc;
  const k = key(guildId, kind);

  // stop previous if exists
  const ex = runners.get(k);
  if (ex?.task) ex.task.stop();

  const task = cron.schedule(spec, async () => {
    const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'job' });
    try {
      incCounter(METRIC_NAMES.jobs_total, { kind });
      if (typeof _jobRunner === 'function') {
        await _jobRunner(kind, { guildId, channelId, meta: meta || {}, spec });
      } else if (_client && channelId) {
        const ch = await _client.channels.fetch(channelId).catch(() => null);
        if (ch?.isTextBased()) {
          await ch.send(`🛰️ Job **${kind}** fired @ ${new Date().toISOString()}`);
        }
      }
    } catch (e) {
      logError('[JOB]', { guildId, channelId, kind, error: String(e) });
    } finally {
      stop();
    }
  });

  runners.set(k, { task, spec, channelId, meta });
  setGauge(METRIC_NAMES.scheduled_jobs, runners.size);
  logInfo('[JOB] armed', { guildId, kind, spec, channelId });
}


/** Boot from DB: schedule all enabled jobs */
export async function bootFromDb() {
  try {
    const docs = await collections.jobs.find({ enabled: true }).toArray();
    for (const d of docs) await scheduleOne(d);
    return { ok: true, data: { count: docs.length } };
  } catch (e) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'bootFromDb failed', cause: String(e) } };
  }
}

/** Upsert & arm (idempotent by {guildId, kind}) */
export async function arm({ guildId, channelId, kind, hhmm, meta = {} } = {}) {
  if (!guildId || !channelId || !kind || !/^\d{1,2}:\d{2}$/.test(hhmm || '')) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid arm() params' } };
  }
  try {
    const [hh, mm] = (hhmm || '0:0').split(':').map(Number);
    const spec = `${mm} ${hh} * * *`;

    const res = await collections.jobs.findOneAndUpdate(
      { guildId, kind },
      {
        $set: {
          guildId, kind, channelId, spec, meta, enabled: true, updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );

    await scheduleOne(res.value);
    return { ok: true, data: { spec, meta } };
  } catch (e) {
    const dup = String(e).includes('E11000');
    return { ok: false, error: { code: dup ? 'VALIDATION_FAILED' : 'DB_ERROR', message: 'arm failed', cause: String(e) } };
  }
}


/** Reload all jobs for a guild */
export async function reloadForGuild(guildId) {
  try {
    for (const [k, v] of runners) {
      if (k.startsWith(`${guildId}:`)) { v.task?.stop?.(); runners.delete(k); }
    }
    const docs = await collections.jobs.find({ guildId, enabled: true }).toArray();
    for (const d of docs) await scheduleOne(d);
    return { ok: true, data: { count: docs.length } };
  } catch (e) {
    return { ok: false, error: { code: 'SCHEDULE_ERROR', message: 'reloadForGuild failed', cause: String(e) } };
  }
}

/** NEW: Arm an existing job (enable + schedule) by {guildId, kind} */
export async function armOne({ guildId, kind }) {
  if (!guildId || !kind) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'guildId and kind are required' } };
  }
  try {
    const doc = await collections.jobs.findOne({ guildId, kind });
    if (!doc) return { ok: false, error: { code: 'NOT_FOUND', message: 'job not found', details: { guildId, kind } } };

    // ensure enabled
    if (!doc.enabled) {
      await collections.jobs.updateOne({ guildId, kind }, { $set: { enabled: true, updatedAt: new Date() } });
      doc.enabled = true;
    }
    await scheduleOne(doc);
    return { ok: true, data: { meta: doc.meta || {} } };
  } catch (e) {
    return { ok: false, error: { code: 'SCHEDULE_ERROR', message: 'armOne failed', cause: String(e), details: { guildId, kind } } };
  }
}

/** Optional helpers */
export async function list(guildId) {
  try {
    const docs = await collections.jobs.find(guildId ? { guildId } : {}).toArray();
    return { ok: true, data: { rows: docs } };
  } catch (e) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'list failed', cause: String(e) } };
  }
}

export async function remove({ guildId, kind }) {
  try {
    const k = key(guildId, kind);
    const ex = runners.get(k);
    if (ex) { ex.task?.stop?.(); runners.delete(k); setGauge(METRIC_NAMES.scheduled_jobs, runners.size); }
    const res = await collections.jobs.deleteOne({ guildId, kind });
    return { ok: true, data: { deleted: res.deletedCount || 0 } };
  } catch (e) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'remove failed', cause: String(e) } };
  }
}