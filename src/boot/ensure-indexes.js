// src/boot/ensure-indexes.js
// DB boot helper: connect to Mongo and ensure indexes idempotently.

import { connectMongo, ensureIndexes } from "../db/mongo.js";

export async function bootDbIndexes() {
  const t0 = Date.now();
  const conn = await connectMongo();
  if (!conn.ok) {
    console.error("[JOB][indexes][ERR] Mongo connect failed", conn.error);
    return { ok: false, error: conn.error };
  }
  try {
    await ensureIndexes();
    const ms = ((Date.now() - t0) / 1000).toFixed(3);
    console.log("[JOB] indexes ensured", { latency_s: ms });
    return { ok: true, data: { latency_s: Number(ms) } };
  } catch (cause) {
    console.error("[JOB][ERR] ensureIndexes failed", cause);
    return { ok: false, error: { code: "DB_ERROR", message: "ensureIndexes failed", cause } };
  }
}
