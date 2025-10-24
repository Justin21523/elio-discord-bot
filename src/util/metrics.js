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

/**
 * Start a timer and return a stop function
 * @param {string} name - Metric name
 * @param {Object} labels - Initial labels
 * @returns {Function} Stop function that observes the histogram
 */
export function startTimer(name, labels = {}) {
  const start = Date.now();
  return (additionalLabels = {}) => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    observeHistogram(name, duration, { ...labels, ...additionalLabels });
  };
}

/**
 * Common metric names used across the application
 */
export const METRIC_NAMES = {
  commands_total: 'commands_total',
  command_latency_seconds: 'command_latency_seconds',
  jobs_total: 'jobs_total',
  job_latency_seconds: 'job_latency_seconds',
  scheduled_jobs: 'scheduled_jobs',
  agent_step_seconds: 'agent_step_seconds',
  agent_steps_total: 'agent_steps_total',
  game_wins_total: 'game_wins_total',
  db_operations_total: 'db_operations_total',
  db_operation_latency_seconds: 'db_operation_latency_seconds',
  ai_requests_total: 'ai_requests_total',
  ai_request_latency_seconds: 'ai_request_latency_seconds',
  // RAG and Message Router metrics
  persona_replies_total: 'persona_replies_total',
  persona_replies_failed_total: 'persona_replies_failed_total',
  messages_moderated_total: 'messages_moderated_total',
  messages_ignored_total: 'messages_ignored_total',
  message_route_seconds: 'message_route_seconds',
  message_route_errors_total: 'message_route_errors_total',
  // Job metrics
  auto_scenarios_posted_total: 'auto_scenarios_posted_total',
  auto_scenarios_errors_total: 'auto_scenarios_errors_total',
  media_sweep_added_total: 'media_sweep_added_total',
  media_sweep_errors_total: 'media_sweep_errors_total',
  cosmic_digest_posted_total: 'cosmic_digest_posted_total',
  cosmic_digest_errors_total: 'cosmic_digest_errors_total',
  channel_summaries_posted_total: 'channel_summaries_posted_total',
  channel_summary_errors_total: 'channel_summary_errors_total',
  media_posts_total: 'media_posts_total',
  agent_runs_total: 'agent_runs_total',
};

// Backward compatibility aliases
export const incrementCounter = incCounter;
