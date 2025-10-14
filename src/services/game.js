// /src/services/game.js
// English-only code & comments.
//
// Game Service: AI-powered quick quiz with first-click buzz-in.
// - Produces questions via LLM (fallback to a small static bank).
// - Persona (QuizMaster) hosts via webhook.
// - Awards points to the first correct answer.
// - All public funcs return Result<T>, no throws across module boundary.

import { logger } from '../util/logger.js';
import { METRIC_NAMES, setGauge } from '../util/metrics.js';
import * as LLM from './ai/llm.js';
import { award as awardPoints } from './points.js'; // must return Result<T>
import { personaSay } from './webhooks.js'; // WebhooksService.personaSay(channelId, persona, content)

/**
 * @typedef {{ code: string, message: string, cause?: unknown, details?: Record<string, unknown> }} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result<T>
 */

/** In-memory state. Per {guildId, channelId}. Not persisted. */
const sessions = new Map(); // key: `${guildId}:${channelId}` -> Session

/** Default quiz persona */
const QUIZ_PERSONA = {
  name: 'QuizMaster',
  avatarUrl: 'https://i.imgur.com/8u9Vb6y.png', // placeholder; safe link
  color: 0x7c4dff,
};

const QUESTION_PROMPT = `You are a fun quiz generator for a community Discord.
Create ONE short question with a clear single correct answer.
Constraints:
- 8~20 words question, casual tone.
- Provide the final answer (1~4 words) and a 1-sentence explanation.
- Use JSON keys: question, answer, explanation.
Example:
{"question":"Which planet is known as the Red Planet?","answer":"Mars","explanation":"Iron oxide dust makes it look red."}
Now generate a fresh one:`;

const STATIC_QUESTIONS = [
  { q: 'Which studio made Toy Story?', a: 'Pixar', e: 'Toy Story is Pixar’s first feature film (1995).' },
  { q: 'What color is the alien EVE’s body light?', a: 'Blue', e: 'EVE glows blue; WALL·E has warm yellow tones.' },
  { q: 'What is the capital of Japan?', a: 'Tokyo', e: 'Japan’s capital is Tokyo.' },
];

function key(guildId, channelId) { return `${guildId}:${channelId}`; }
function now() { return Date.now(); }
function toSec(ms) { return Math.round(ms / 1000); }

function refreshActiveGamesGauge() {
  try { setGauge(METRIC_NAMES.active_games, sessions.size); } catch {}
}

/**
 * Start a quiz session and post the first question via persona webhook.
 * @param {{guildId:string, channelId:string, hostId:string, ttlSec?:number, award?:number, difficulty?:'easy'|'normal'|'hard'}} params
 * @returns {Promise<Result<{question:string, expiresAt:number}>>}
 */
export async function start(params) {
  const { guildId, channelId, hostId } = params;
  if (!guildId || !channelId) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'guildId and channelId are required' } };
  }

  const k = key(guildId, channelId);
  if (sessions.has(k)) {
    const s = sessions.get(k);
    return { ok: false, error: { code: 'RATE_LIMITED', message: `Game already running. Ends in ~${toSec(s.expiresAt - now())}s.` } };
  }

  // Generate a question via LLM (fallback to static)
  const q = await makeQuestion();
  const ttlSec = Number.isFinite(params?.ttlSec) ? params.ttlSec : 45;     // answer window
  const award = Number.isFinite(params?.award) ? params.award : 10;

  const expiresAt = now() + ttlSec * 1000;
  const session = {
    guildId, channelId, hostId,
    question: q.question,
    answer: q.answer,
    explanation: q.explanation,
    award,
    expiresAt,
    winner: null,
    timeoutHandle: null,
  };

  // Schedule auto-timeout
  session.timeoutHandle = setTimeout(() => {
    // Cleanup and notify if still open
    const s = sessions.get(k);
    if (s && !s.winner) {
      sessions.delete(k); refreshActiveGamesGauge();
      personaSay(channelId, QUIZ_PERSONA, `⏰ Time's up!\n**Answer:** \`${s.answer}\`\n_${s.explanation}_`);
      logger.info({ guildId, channelId }, '[JOB] game timeout');
    }
  }, ttlSec * 1000).unref?.();

  sessions.set(k, session); refreshActiveGamesGauge();

  // Post question via persona webhook
  await personaSay(channelId, QUIZ_PERSONA,
    `🎲 **Quick Quiz** (first correct answer wins +${award} pts)\n` +
    `\n> **${q.question}**\n` +
    `\n_Reply with_ \`/game buzz answer:<your answer>\``
  );

  logger.info({ guildId, channelId, hostId }, '[JOB] game started');
  return { ok: true, data: { question: q.question, expiresAt } };
}

/**
 * Player buzz: submit an answer. First correct answer wins immediately.
 * @param {{guildId:string, channelId:string, userId:string, username:string, answer:string}} params
 * @returns {Promise<Result<{correct:boolean, answer:string, winner?:string}>>}
 */
export async function buzz(params) {
  const { guildId, channelId, userId, username } = params;
  const s = sessions.get(key(guildId, channelId));
  if (!s) return { ok: false, error: { code: 'NOT_FOUND', message: 'No active game in this channel.' } };

  if (now() > s.expiresAt) {
    sessions.delete(key(guildId, channelId)); refreshActiveGamesGauge();
    return { ok: false, error: { code: 'RATE_LIMITED', message: 'Time is up.' } };
  }
  if (s.winner) {
    return { ok: false, error: { code: 'RATE_LIMITED', message: `Already solved by <@${s.winner}>.` } };
  }

  const normalized = (params.answer || '').trim().toLowerCase();
  const truth = (s.answer || '').trim().toLowerCase();

  const correct = isCorrect(normalized, truth);
  if (correct) {
    s.winner = userId;
    clearTimeout(s.timeoutHandle);
    sessions.delete(key(guildId, channelId)); refreshActiveGamesGauge();

    // Award points
    const aw = await awardPoints({ guildId, userId, reason: 'quiz_win', points: s.award });
    if (!aw.ok) {
      logger.error({ guildId, channelId, userId, err: aw.error }, '[ERR] points award failed');
    }

    // Announce via persona
    await personaSay(channelId, QUIZ_PERSONA,
      `✅ **Correct!** <@${userId}> wins **+${s.award}** pts\n` +
      `**Answer:** \`${s.answer}\`\n_${s.explanation}_`
    );

    logger.info({ guildId, channelId, userId }, '[JOB] game solved');
    return { ok: true, data: { correct: true, answer: s.answer, winner: userId } };
  }

  return { ok: true, data: { correct: false, answer: s.answer } };
}

/**
 * Stop (admin/host)
 */
export async function stop({ guildId, channelId }) {
  const k = key(guildId, channelId);
  const s = sessions.get(k);
  if (!s) return { ok: false, error: { code: 'NOT_FOUND', message: 'No active game.' } };
  clearTimeout(s.timeoutHandle);
  sessions.delete(k); refreshActiveGamesGauge();
  await personaSay(channelId, QUIZ_PERSONA, `⛔ Stopped by admin. Correct answer was \`${s.answer}\`.`);
  return { ok: true, data: { stopped: true } };
}

/**
 * Make a single question via LLM; fallback static if model unavailable.
 */
async function makeQuestion() {
  try {
    const g = await LLM.generate(QUESTION_PROMPT, { max_new_tokens: 200, temperature: 0.7 });
    if (g.ok && typeof g.data?.text === 'string') {
      const raw = g.data.text.trim();
      // try parse JSON anywhere in the string
      const jsonStr = (raw.match(/\{[\s\S]*\}$/) || [raw])[0];
      const o = JSON.parse(jsonStr);
      const question = String(o.question || '').trim();
      const answer = String(o.answer || '').trim();
      const explanation = String(o.explanation || '').trim();
      if (question && answer) return { question, answer, explanation: explanation || 'Good job!' };
    }
  } catch (e) {
    logger.warn({ cause: e }, '[JOB] LLM question parse failed; using fallback');
  }
  // Fallback
  const pick = STATIC_QUESTIONS[Math.floor(Math.random() * STATIC_QUESTIONS.length)];
  return { question: pick.q, answer: pick.a, explanation: pick.e };
}

/** extremely light fuzzy match */
function isCorrect(user, truth) {
  if (!user || !truth) return false;
  if (user === truth) return true;
  // ignore punctuation/spaces
  const norm = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  return norm(user) === norm(truth);
}
