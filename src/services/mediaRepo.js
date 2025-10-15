// /src/services/mediaRepo.js
// English-only. Media repository for random drops & CRUD.
// Follows MODULE_INTERFACES.md MediaRepo interface.

import { collections } from '../db/mongo.js';
import { logger } from '../util/logger.js';
import metrics, { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';

const log = logger.child({ svc: 'MediaRepo' });

/** Standard error wrapper */
function err(code, message, cause, details) {
  return { ok: false, error: { code, message, cause, details } };
}

/** Validate minimal shape for add() */
function validateNewItem(item) {
  if (!item || typeof item !== 'object') return 'item required';
  if (!['gif', 'image'].includes(item.type)) return 'type must be "gif"|"image"';
  if (!item.url || typeof item.url !== 'string' || item.url.length < 5) return 'url invalid';
  return null;
}

export const MediaRepo = {
  /**
   * pickRandom({ nsfwAllowed, tags? })
   * - enabled:true
   * - nsfw filter unless allowed
   * - optional tag intersection
   */
  async pickRandom(filter = { nsfwAllowed: false, tags: undefined }) {
    try {
      const stop = startTimer(METRIC_NAMES.agent_step_seconds, { tool: 'media.pickRandom' });
      const q = { enabled: true };
      if (!filter.nsfwAllowed) q.nsfw = { $ne: true };
      if (Array.isArray(filter.tags) && filter.tags.length) {
        q.tags = { $in: filter.tags.map(String) };
      }

      const pipeline = [
        { $match: q },
        { $sample: { size: 1 } },
        { $limit: 1 },
      ];

      const docs = await collections('media').aggregate(pipeline).toArray();
      stop();
      incCounter(METRIC_NAMES.jobs_total, { kind: 'media_pick' }, 1);

      if (!docs || docs.length === 0) return { ok: true, data: null };
      return { ok: true, data: docs[0] };
    } catch (e) {
      log.error('pickRandom failed', { e: String(e) });
      return err('DB_ERROR', 'Failed to pick media', e);
    }
  },

  /** add(item) */
  async add(item) {
    try {
      const v = validateNewItem(item);
      if (v) return err('VALIDATION_FAILED', v);

      const doc = {
        type: item.type,
        url: item.url,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        nsfw: !!item.nsfw,
        enabled: item.enabled !== false,
        addedAt: new Date(),
        addedByUserId: item.addedByUserId ? String(item.addedByUserId) : undefined,
      };

      const res = await collections('media').insertOne(doc);
      incCounter(METRIC_NAMES.jobs_total, { kind: 'media_add' }, 1);
      return { ok: true, data: { insertedId: String(res.insertedId) } };
    } catch (e) {
      // handle duplicate url unique index (if added later)
      return err('DB_ERROR', 'Failed to add media', e);
    }
  },

  /** disable(id) */
  async disable(id) {
    try {
      const { ObjectId } = await import('mongodb');
      const res = await collections('media').updateOne(
        { _id: new ObjectId(String(id)) },
        { $set: { enabled: false, updatedAt: new Date() } }
      );
      return { ok: true, data: { modified: res.modifiedCount > 0 } };
    } catch (e) {
      return err('DB_ERROR', 'Failed to disable media', e);
    }
  },

  /** list({ enabled?, tags?, limit? }) */
  async list(query = {}) {
    try {
      const q = {};
      if (typeof query.enabled === 'boolean') q.enabled = query.enabled;
      if (Array.isArray(query.tags) && query.tags.length) q.tags = { $in: query.tags.map(String) };

      const limit = Number(query.limit || 50);
      const rows = await collections('media')
        .find(q)
        .sort({ addedAt: -1 })
        .limit(limit)
        .toArray();
      return { ok: true, data: rows };
    } catch (e) {
      return err('DB_ERROR', 'Failed to list media', e);
    }
  },
};

export default MediaRepo;
