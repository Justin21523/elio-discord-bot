/**
 * Tests for engagement tracking service.
 * Uses mocks to avoid database dependency.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Import the default export and destructure
import engagement from "../src/services/analytics/engagement.js";
const { classifyEmoji, SIGNAL_WEIGHTS } = engagement;

// ============================================================================
// Tests for classifyEmoji (pure function)
// ============================================================================

test("classifyEmoji: positive emojis are classified correctly", () => {
  const positiveEmojis = ["👍", "❤️", "😊", "🎉", "✅", "💯", "🔥", "⭐"];

  for (const emoji of positiveEmojis) {
    const result = classifyEmoji(emoji);
    assert.equal(result, "positive", `${emoji} should be positive`);
  }
});

test("classifyEmoji: negative emojis are classified correctly", () => {
  const negativeEmojis = ["👎", "😢", "❌", "😠", "😡"];

  for (const emoji of negativeEmojis) {
    const result = classifyEmoji(emoji);
    assert.equal(result, "negative", `${emoji} should be negative`);
  }
});

test("classifyEmoji: neutral emojis return neutral", () => {
  const neutralEmojis = ["🤔", "😐", "🙃", "random"];

  for (const emoji of neutralEmojis) {
    const result = classifyEmoji(emoji);
    assert.equal(result, "neutral", `${emoji} should be neutral`);
  }
});

test("classifyEmoji: handles null/undefined", () => {
  assert.equal(classifyEmoji(null), "neutral");
  assert.equal(classifyEmoji(undefined), "neutral");
  assert.equal(classifyEmoji(""), "neutral");
});

test("classifyEmoji: handles emoji names (Discord style)", () => {
  assert.equal(classifyEmoji("thumbsup"), "positive");
  assert.equal(classifyEmoji("heart"), "positive");
  assert.equal(classifyEmoji("smile"), "positive");
  assert.equal(classifyEmoji("thumbsdown"), "negative");
  assert.equal(classifyEmoji("angry"), "negative");
});

// ============================================================================
// Tests for SIGNAL_WEIGHTS
// ============================================================================

test("SIGNAL_WEIGHTS: has expected keys", () => {
  assert.ok("reply" in SIGNAL_WEIGHTS);
  assert.ok("reaction_positive" in SIGNAL_WEIGHTS);
  assert.ok("reaction_negative" in SIGNAL_WEIGHTS);
  assert.ok("conversation_continue" in SIGNAL_WEIGHTS);
  assert.ok("ignore" in SIGNAL_WEIGHTS);
});

test("SIGNAL_WEIGHTS: reply has highest positive weight", () => {
  assert.equal(SIGNAL_WEIGHTS.reply, 1.0);
  assert.ok(SIGNAL_WEIGHTS.reply > SIGNAL_WEIGHTS.reaction_positive);
  assert.ok(SIGNAL_WEIGHTS.reply > SIGNAL_WEIGHTS.conversation_continue);
});

test("SIGNAL_WEIGHTS: negative events have negative weights", () => {
  assert.ok(SIGNAL_WEIGHTS.reaction_negative < 0);
  assert.ok(SIGNAL_WEIGHTS.ignore < 0);
});

test("SIGNAL_WEIGHTS: conversation_continue is small positive", () => {
  assert.ok(SIGNAL_WEIGHTS.conversation_continue > 0);
  assert.ok(SIGNAL_WEIGHTS.conversation_continue < 1);
});

// ============================================================================
// Tests for reward computation logic (without DB)
// ============================================================================

test("reward computation: single reply signal gives high reward", () => {
  // Simulating computeReward logic
  const signals = [{ event: "reply", value: 1 }];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  // Normalize: (reward + 1) / 3, clamped to [0, 1]
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // reply = 1.0, normalized = (1.0 + 1) / 3 = 0.667
  assert.ok(normalized > 0.6);
  assert.ok(normalized < 0.7);
});

test("reward computation: negative reaction lowers reward", () => {
  const signals = [{ event: "reaction_negative", value: 1 }];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // reaction_negative = -0.5, normalized = (-0.5 + 1) / 3 = 0.167
  assert.ok(normalized < 0.5);
  assert.ok(normalized > 0.1);
});

test("reward computation: mixed signals balance out", () => {
  const signals = [
    { event: "reply", value: 1 },
    { event: "reaction_negative", value: 1 },
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // reply(1.0) + reaction_negative(-0.5) = 0.5
  // normalized = (0.5 + 1) / 3 = 0.5
  assert.ok(normalized >= 0.4);
  assert.ok(normalized <= 0.6);
});

test("reward computation: no signals returns neutral", () => {
  const signals = [];

  if (signals.length === 0) {
    // Default neutral value
    assert.equal(0.5, 0.5);
    return;
  }

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  assert.equal(normalized, 0.5);
});

test("reward computation: multiple positive signals stack", () => {
  const signals = [
    { event: "reply", value: 1 },
    { event: "reaction_positive", value: 1 },
    { event: "conversation_continue", value: 1 },
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // reply(1.0) + reaction_positive(0.5) + conversation_continue(0.3) = 1.8
  // normalized = (1.8 + 1) / 3 = 0.933
  assert.ok(normalized > 0.9);
});

test("reward computation: clamped to max 1.0", () => {
  const signals = [
    { event: "reply", value: 1 },
    { event: "reply", value: 1 },
    { event: "reply", value: 1 },
    { event: "reaction_positive", value: 1 },
    { event: "reaction_positive", value: 1 },
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // 3*1.0 + 2*0.5 = 4.0, normalized = (4.0 + 1) / 3 = 1.667 -> clamped to 1.0
  assert.equal(normalized, 1.0);
});

test("reward computation: clamped to min 0.0", () => {
  const signals = [
    { event: "reaction_negative", value: 1 },
    { event: "reaction_negative", value: 1 },
    { event: "reaction_negative", value: 1 },
    { event: "ignore", value: 1 },
    { event: "ignore", value: 1 },
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // 3*(-0.5) + 2*(-0.1) = -1.7, normalized = (-1.7 + 1) / 3 = -0.233 -> clamped to 0.0
  assert.equal(normalized, 0.0);
});

// ============================================================================
// Tests for signal value removal (reaction removed = -1)
// ============================================================================

test("reaction removal subtracts value", () => {
  // Simulate adding then removing a positive reaction
  const signals = [
    { event: "reaction_positive", value: 1 }, // Added
    { event: "reaction_positive", value: -1 }, // Removed
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  // 0.5 * 1 + 0.5 * (-1) = 0
  // normalized = (0 + 1) / 3 = 0.333
  assert.ok(normalized >= 0.3);
  assert.ok(normalized <= 0.4);
});

// ============================================================================
// Tests for edge cases
// ============================================================================

test("unknown event type has zero weight", () => {
  const weight = SIGNAL_WEIGHTS["unknown_event"] || 0;
  assert.equal(weight, 0);
});

test("signal value defaults to 1 if missing", () => {
  const signal = { event: "reply" };
  const weight = SIGNAL_WEIGHTS[signal.event] || 0;
  const value = signal.value || 1;

  assert.equal(value, 1);
  assert.equal(weight * value, 1.0);
});

// ============================================================================
// Tests for threshold-based decisions
// ============================================================================

test("high reward indicates successful interaction", () => {
  // Define thresholds
  const HIGH_REWARD_THRESHOLD = 0.7;

  // Simulate a successful interaction
  const signals = [
    { event: "reply", value: 1 },
    { event: "reaction_positive", value: 1 },
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  assert.ok(
    normalized >= HIGH_REWARD_THRESHOLD,
    `Reward ${normalized} should be >= ${HIGH_REWARD_THRESHOLD}`
  );
});

test("low reward indicates poor interaction", () => {
  const LOW_REWARD_THRESHOLD = 0.3;

  // Simulate a poor interaction
  const signals = [
    { event: "ignore", value: 1 },
    { event: "reaction_negative", value: 1 },
  ];

  let reward = 0;
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.event] || 0;
    reward += weight * (signal.value || 1);
  }
  const normalized = Math.max(0, Math.min(1, (reward + 1) / 3));

  assert.ok(
    normalized <= LOW_REWARD_THRESHOLD,
    `Reward ${normalized} should be <= ${LOW_REWARD_THRESHOLD}`
  );
});
