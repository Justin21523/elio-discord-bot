// /src/util/metrics.js
// English-only code & comments.
// Lightweight in-memory metrics with Prometheus-like concepts.
// - Counters / Histograms / Gauges stored in process memory.
// - startTimer(name, labels?) -> returns stop(extraLabels?) to observe seconds.
// - incCounter(name, labels?, value?)
// - setGauge(name, value, labels?)
// - exportMetrics(): Prometheus exposition text (best-effort)
// - reset(), getMetrics() for debugging
//
// NOTE: This is intentionally simple (no async I/O). Good enough for dev/testing.

const counters = new Map();    // key -> number
const histograms = new Map();  // key -> { count,sum,min,max,buckets:[{le,count}] }
const gauges = new Map();      // key -> number

// Standard metric names used across the project
export const METRIC_NAMES = Object.freeze({
  commands_total: 'commands_total',
  command_latency_seconds: 'command_latency_seconds',
  agent_step_seconds: 'agent_step_seconds',
  jobs_total: 'jobs_total',
  scheduled_jobs: 'scheduled_jobs',
  active_games: 'active_games',
});

/** build a stable key with labels */
function buildKey(name, labels = {}) {
  const keys = Object.keys(labels).sort();
  const parts = keys.map(k => `${k}=${String(labels[k])}`);
  return `${name}|${parts.join(',')}`;
}

/** public: increase a counter */
export function incCounter(name, labels = {}, value = 1) {
  const key = buildKey(name, labels);
  const cur = counters.get(key) || 0;
  counters.set(key, cur + Number(value || 1));
}

/** internal: observe a histogram value (seconds) */
export function observeHistogram(name, value, labels = {}) {
  const key = buildKey(name, labels);

  if (!histograms.has(key)) {
    histograms.set(key, {
      count: 0, sum: 0, min: Infinity, max: -Infinity,
      // default le buckets (seconds)
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10].map(le => ({ le, count: 0 })),
    });
  }
  const h = histograms.get(key);
  const v = Number(value) || 0;

  h.count += 1;
  h.sum += v;
  h.min = Math.min(h.min, v);
  h.max = Math.max(h.max, v);

  for (const b of h.buckets) {
    if (v <= b.le) b.count += 1;
  }
}

/** public: set a gauge */
export function setGauge(name, value, labels = {}) {
  const key = buildKey(name, labels);
  gauges.set(key, Number(value) || 0);
}

/** public: start a timer and return a stop() to observe histogram seconds */
export function startTimer(name, labels = {}) {
  const t0 = Date.now();
  let stopped = false;
  return function stop(extraLabels = {}) {
    if (stopped) return;
    stopped = true;
    const secs = (Date.now() - t0) / 1000;
    observeHistogram(name, secs, { ...labels, ...(extraLabels || {}) });
  };
}

/** Prometheus exposition text (best-effort) */
export function exportMetrics() {
  const lines = [];

  // Gauges
  for (const [key, val] of gauges.entries()) {
    const base = key.split('|')[0];
    const labelsStr = key.includes('|') ? key.split('|')[1] : '';
    const lbl = labelsStr ? `{${labelsStr}}` : '';
    lines.push(`${base}${lbl} ${val}`);
  }

  // Counters
  for (const [key, val] of counters.entries()) {
    const base = key.split('|')[0];
    const labelsStr = key.includes('|') ? key.split('|')[1] : '';
    const lbl = labelsStr ? `{${labelsStr}}` : '';
    lines.push(`${base}_total${lbl} ${val}`);
  }

  // Histograms
  for (const [key, hist] of histograms.entries()) {
    const base = key.split('|')[0];
    const labelsStr = key.includes('|') ? key.split('|')[1] : '';
    const prefix = labelsStr ? `{${labelsStr},` : '{';
    const baseNoLabels = labelsStr ? '' : '';

    for (const b of hist.buckets) {
      lines.push(`${base}_bucket${labelsStr ? `{${labelsStr},le="${b.le}"}` : `{le="${b.le}"}`} ${b.count}`);
    }
    // +Inf bucket
    lines.push(`${base}_bucket${labelsStr ? `{${labelsStr},le="+Inf"}` : `{le="+Inf"}`} ${hist.count}`);
    // sum / count
    lines.push(`${base}_sum${labelsStr ? `{${labelsStr}}` : ''} ${hist.sum}`);
    lines.push(`${base}_count${labelsStr ? `{${labelsStr}}` : ''} ${hist.count}`);
  }

  return lines.join('\n') + '\n';
}

/** Reset all metrics (useful for tests) */
export function reset() {
  counters.clear();
  histograms.clear();
  gauges.clear();
}

/** JSON snapshot for debugging */
export function getMetrics() {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    histograms: Object.fromEntries(
      Array.from(histograms.entries()).map(([k, v]) => [
        k,
        {
          count: v.count,
          sum: v.sum,
          min: v.min,
          max: v.max,
          avg: v.count > 0 ? v.sum / v.count : 0,
        },
      ])
    ),
  };
}

// Back-compat default export (some files import default)
export default {
  incCounter,
  observeHistogram,
  startTimer,
  setGauge,
  exportMetrics,
  reset,
  getMetrics,
  METRIC_NAMES,
};
