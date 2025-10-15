// src/services/ai/status.js
// Health status aggregator for AI sidecar + MongoDB + RAG/AVS quick checks.
// All public APIs return Result<T> and never throw across module boundaries.

import { httpGet } from './_client.js';
import { getDb } from "../../db/mongo.js";
import { logInfo, logError } from "../../util/logger.js";

/** Result helpers */
function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

/** Config from env with sane defaults */
const AI_HEALTH_URL =
  process.env.AI_HEALTH_URL ||
  process.env.AI__HEALTH_URL ||
  "http://localhost:8088/health";

const FETCH_TIMEOUT_MS = Number(process.env.AI_HEALTH_TIMEOUT_MS || 4000);

export async function health() {
  try {
    const res = await httpGet('/health');
    // httpGet returns: { status, json }
    if (res.status >= 400) {
      return {
        ok: false,
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'AI sidecar /health returned HTTP ' + res.status,
          details: { status: res.status, body: res.json },
        },
      };
    }
    // Sidecar contract: { ok: boolean, service, features, versions, device, llm, vlm, embeddings, mongo, atlas }
    const body = res.json || {};
    if (body && body.ok === false) {
      return {
        ok: false,
        error: {
          code: 'AI_MODEL_ERROR',
          message: 'AI sidecar reported not ok',
          details: body,
        },
      };
    }
    return { ok: true, data: body };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Failed to query AI sidecar /health',
        cause: err,
      },
    };
  }
}

/**
 * Fetch sidecar /health with timeout (Node 20 has global fetch & AbortController).
 */
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(t);
  }
}

/**
 * getStatus()
 * - ai: sidecar features/models/devices
 * - db: ping + quick collection counts
 * - rag: minimal AVS readiness (collection known + docs count)
 */
export async function getStatus() {
  try {
    // Sidecar
    let ai = { reachable: false };
    try {
      const r = await fetchWithTimeout(AI_HEALTH_URL, FETCH_TIMEOUT_MS);
      ai = {
        reachable: !!r?.ok,
        http: r?.status ?? 0,
        features: r?.json?.features ?? {},
        models: r?.json?.models ?? {},
        devices: r?.json?.devices ?? {},
        version: r?.json?.version ?? null,
      };
    } catch (cause) {
      // keep reachable=false
      logError(cause, { phase: "ai_health_fetch", url: AI_HEALTH_URL });
    }

    // DB / RAG
    let db = { reachable: false };
    let rag = { collection: "rag_docs", count: 0, ok: false };
    try {
      const database = getDb();
      // ping
      const ping = await database.command({ ping: 1 });
      db.reachable = ping?.ok === 1;

      // basic counts (do not rely on AVS admin apis here; just presence & count)
      const col = database.collection("rag_docs");
      if (col) {
        rag.count = await col.estimatedDocumentCount();
        rag.ok = true;
      }
    } catch (cause) {
      logError(cause, { phase: "db_ping_or_counts" });
    }

    const summary = {
      ai,
      db,
      rag,
      ok: ai.reachable && db.reachable,
    };

    logInfo("[JOB][ai-status] polled", {
      ai_ok: ai.reachable,
      db_ok: db.reachable,
      rag_docs: rag.count,
    });

    return ok(summary);
  } catch (cause) {
    return err("DEPENDENCY_UNAVAILABLE", "Status aggregation failed", cause);
  }
}
