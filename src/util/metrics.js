/**
 * util/metrics.js
 * Simple in-memory metrics collection.
 * In production, consider Prometheus client for proper exposition.
 */

const counters = new Map();
const histograms = new Map();
const gauges = new Map();

/**
 * Increment a counter
 * @param {string} name - Metric name
 * @param {Object} labels - Label key-value pairs
 * @param {number} value - Amount to increment (default 1)
 */
export function incCounter(name, labels = {}, value = 1) {
  const key = serializeKey(name, labels);
  const current = counters.get(key) || 0;
  counters.set(key, current + value);
}

/**
 * Observe a histogram value
 * @param {string} name - Metric name
 * @param {number} value - Observed value
 * @param {Object} labels - Label key-value pairs
 */
export function observeHistogram(name, value, labels = {}) {
  const key = serializeKey(name, labels);
  const observations = histograms.get(key) || [];
  observations.push(value);
  histograms.set(key, observations);
}

/**
 * Set a gauge value
 * @param {string} name - Metric name
 * @param {number} value - Gauge value
 * @param {Object} labels - Label key-value pairs
 */
export function setGauge(name, value, labels = {}) {
  const key = serializeKey(name, labels);
  gauges.set(key, value);
}

/**
 * Serialize metric key with labels
 */
function serializeKey(name, labels) {
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return labelStr ? `${name}{${labelStr}}` : name;
}

/**
 * Get all metrics (for debugging or exposition)
 */
export function getAllMetrics() {
  return {
    counters: Object.fromEntries(counters),
    histograms: Object.fromEntries(
      Array.from(histograms.entries()).map(([key, values]) => [
        key,
        {
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
        },
      ])
    ),
    gauges: Object.fromEntries(gauges),
  };
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  counters.clear();
  histograms.clear();
  gauges.clear();
}
