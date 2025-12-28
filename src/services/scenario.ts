// src/services/scenario.ts
// Scenario quiz engine with weighted picking, timed reveal and speed-based scoring.
// Keeps your original guarantees: one active session per (guildId, channelId),
// unique answer per user, optional AI distractors, metrics gauges.

import { withCollection } from "../db/mongo.js";
import { incCounter, setGauge } from "../util/metrics.js";
import * as Points from "./points.js";

type Result<T> = { ok: true; data: T } | { ok: false; error: any };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}
function err(
  code: string,
  message: string,
  cause?: unknown,
  details?: Record<string, unknown>
): Result<never> {
  return { ok: false, error: { code, message, cause, details } };
}

const SESSIONS = "scenario_sessions";
const ANSWERS = "scenario_answers";
const SCENARIOS = "scenarios";

// ---- Scoring policy (tweak freely; all numbers are safe defaults)
const DEFAULTS = {
  durationSec: 30, // how long a question stays open
  basePoints: 30, // minimum for a correct answer (even at the last second)
  maxPoints: 100, // max points for instant answer (correct and first millisecond)
  firstCorrectBonus: 25, // extra bonus to the first correct user
  revealAfterMinutes: 3, // default time until auto-reveal (reduced from 5 to 3 minutes)
  maxSessionAgeMinutes: 10, // maximum session lifetime before force cleanup
};

export async function startSession({
  guildId,
  channelId,
  scenarioId = null,
  tag = null,
  mode = "quiz",
  aiFacade = null,
  revealAfterMinutes = null,
  durationSec = null,
}: {
  guildId: string;
  channelId: string;
  scenarioId?: any;
  tag?: string | null;
  mode?: string;
  aiFacade?: any;
  revealAfterMinutes?: number | null;
  durationSec?: number | null;
}) {
  const now = new Date();
  try {
    // FIRST: Auto-cleanup expired sessions in this channel (prevents stuck sessions)
    await withCollection(SESSIONS, async (col) => {
      const expiredSession = await col.findOne({
        guildId,
        channelId,
        active: true,
        revealAt: { $lt: now }, // revealAt has passed
      });

      if (expiredSession) {
        // Auto-reveal and deactivate expired session
        await col.updateOne({ _id: expiredSession._id }, { $set: { active: false, revealAt: now } });
        incCounter("scenario_auto_cleanup_total");
      }
    });

    // THEN: Check if there's still an active session (that hasn't expired)
    const exists = await withCollection(SESSIONS, (col) =>
      col.findOne({ guildId, channelId, active: true })
    );
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
      } catch {
        /* optional AI hook */
      }
    }
    if (options.length < 2) return err("VALIDATION_FAILED", "Scenario has insufficient options.");

    // Calculate timing (use defaults if not provided)
    const actualDurationSec = durationSec || DEFAULTS.durationSec;
    const actualRevealMinutes = revealAfterMinutes ?? DEFAULTS.revealAfterMinutes;
    const startedAt = now;
    const expireAt = new Date(now.getTime() + actualDurationSec * 1000);
    const revealAt = new Date(now.getTime() + actualRevealMinutes * 60 * 1000);

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
      revealAt,
      winnerUserId: null,
      winnerScore: null,
      // meta
      hostPersonaName: scenario.hostPersonaName || null,
      tags: Array.isArray(scenario.tags) ? scenario.tags : [],
      durationSec: Math.max(5, actualDurationSec),
      firstCorrectUserId: null,
    };

    const inserted = await withCollection(SESSIONS, async (col) => {
      const { insertedId } = await col.insertOne(doc);
      return await col.findOne({ _id: insertedId });
    });

    incCounter("commands_total", { command: "scenario.start" });
    const activeCount = await withCollection(SESSIONS, (c) => c.countDocuments({ active: true }));
    setGauge("active_games", activeCount, {});

    const insertedId = inserted?._id?.toString?.() ?? String(inserted?._id ?? "");

    return ok({
      sessionId: insertedId,
      scenario: {
        _id: scenario._id,
        question: scenario.prompt,
        options,
        correctIndex: doc.correctIndex,
        hostPersonaName: doc.hostPersonaName,
        tags: doc.tags,
      },
      question: scenario.prompt,
      revealAt: doc.revealAt,
      session: sanitize(inserted),
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
export async function answer({
  sessionId,
  userId,
  answerIndex = null,
  freeText = null,
}: {
  sessionId: any;
  userId: string;
  answerIndex?: number | null;
  freeText?: string | null;
}) {
  const now = new Date();
  try {
    const session = await withCollection(SESSIONS, (col) =>
      col.findOne({ _id: sessionId, active: true })
    );
    if (!session) return err("NOT_FOUND", "Active session not found.");

    // Stop accepting after expireAt
    if (session.expireAt && now > new Date(session.expireAt)) {
      return err("VALIDATION_FAILED", "Time is up. Please wait for reveal.");
    }

    const correct =
      answerIndex !== null
        ? Number(answerIndex) === Number(session.correctIndex)
        : typeof freeText === "string" &&
          normalize(freeText) === normalize(session.options?.[session.correctIndex]);

    // Insert answer (unique per user)
    const answerDoc = {
      sessionId: session._id,
      guildId: session.guildId,
      channelId: session.channelId,
      userId,
      index: answerIndex !== null ? Number(answerIndex) : null,
      text: freeText || null,
      correct,
      createdAt: now,
    };

    const insRes = await withCollection(ANSWERS, async (col) => {
      try {
        await col.insertOne(answerDoc);
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
      const elapsedMs = Math.max(0, now.getTime() - new Date(session.startedAt).getTime());
      const durationMs = Math.max(1, (session.durationSec || DEFAULTS.durationSec) * 1000);
      const ratio = Math.max(0, 1 - elapsedMs / durationMs); // 1.0 at t0, 0.0 at deadline
      const points = Math.round(DEFAULTS.basePoints + ratio * (DEFAULTS.maxPoints - DEFAULTS.basePoints));

      // Set "first correct" if not yet set
      const updated = await withCollection(SESSIONS, async (col) => {
        const res = await col.findOneAndUpdate(
          { _id: session._id, firstCorrectUserId: null },
          { $set: { firstCorrectUserId: userId } },
          { returnDocument: "after" }
        );
        return (res as any)?.value || session;
      });
      first = !session.firstCorrectUserId && updated.firstCorrectUserId === userId;

      scored = points + (first ? DEFAULTS.firstCorrectBonus : 0);

      // Award points
      await Points.award(session.guildId, userId, scored);
    }

    incCounter("commands_total", { command: "scenario.answer" });
    return ok({ correct, scored, first });
  } catch (cause) {
    return err("DB_ERROR", "Answer failed", cause);
  }
}

/** Reveal stats & winner (does not post to Discord; command will do it). */
export async function reveal({
  guildId,
  channelId,
  sessionId,
}: {
  guildId?: string;
  channelId?: string;
  sessionId?: any;
}) {
  try {
    // Support both sessionId and guildId+channelId lookups
    let session: any;
    if (sessionId) {
      session = await withCollection(SESSIONS, (col) => col.findOne({ _id: sessionId }));
    } else {
      session = await withCollection(SESSIONS, (col) => col.findOne({ guildId, channelId }));
    }
    if (!session) return err("NOT_FOUND", "Session not found.");

    const answers = await withCollection(ANSWERS, (col) =>
      col.find({ sessionId: session._id }).sort({ createdAt: 1 }).toArray()
    );
    const corrects = (answers as any[]).filter((a) => a.correct);

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
      totalAnswers: (answers as any[]).length,
      correctCount: corrects.length,
      startedAt: session.startedAt,
      expireAt: session.expireAt,
      durationSec: session.durationSec || DEFAULTS.durationSec,
      hostPersonaName: session.hostPersonaName || null,
      tags: Array.isArray(session.tags) ? session.tags : [],
    };
    return ok(payload);
  } catch (cause) {
    return err("DB_ERROR", "Reveal failed", cause);
  }
}

export async function cancel({ guildId, channelId }: { guildId: string; channelId: string }) {
  try {
    // Debug: Check what sessions exist
    const allSessions = await withCollection(SESSIONS, (col) =>
      col.find({ guildId, channelId }).sort({ createdAt: -1 }).toArray()
    );
    console.log(
      `[DEBUG] cancel: Found ${(allSessions as any[]).length} sessions for guild=${guildId}, channel=${channelId}`
    );
    if ((allSessions as any[]).length > 0) {
      // Show most recent session (sorted by createdAt desc)
      console.log(
        `[DEBUG] cancel: Most recent session:`,
        JSON.stringify({
          _id: (allSessions as any[])[0]._id,
          active: (allSessions as any[])[0].active,
          createdAt: (allSessions as any[])[0].createdAt,
          revealAt: (allSessions as any[])[0].revealAt,
          now: new Date(),
        })
      );

      // Count how many are active
      const activeCount = (allSessions as any[]).filter((s) => s.active).length;
      console.log(`[DEBUG] cancel: Active sessions: ${activeCount} / ${(allSessions as any[]).length}`);
    }

    const res = await withCollection(SESSIONS, (col) =>
      col.findOneAndUpdate(
        { guildId, channelId, active: true },
        { $set: { active: false, revealAt: new Date() } },
        { returnDocument: "after" }
      )
    );
    if (!(res as any)?.value) return err("NOT_FOUND", "No active session to cancel.");
    const activeCountAfter = await withCollection(SESSIONS, (c) => c.countDocuments({ active: true }));
    setGauge("active_games", activeCountAfter, {});
    return ok({ session: sanitize((res as any).value) });
  } catch (cause) {
    return err("DB_ERROR", "Cancel failed", cause);
  }
}

// ---------- Internals ----------

async function pickScenario({ scenarioId, tag }: { scenarioId?: any; tag?: string | null }) {
  return withCollection(SCENARIOS, async (col) => {
    if (scenarioId) return col.findOne({ _id: scenarioId, enabled: { $ne: false } });
    const q: Record<string, any> = { enabled: { $ne: false } };
    if (tag) q.tags = tag;

    // Weighted pick (weight defaults to 1)
    const docs = await col.find(q).toArray();
    if (!docs.length) return null;

    const total = (docs as any[]).reduce(
      (s, d) => s + (Number(d.weight) > 0 ? Number(d.weight) : 1),
      0
    );
    let r = Math.random() * total;
    for (const d of docs as any[]) {
      r -= Number(d.weight) > 0 ? Number(d.weight) : 1;
      if (r <= 0) return d;
    }
    return (docs as any[])[0];
  });
}

function sanitize(session: any) {
  if (!session) return session;
  const {
    prompt,
    options,
    correctIndex,
    mode,
    _id,
    guildId,
    channelId,
    active,
    createdAt,
    startedAt,
    expireAt,
    revealAt,
    winnerUserId,
    hostPersonaName,
    tags,
    durationSec,
  } = session;
  return {
    _id,
    guildId,
    channelId,
    prompt,
    options,
    correctIndex,
    mode,
    active,
    createdAt,
    startedAt,
    expireAt,
    revealAt,
    winnerUserId,
    hostPersonaName: hostPersonaName || null,
    tags: Array.isArray(tags) ? tags : [],
    durationSec: durationSec || DEFAULTS.durationSec,
  };
}

function normalize(s: unknown) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Get session statistics
 */
export async function getSessionStats({
  guildId,
  channelId,
  sessionId,
}: {
  guildId?: string;
  channelId?: string;
  sessionId?: any;
}) {
  try {
    // Support both sessionId and guildId+channelId lookups
    let session: any;
    if (sessionId) {
      session = await withCollection(SESSIONS, (col) => col.findOne({ _id: sessionId }));
    } else {
      session = await withCollection(SESSIONS, (col) => col.findOne({ guildId, channelId }));
    }
    if (!session) {
      return err("NOT_FOUND", "Session not found");
    }

    const answers = await withCollection(ANSWERS, (col) => col.find({ sessionId: session._id }).toArray());

    const correctAnswers = (answers as any[]).filter((a) => a.correct);
    const uniqueUsers = new Set((answers as any[]).map((a) => a.userId));

    return ok({
      session: sanitize(session),
      totalAnswers: (answers as any[]).length,
      correctAnswers: correctAnswers.length,
      uniqueUsers: uniqueUsers.size,
      isActive: session.active,
    });
  } catch (cause) {
    return err("DB_ERROR", "Failed to get session stats", cause);
  }
}

/**
 * Global cleanup - deactivate all expired sessions across all guilds
 * Should be called periodically (e.g., every 5 minutes via cron)
 */
export async function cleanupExpiredSessions() {
  const now = new Date();
  try {
    const result = await withCollection(SESSIONS, async (col) => {
      // Find all active sessions past their revealAt time
      const expiredCount = await col.countDocuments({
        active: true,
        revealAt: { $lt: now },
      });

      if (expiredCount > 0) {
        // Deactivate all expired sessions
        await col.updateMany({ active: true, revealAt: { $lt: now } }, { $set: { active: false, revealAt: now } });

        incCounter("scenario_cleanup_batch_total");
      }

      return expiredCount;
    });

    const activeCount = await withCollection(SESSIONS, (c) => c.countDocuments({ active: true }));
    setGauge("active_games", activeCount, {});

    return ok({ cleanedUp: result, activeRemaining: activeCount });
  } catch (cause) {
    return err("DB_ERROR", "Cleanup failed", cause);
  }
}

// Auto-run cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    cleanupExpiredSessions().catch((error) => {
      console.error("[SCENARIO] Auto-cleanup failed:", error);
    });
  }, 5 * 60 * 1000); // 5 minutes
}

// Default export for backward compatibility
export default {
  startSession,
  answer,
  reveal,
  cancel,
  getSessionStats,
  cleanupExpiredSessions,
};
