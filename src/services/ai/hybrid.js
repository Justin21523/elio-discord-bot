/**
 * Hybrid AI client for ensemble persona responses with bandit learning.
 * Supports multiple generation strategies and implicit feedback.
 */
import { httpPostJson, httpGetJson } from "./_client.js";

/**
 * Generate a persona response using the hybrid ensemble system.
 *
 * @param {object} params - Request parameters
 * @param {string} params.persona - Persona name
 * @param {string} params.message - User message
 * @param {Array} params.history - Conversation history
 * @param {string} params.userId - User ID for CF scoring
 * @param {string} params.channelId - Channel ID for context
 * @param {number} params.topK - Number of candidates to consider
 * @param {number} params.maxLen - Maximum response length
 * @returns {object} Result with text, strategy, mood, confidence
 */
export async function reply({
  persona,
  message,
  history = [],
  userId = null,
  channelId = null,
  topK = 5,
  maxLen = 80,
}) {
  const res = await httpPostJson("/hybrid/reply", {
    persona,
    message,
    history,
    user_id: userId,
    channel_id: channelId,
    top_k: topK,
    max_len: maxLen,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "hybrid reply failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Batch update bandit weights from engagement feedback.
 *
 * @param {Array} updates - Array of {arm, reward, messageId}
 * @returns {object} Result with new weights
 */
export async function batchUpdateBandit(updates) {
  const res = await httpPostJson("/hybrid/bandit/batch-update", {
    updates,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "bandit update failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Update single bandit arm.
 *
 * @param {string} arm - Arm/strategy name
 * @param {number} reward - Reward value in [0, 1]
 * @returns {object} Result
 */
export async function updateBandit(arm, reward) {
  const res = await httpPostJson("/hybrid/bandit/update", {
    arm,
    reward,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "bandit update failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get current bandit statistics.
 *
 * @returns {object} Bandit stats with weights per arm
 */
export async function getBanditStats() {
  const res = await httpGetJson("/hybrid/bandit/stats");

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "get bandit stats failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Reset bandit to initial state.
 *
 * @param {string} arm - Optional specific arm to reset, or all if null
 * @returns {object} Result
 */
export async function resetBandit(arm = null) {
  const res = await httpPostJson("/hybrid/bandit/reset", {
    arm,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "bandit reset failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get available strategies.
 *
 * @returns {object} List of available strategies with descriptions
 */
export async function getStrategies() {
  const res = await httpGetJson("/hybrid/strategies");

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "get strategies failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Generate response using a specific strategy (for testing).
 *
 * @param {string} strategy - Strategy name
 * @param {object} params - Request parameters
 * @returns {object} Result
 */
export async function replyWithStrategy(strategy, { persona, message, history = [], maxLen = 80 }) {
  const res = await httpPostJson("/hybrid/reply/strategy", {
    strategy,
    persona,
    message,
    history,
    max_len: maxLen,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "strategy reply failed" } };
  }

  return { ok: true, data: res.json.data };
}

export default {
  reply,
  batchUpdateBandit,
  updateBandit,
  getBanditStats,
  resetBandit,
  getStrategies,
  replyWithStrategy,
};
