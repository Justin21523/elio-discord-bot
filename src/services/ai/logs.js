// /src/services/ai/logs.js
// English-only code & comments.
//
// Facade to read AI agent logs stored in MongoDB ("ai_logs").
// Provides:
//   - listRuns({ guildId?, kind?, limit? }) -> recent runs (thin rows)
//   - getRun(id) -> single run with full step traces
//
// All public APIs return Result<T> and never throw across module boundary.

import { ObjectId } from 'mongodb';
import { collections } from '../../db/mongo.js';

/**
 * @typedef {{ code: string, message: string, cause?: unknown, details?: Record<string, unknown> }} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result<T>
 */

function col() {
  const c = collections?.ai_logs;
  return c ?? null;
}

function toId(x) {
  try {
    return typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x) ? new ObjectId(x) : x;
  } catch { return x; }
}

function calcDurationMs(doc) {
  if (typeof doc?.durationMs === 'number') return doc.durationMs;
  const a = doc?.createdAt ? new Date(doc.createdAt).getTime() : null;
  const b = doc?.endedAt ? new Date(doc.endedAt).getTime() : null;
  return (a && b) ? Math.max(0, b - a) : undefined;
}

function normalizeRow(doc) {
  return {
    id: String(doc._id),
    kind: doc.kind || 'unknown',
    ok: Boolean(doc.ok ?? (doc.status === 'ok')),
    durationMs: calcDurationMs(doc),
    createdAt: doc.createdAt,
    guildId: doc.guildId || null,
    channelId: doc.channelId || null,
    userId: doc.userId || null,
  };
}

function normalizeFull(doc) {
  const steps = Array.isArray(doc.steps) ? doc.steps.map((s) => ({
    label: s.label || s.name || 'step',
    ok: Boolean(s.ok ?? (s.error ? false : true)),
    startedAt: s.startedAt || null,
    endedAt: s.endedAt || null,
    durationMs: typeof s.durationMs === 'number'
      ? s.durationMs
      : (s.startedAt && s.endedAt ? (new Date(s.endedAt) - new Date(s.startedAt)) : undefined),
    tokensIn: s.tokensIn ?? s.token_in ?? null,
    tokensOut: s.tokensOut ?? s.token_out ?? null,
    tool: s.tool || null,
    error: s.error ? (typeof s.error === 'string' ? s.error : (s.error.message || 'error')) : undefined,
  })) : [];

  return {
    id: String(doc._id),
    kind: doc.kind || 'unknown',
    ok: Boolean(doc.ok ?? (doc.status === 'ok')),
    status: doc.status || (doc.ok ? 'ok' : 'error'),
    createdAt: doc.createdAt || null,
    endedAt: doc.endedAt || null,
    durationMs: calcDurationMs(doc),
    guildId: doc.guildId || null,
    channelId: doc.channelId || null,
    userId: doc.userId || null,
    model: doc.model || null,
    meta: doc.meta || {},
    steps,
    error: doc.error ? (typeof doc.error === 'string' ? doc.error : (doc.error.message || 'error')) : undefined,
  };
}

/**
 * List recent runs.
 * @param {{ guildId?: string, kind?: string, limit?: number }} params
 * @returns {Promise<Result<{ rows: Array }>>}
 */
export async function listRuns({ guildId, kind, limit = 20 } = {}) {
  try {
    const c = col();
    if (!c) {
      return { ok: false, error: { code: 'DB_ERROR', message: 'ai_logs collection not available' } };
    }

    const q = {};
    if (guildId) q.guildId = guildId;
    if (kind) q.kind = kind;

    const lim = Math.max(1, Math.min(Number(limit) || 20, 100));

    // Project minimal fields for listing; exclude heavy 'steps'
    const cursor = c.find(q, {
      projection: { steps: 0, meta: 0 },
      sort: { createdAt: -1, _id: -1 },
      limit: lim,
    });

    const docs = await cursor.toArray();
    const rows = docs.map(normalizeRow);

    return { ok: true, data: { rows } };
  } catch (err) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'Failed to list AI runs', cause: err } };
  }
}

/**
 * Get one run by id (with full step traces).
 * @param {string} id
 * @returns {Promise<Result<any>>}
 */
export async function getRun(id) {
  try {
    const c = col();
    if (!c) {
      return { ok: false, error: { code: 'DB_ERROR', message: 'ai_logs collection not available' } };
    }
    const _id = toId(id);
    const doc = await c.findOne({ _id });
    if (!doc) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'AI log not found', details: { id } } };
    }
    return { ok: true, data: normalizeFull(doc) };
  } catch (err) {
    return { ok: false, error: { code: 'DB_ERROR', message: 'Failed to get AI run', cause: err, details: { id } } };
  }
}
