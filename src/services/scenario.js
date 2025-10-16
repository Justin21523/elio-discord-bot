// src/services/scenario.js
// Scenario quiz engine with weighted picking, timed reveal and speed-based scoring.
// Keeps your original guarantees: one active session per (guildId, channelId),
// unique answer per user, optional AI distractors, metrics gauges.

import { withCollection } from "../db/mongo.js";
import { incCounter, setGauge } from "../util/metrics.js";
import * as Points from "./points.js";

function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

const SESSIONS = "scenario_sessions";
const ANSWERS = "scenario_answers";
const SCENARIOS = "scenarios";

// ---- Scoring policy (tweak freely; all numbers are safe defaults)
const DEFAULTS = {
  durationSec: 30,          // how long a question stays open
  basePoints: 30,           // minimum for a correct answer (even at the last second)
  maxPoints: 100,           // max points for instant answer (correct and first millisecond)
  firstCorrectBonus: 25,    // extra bonus to the first correct user
};

export async function startSession({ guildId, channelId, scenarioId = null, tag = null, mode = "quiz", aiFacade = null }) {
  const now = new Date();
  try {
    // Ensure at most one active session
    const exists = await withCollection(SESSIONS, (col) => col.findOne({ guildId, channelId, active: true }));
    if (exists) return err("VALIDATION_FAILED", "An active session already exists in this channel.");

    // Pick scenario (weighted by `weight`)
    const scenario = await pickScenario({ scenarioId, tag });
    if (!scenario) return err("RAG_EMPTY", "No scenario available for given filter.");

    // Normalize 4 options; optionally ask AI to fill distractors
    let options = Array.isArray(scenario.options) ? [...scenario.options] : [];
    if (options.length < 4 && aiFacade) {
      try {
        const need = Math.max(0, 4 - options.length);
        if (need > 0) {
          const more = await aiFacade.generateDistractors({
            prompt: scenario.prompt,
            correct: options[scenario.correctIndex ?? 0],
            need,
            tag,
          });
          if (Array.isArray(more) && more.length) options = [...options, ...more].slice(0, 4);
        }
      } catch { /* optional AI hook */ }
    }
    if (options.length < 2) return err("VALIDATION_FAILED", "Scenario has insufficient options.");

    const doc = {
      guildId,
      channelId,
      scenarioId: scenario._id,
      prompt: scenario.prompt,
      options,
      correctIndex: scenario.correctIndex ?? 0,
      mode,
      active: true,
      createdAt: now,
      startedAt,
      expireAt,
      revealAt: null,
      winnerUserId: null,
      winnerScore: null,
      // meta
      hostPersonaName: scenario.hostPersonaName || null,
      tags: Array.isArray(scenario.tags) ? scenario.tags : [],
      durationSec: Math.max(5, durationSec),
      firstCorrectUserId: null
    };

    const inserted = await withCollection(SESSIONS, async (col) => {
      const { insertedId } = await col.insertOne(doc);
      return await col.findOne({ _id: insertedId });
    });

    incCounter("commands_total", { command: "scenario.start" });
    const activeCount = await withCollection(SESSIONS, c => c.countDocuments({ active: true }));
    setGauge("active_games", activeCount, {});

    return ok({
      session: sanitize(inserted)
    });
  } catch (cause) {
    const msg = /E11000/.test(String(cause)) ? "Active session already exists." : "Failed to start session.";
    return err("SCHEDULE_ERROR", msg, cause);
  }
}

/**
 * Answer:
 * - Guards duplicate answers per user
 * - Computes correctness
 * - If correct: computes speed-based score, awards points, marks winner if first-to-correct
 */
export async function answer({ sessionId, userId, answerIndex = null, freeText = null }) {
  const now = new Date();
  try {
    const session = await withCollection(SESSIONS, (col) => col.findOne({ _id: sessionId, active: true }));
    if (!session) return err("NOT_FOUND", "Active session not found.");

    // Stop accepting after expireAt
    if (session.expireAt && now > new Date(session.expireAt)) {
      return err("VALIDATION_FAILED", "Time is up. Please wait for reveal.");
    }

    const correct = (answerIndex !== null)
      ? Number(answerIndex) === Number(session.correctIndex)
      : (typeof freeText === "string" && normalize(freeText) === normalize(session.options[session.correctIndex]));

    // Insert answer (unique per user)
    const insRes = await withCollection(ANSWERS, async (col) => {
      try {
        await col.insertOne({ sessionId: session._id, guildId, channelId, userId, index, text, correct, createdAt: now });
        return "OK";
      } catch (e) {
        if (String(e).includes("E11000")) return "DUP";
        throw e;
      }
    });
    if (insRes === "DUP") return err("VALIDATION_FAILED", "You have already answered.");

    let scored = 0;
    let first = false;

    if (correct) {
      const elapsedMs = Math.max(0, now - new Date(session.startedAt));
      const durationMs = Math.max(1, (session.durationSec || DEFAULTS.durationSec) * 1000);
      const ratio = Math.max(0, 1 - (elapsedMs / durationMs)); // 1.0 at t0, 0.0 at deadline
      const points = Math.round(DEFAULTS.basePoints + ratio * (DEFAULTS.maxPoints - DEFAULTS.basePoints));

      // Set "first correct" if not yet set
      const updated = await withCollection(SESSIONS, async (col) => {
        const res = await col.findOneAndUpdate(
          { _id: session._id, firstCorrectUserId: null },
          { $set: { firstCorrectUserId: userId } },
          { returnDocument: "after" }
        );
        return res?.value || session;
      });
      first = !session.firstCorrectUserId && updated.firstCorrectUserId === userId;

      scored = points + (first ? DEFAULTS.firstCorrectBonus : 0);

      // Award points
      await Points.award({
        guildId,
        userId,
        amount: scored,
        reason: "scenario_correct",
        meta: { scenarioId: session.scenarioId, sessionId: session._id, first, elapsedMs }
      });
    }

    incCounter("commands_total", { command: "scenario.answer" });
    return ok({ correct, scored, first });
  } catch (cause) {
    return err("DB_ERROR", "Answer failed", cause);
  }
}

/** Reveal stats & winner (does not post to Discord; command will do it). */
export async function reveal({ guildId, channelId }) {
  try {
    const session = await withCollection(SESSIONS, (col) => col.findOne({ guildId, channelId }));
    if (!session) return err("NOT_FOUND", "Session not found.");

    const answers = await withCollection(ANSWERS, (col) => col.find({ sessionId: session._id }).sort({ createdAt: 1 }).toArray());
    const corrects = answers.filter(a => a.correct);

    // winner = earliest correct
    const winner = corrects[0] || null;
    const winnerUserId = winner?.userId || null;

    await withCollection(SESSIONS, (col) =>
      col.updateOne({ _id: session._id }, { $set: { active: false, revealAt: new Date(), winnerUserId } })
    );

    const payload = {
      prompt: session.prompt,
      options: session.options,
      correctIndex: session.correctIndex,
      winnerUserId,
      totalAnswers: answers.length,
      correctCount: corrects.length,
      startedAt: session.startedAt,
      expireAt: session.expireAt,
      durationSec: session.durationSec || DEFAULTS.durationSec,
      hostPersonaName: session.hostPersonaName || null,
      tags: Array.isArray(session.tags) ? session.tags : []
    };
    return ok(payload);
  } catch (cause) {
    return err("DB_ERROR", "Reveal failed", cause);
  }
}

export async function cancel({ guildId, channelId }) {
  try {
    const res = await withCollection(SESSIONS, (col) => col.findOneAndUpdate(
      { guildId, channelId, active: true },
      { $set: { active: false, revealAt: new Date() } },
      { returnDocument: "after" }
    ));
    if (!res?.value) return err("NOT_FOUND", "No active session to cancel.");
    const activeCountAfter = await withCollection(SESSIONS, c => c.countDocuments({ active: true }));
    setGauge("active_games", activeCountAfter, {});
    return ok({ session: sanitize(res.value) });
  } catch (cause) {
    return err("DB_ERROR", "Cancel failed", cause);
  }
}

// ---------- Internals ----------

async function pickScenario({ scenarioId, tag }) {
  return withCollection(SCENARIOS, async (col) => {
    if (scenarioId) return col.findOne({ _id: scenarioId, enabled: { $ne: false } });
    const q = { enabled: { $ne: false } };
    if (tag) q.tags = tag;

    // Weighted pick (weight defaults to 1)
    const docs = await col.find(q).toArray();
    if (!docs.length) return null;

    const total = docs.reduce((s, d) => s + (Number(d.weight) > 0 ? Number(d.weight) : 1), 0);
    let r = Math.random() * total;
    for (const d of docs) {
      r -= (Number(d.weight) > 0 ? Number(d.weight) : 1);
      if (r <= 0) return d;
    }
    return docs[0];
  });
}

function sanitize(session) {
  if (!session) return session;
  const {
    prompt, options, correctIndex, mode, _id, guildId, channelId, active,
    createdAt, startedAt, expireAt, revealAt, winnerUserId, hostPersonaName, tags, durationSec
  } = session;
  return {
    _id, guildId, channelId, prompt, options, correctIndex, mode, active,
    createdAt, startedAt, expireAt, revealAt, winnerUserId,
    hostPersonaName: hostPersonaName || null,
    tags: Array.isArray(tags) ? tags : [],
    durationSec: durationSec || DEFAULTS.durationSec
  };
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}