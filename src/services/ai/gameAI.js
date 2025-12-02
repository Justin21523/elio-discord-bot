/**
 * Game AI client for human-like game opponents.
 * Provides tactical decision making for BattleGame, TriviaGame, etc.
 * Uses PFA behavior model + error injection on the Python side.
 */
import { httpPostJson, httpGetJson } from "./_client.js";

/**
 * Initialize a battle bot for a session.
 *
 * @param {object} params - Init parameters
 * @param {string} params.sessionId - Game session ID
 * @param {string} params.playstyle - aggressive, defensive, balanced, chaotic (optional)
 * @param {number} params.skillLevel - Bot skill level 0-1
 * @param {number} params.personalityWeight - How much personality affects decisions 0-1
 * @returns {object} Result with session info
 */
export async function battleInit({
  sessionId,
  playstyle = null,
  skillLevel = 0.7,
  personalityWeight = 0.6,
}) {
  const res = await httpPostJson("/game-ai/battle/init", {
    session_id: sessionId,
    playstyle,
    skill_level: skillLevel,
    personality_weight: personalityWeight,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "battle init failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get a tactical action for BattleGame.
 *
 * @param {object} params - Game state
 * @param {string} params.sessionId - Game session ID
 * @param {number} params.myHp - Bot's current HP
 * @param {number} params.enemyHp - Enemy's current HP
 * @param {Array<string>} params.availableActions - Available action names
 * @param {object} params.cooldowns - Action cooldowns {action: turns_remaining}
 * @param {string} params.enemyLastAction - Enemy's last action
 * @param {number} params.myMaxHp - Bot's max HP
 * @param {number} params.enemyMaxHp - Enemy's max HP
 * @param {string} params.playstyle - Override playstyle (optional)
 * @param {number} params.skillLevel - Bot skill level 0-1
 * @param {boolean} params.injectErrors - Enable human-like errors
 * @returns {object} Result with action, confidence, tendency, flavor_text, error_info
 */
export async function battleAction({
  sessionId,
  myHp,
  enemyHp,
  availableActions = ["strike", "guard", "quick", "block"],
  cooldowns = null,
  enemyLastAction = null,
  myMaxHp = 100,
  enemyMaxHp = 100,
  playstyle = null,
  skillLevel = 0.7,
  injectErrors = true,
}) {
  const res = await httpPostJson("/game-ai/battle/action", {
    session_id: sessionId,
    my_hp: myHp,
    enemy_hp: enemyHp,
    available_actions: availableActions,
    cooldowns,
    enemy_last_action: enemyLastAction,
    my_max_hp: myMaxHp,
    enemy_max_hp: enemyMaxHp,
    playstyle,
    skill_level: skillLevel,
    inject_errors: injectErrors,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "battle action failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * End a battle session and clean up.
 *
 * @param {string} sessionId - Game session ID
 * @returns {object} Result with final stats
 */
export async function battleEnd(sessionId) {
  const res = await httpPostJson(`/game-ai/battle/end?session_id=${encodeURIComponent(sessionId)}`, {});

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "battle end failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get battle session stats.
 *
 * @param {string} sessionId - Game session ID
 * @returns {object} Result with stats
 */
export async function battleStats(sessionId) {
  const res = await httpGetJson(`/game-ai/battle/stats/${encodeURIComponent(sessionId)}`);

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "battle stats failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get human-like reaction time.
 *
 * @param {object} params - Reaction parameters
 * @param {number} params.skillLevel - Skill level 0-1
 * @param {boolean} params.isCritical - Is this a critical/time-sensitive situation
 * @param {number} params.fatigueTurns - Number of turns for fatigue calculation
 * @returns {object} Result with reactionMs, fatigueLevel, skillTier
 */
export async function reactionTime({
  skillLevel = 0.7,
  isCritical = false,
  fatigueTurns = 0,
}) {
  const res = await httpPostJson("/game-ai/reaction-time", {
    skill_level: skillLevel,
    is_critical: isCritical,
    fatigue_turns: fatigueTurns,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "reaction time failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Generate flavor text for a battle action.
 *
 * @param {object} params - Flavor parameters
 * @param {string} params.action - Action taken
 * @param {string} params.tendency - Current behavioral tendency
 * @param {number} params.hpRatio - Current HP as ratio 0-1
 * @param {number} params.enemyHpRatio - Enemy HP as ratio 0-1
 * @param {string} params.playstyle - Bot playstyle
 * @returns {object} Result with flavorText
 */
export async function generateFlavor({
  action,
  tendency = "neutral",
  hpRatio = 1.0,
  enemyHpRatio = 1.0,
  playstyle = "balanced",
}) {
  const res = await httpPostJson("/game-ai/flavor", {
    action,
    tendency,
    hp_ratio: hpRatio,
    enemy_hp_ratio: enemyHpRatio,
    playstyle,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "generate flavor failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get available bot playstyles.
 *
 * @returns {object} Result with playstyles array
 */
export async function getPlaystyles() {
  const res = await httpGetJson("/game-ai/playstyles");

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "get playstyles failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get an answer for TriviaGame.
 *
 * @param {object} params - Question data
 * @param {string} params.question - Question text
 * @param {Array} params.options - Answer options
 * @param {number} params.correctIndex - Correct answer index
 * @param {string} params.topic - Question topic (for expertise simulation)
 * @param {string} params.difficulty - easy, medium, hard
 * @returns {object} Result with answerIdx, delayMs, confidence, reaction
 */
export async function triviaAnswer({
  question,
  options,
  correctIndex,
  topic = "mixed",
  difficulty = "medium",
}) {
  const res = await httpPostJson("/gameai/trivia/answer", {
    question,
    options,
    correct_index: correctIndex,
    topic,
    difficulty,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "trivia answer failed" } };
  }

  return { ok: true, data: res.json.data };
}

/**
 * Get a vote for AdventureGame.
 *
 * @param {object} params - Choice data
 * @param {Array} params.choices - Available choices with labels and risk levels
 * @param {object} params.personaTraits - Persona traits (humor, warmth, discipline)
 * @param {string} params.context - Story context
 * @returns {object} Result with choiceIndex, reasoning
 */
export async function adventureVote({ choices, personaTraits = {}, context = "" }) {
  const res = await httpPostJson("/gameai/adventure/vote", {
    choices,
    persona_traits: personaTraits,
    context,
  });

  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: res.json?.error || { message: "adventure vote failed" } };
  }

  return { ok: true, data: res.json.data };
}

export default {
  battleInit,
  battleAction,
  battleEnd,
  battleStats,
  reactionTime,
  generateFlavor,
  getPlaystyles,
  triviaAnswer,
  adventureVote,
};
