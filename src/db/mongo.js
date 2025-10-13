// src/db/mongo.js
import { MongoClient } from "mongodb";
import { CONFIG } from "../config.js";

export const state = {
  client: null,
  db: null,
};

export async function connectMongo() {
  if (state.client) return state.client;
  const uri =
    CONFIG.MONGODB_URI ||
    "mongodb://dev:devpass@127.0.0.1:27017/?authSource=admin";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(CONFIG.DB_NAME || "communiverse_bot");
  state.client = client;
  state.db = db;

  // ── Ensure indexes, but be tolerant when collections don't exist yet ──
  const safeDropIndex = async (col, name) => {
    try { await col.dropIndex(name); }
    catch (e) {
      if (!['IndexNotFound', 'NamespaceNotFound'].includes(e?.codeName) && e?.code !== 27) throw e;
    }
  };

  // --- Core indexes for existing features ---
  await Promise.all([
    db.collection('media').createIndex({ enabled: 1, nsfw: 1 }),
    (async () => {
      const col = db.collection('schedules');
      await safeDropIndex(col, 'guildId_1');
      await col.createIndex({ guildId: 1, kind: 1 }, { unique: true });
    })(),
    db.collection('profiles').createIndex({ guildId: 1, points: -1 }),
    db.collection('games').createIndex({ guildId: 1, status: 1 }),
    db.collection('scenario_answers').createIndex({ sessionId: 1, userId: 1 }, { unique: true })
  ]);

  // --- New collections & indexes for Phase A ---
  const greetings = db.collection("greetings");
  const scenarios = db.collection("scenarios");
  const scenarioSessions = db.collection("scenario_sessions");
  const scenarioAnswers = db.collection("scenario_answers");
  const personas = db.collection("personas");
  const personaAffinity = db.collection("persona_affinity");
  const personaConfig = db.collection("persona_config"); // single-doc config: actions/modifiers/cooldown

  await Promise.all([
    // greetings: query by enabled/tags when picking a message
    greetings.createIndex({ enabled: 1, tags: 1 }),

    // scenarios: query by enabled/tags/weight
    scenarios.createIndex({ enabled: 1, tags: 1 }),

    // sessions: find open ones per guild, or by status
    scenarioSessions.createIndex({ guildId: 1, status: 1 }),
    // scenario_answers: prevent multiple answers per user per session
    scenarioAnswers.createIndex({ sessionId: 1, userId: 1 }, { unique: true }),

    // personas: unique names; quick lookup by name
    personas.createIndex({ name: 1 }, { unique: true }),

    // persona_affinity: one record per (guild, user, persona)
    personaAffinity.createIndex(
      { guildId: 1, userId: 1, personaId: 1 },
      { unique: true }
    ),
    // Optional TTL ideas (not enabled now):
    // scenarioSessions.createIndex({ revealAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 days
  ]);

  console.log(
    "[INT] Mongo connected ->",
    CONFIG.DB_NAME,
    "URI=",
    CONFIG.MONGODB_URI
  );
  return db;
}

/** Helper for scripts to get the active DB after connectMongo() */
export function getDb() {
  if (!state.db)
    throw new Error("Mongo not connected. Call connectMongo() first.");
  return state.db;
}

/** for tests/tools */
export function collections() {
  const db = getDb();
  return {
    media: db.collection("media"),
    schedules: db.collection("schedules"),
    profiles: db.collection("profiles"),
    games: db.collection("games"),
    greetings: db.collection("greetings"),
    scenarios: db.collection("scenarios"),
    scenario_sessions: db.collection("scenario_sessions"),
    scenario_answers: db.collection("scenario_answers"),
    personas: db.collection("personas"),
    persona_config: db.collection("persona_config"),
    persona_affinity: db.collection("persona_affinity"),
  };
}

export async function closeMongo() {
  if (state.client) {
    await state.client.close();
    state.client = null;
    state.db = null;
    console.log('[INT] Mongo closed');
  }
}