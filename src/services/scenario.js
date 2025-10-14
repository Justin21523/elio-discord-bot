// src/services/scenario.js
// Scenario quiz engine. Business logic only; commands stay thin.
// Guarantees: one active session per (guildId, channelId). Unique answer per user.
// Optional AI distractors hook via aiFacade if options < 4.

import { withCollection } from "../db/mongo.js";
import { incCounter, setGauge } from "../util/metrics.js";

function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

const SESSIONS = "scenario_sessions";
const ANSWERS = "scenario_answers";
const SCENARIOS = "scenarios";

export async function startSession({ guildId, channelId, scenarioId = null, tag = null, mode = "quiz", aiFacade = null }) {
  const now = new Date();
  try {
    // Make sure no other active session
    const exists = await withCollection(SESSIONS, (col) => col.findOne({ guildId, channelId, active: true }));
    if (exists) return err("VALIDATION_FAILED", "An active session already exists in this channel.");

    // Pick scenario
    const scenario = await pickScenario({ scenarioId, tag });
    if (!scenario) return err("RAG_EMPTY", "No scenario available for given filter.");

    // Normalize 4 options; optionally ask AI to fill distractors
    let options = Array.isArray(scenario.options) ? [...scenario.options] : [];
    if (options.length < 4 && aiFacade) {
      try {
        const more = await aiFacade.generateDistractors({
          prompt: scenario.prompt,
          correct: options[scenario.correctIndex ?? 0],
          need: Math.max(0, 4 - options.length),
          tag,
        });
        if (Array.isArray(more) && more.length) options = [...options, ...more].slice(0, 4);
      } catch { /* AI optional */ }
    }
    if (options.length < 2) return err("VALIDATION_FAILED", "Scenario has insufficient options.");

    const doc = {
      guildId, channelId,
      scenarioId: scenario._id,
      prompt: scenario.prompt,
      options,
      correctIndex: scenario.correctIndex ?? 0,
      mode,
      active: true,
      createdAt: now,
      revealAt: null,
      winnerUserId: null,
    };

    const inserted = await withCollection(SESSIONS, async (col) => {
      const { insertedId } = await col.insertOne(doc);
      return await col.findOne({ _id: insertedId });
    });

    incCounter("commands_total", { command: "scenario.start" });
    // set the real number of active sessions as gauge
    const activeCount = await withCollection(SESSIONS, c => c.countDocuments({ active: true }));
    setGauge("active_games", activeCount, {}); // ← 你的簽名為 (name, value, labels)
    return ok({ session: sanitize(inserted) });
  } catch (cause) {
    // Likely unique index violation => someone raced to create another session
    const msg = /E11000/.test(String(cause)) ? "Active session already exists." : "Failed to start session.";
    return err("SCHEDULE_ERROR", msg, cause);
  }
}

export async function answer({ sessionId, userId, answerIndex = null, freeText = null }) {
  const now = new Date();
  try {
    const session = await withCollection(SESSIONS, (col) => col.findOne({ _id: sessionId, active: true }));
    if (!session) return err("NOT_FOUND", "Active session not found.");

    // Unique answer per user enforced by unique index (sessionId,userId)
    const correct = (answerIndex !== null)
      ? Number(answerIndex) === Number(session.correctIndex)
      : (typeof freeText === "string" && normalize(freeText) === normalize(session.options[session.correctIndex]));

    const row = await withCollection(ANSWERS, async (col) => {
      try {
        await col.insertOne({ sessionId, userId, answerIndex, freeText, correct, createdAt: now });
      } catch (e) {
        // duplicate answer
        if (String(e).includes("E11000")) return "DUP";
        throw e;
      }
      return "OK";
    });

    if (row === "DUP") {
      return err("VALIDATION_FAILED", "You have already answered this question.");
    }

    // In quiz/speedrun, first correct answer closes the session
    if (correct) {
      await withCollection(SESSIONS, (col) => col.updateOne({ _id: sessionId }, { $set: { active: false, revealAt: now, winnerUserId: userId } }));
    }

    incCounter("commands_total", { command: "scenario.answer" });
    // refresh active_games gauge (use your metrics signature: setGauge(name, value, labels))
    const activeCountAfter = await withCollection(SESSIONS, c => c.countDocuments({ active: true }));
    setGauge("active_games", activeCountAfter, {});
    return ok({ correct, closed: correct === true });
  } catch (cause) {
    return err("DB_ERROR", "Answer failed", cause);
  }
}


export async function reveal({ sessionId }) {
  try {
    const session = await withCollection(SESSIONS, (col) => col.findOne({ _id: sessionId }));
    if (!session) return err("NOT_FOUND", "Session not found.");
    const answers = await withCollection(ANSWERS, (col) => col.find({ sessionId }).sort({ createdAt: 1 }).toArray());
    return ok({
      prompt: session.prompt,
      options: session.options,
      correctIndex: session.correctIndex,
      winnerUserId: session.winnerUserId || null,
      totalAnswers: answers.length,
      correctCount: answers.filter(a => a.correct).length,
      active: !!session.active,
    });
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
    // right after successful cancel
    const activeCountAfter = await withCollection(SESSIONS, c => c.countDocuments({ active: true }));
    setGauge("active_games", activeCountAfter, {});
    return ok({ session: sanitize(res.value) });
  } catch (cause) {
    return err("DB_ERROR", "Cancel failed", cause);
  }
}

async function pickScenario({ scenarioId, tag }) {
  return withCollection(SCENARIOS, async (col) => {
    if (scenarioId) return col.findOne({ _id: scenarioId, enabled: { $ne: false } });
    const q = { enabled: { $ne: false } };
    if (tag) q.tags = tag;
    const arr = await col.aggregate([{ $match: q }, { $sample: { size: 1 } }]).toArray();
    return arr[0];
  });
}

function sanitize(session) {
  if (!session) return session;
  const { prompt, options, correctIndex, mode, _id, guildId, channelId, active, createdAt, revealAt, winnerUserId } = session;
  return { _id, guildId, channelId, prompt, options, correctIndex, mode, active, createdAt, revealAt, winnerUserId };
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}
