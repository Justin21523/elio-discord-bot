<<<<<<< HEAD
/**
 * db/mongo.js
 * MongoDB connection and index bootstrapping.
 * Follows DATABASE_SCHEMA.md exactly.
 */
=======
// src/db/mongo.js
// Mongo connection + helpers + backward-compatible `collections` export.
// It now supports BOTH styles:
//   collections('media')        // callable
//   collections.media           // property access
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a

import { MongoClient } from "mongodb";
import { config } from "../config.js";
import { logger } from "../util/logger.js";

<<<<<<< HEAD
let client = null;
let db = null;

/**
 * Connect to MongoDB and return database instance
 * @returns {Promise<Db>}
 */
export async function connectDB() {
  if (db) return db;

  try {
    client = new MongoClient(config.db.uri);
    await client.connect();
    db = client.db(config.db.name);

    logger.info("[DB] Connected to MongoDB", {
      host: config.db.uri,
      database: config.db.name,
    });

    // Bootstrap indexes
    await ensureIndexes();

    return db;
  } catch (error) {
    logger.error("[DB] Failed to connect", { error: error.message });
    throw error;
  }
}

/**
 * Ensure all required indexes exist
 * Swallows NamespaceNotFound and IndexNotFound errors per spec
 */
async function ensureIndexes() {
  if (!db) throw new Error("Database not connected");

  const indexSpecs = [
    // media
    { collection: "media", spec: { enabled: 1, nsfw: 1 } },
    { collection: "media", spec: { tags: 1 } },
    { collection: "media", spec: { addedAt: -1 } },

    // schedules
    {
      collection: "schedules",
      spec: { guildId: 1, kind: 1 },
      options: { unique: true },
    },
    { collection: "schedules", spec: { enabled: 1 } },
    { collection: "schedules", spec: { channelId: 1 } },

    // profiles
    {
      collection: "profiles",
      spec: { guildId: 1, userId: 1 },
      options: { unique: true },
    },
    { collection: "profiles", spec: { guildId: 1, points: -1 } },

    // games
    { collection: "games", spec: { guildId: 1, status: 1 } },
    { collection: "games", spec: { channelId: 1, status: 1, startedAt: -1 } },

    // greetings
    { collection: "greetings", spec: { weight: -1 } },

    // personas
    { collection: "personas", spec: { name: 1 }, options: { unique: true } },

    // persona_config
    {
      collection: "persona_config",
      spec: { guildId: 1 },
      options: { unique: true },
    },

    // persona_affinity
    {
      collection: "persona_affinity",
      spec: { guildId: 1, userId: 1, personaId: 1 },
      options: { unique: true },
    },
    {
      collection: "persona_affinity",
      spec: { guildId: 1, personaId: 1, friendship: -1 },
    },

    // scenarios
    { collection: "scenarios", spec: { enabled: 1, tags: 1 } },
    { collection: "scenarios", spec: { host: 1 } },

    // scenario_sessions
    {
      collection: "scenario_sessions",
      spec: { sessionId: 1 },
      options: { unique: true },
    },
    { collection: "scenario_sessions", spec: { guildId: 1, createdAt: -1 } },

    // scenario_answers
    {
      collection: "scenario_answers",
      spec: { sessionId: 1, userId: 1 },
      options: { unique: true },
    },
    { collection: "scenario_answers", spec: { sessionId: 1, correct: 1 } },

    // admin_audit
    { collection: "admin_audit", spec: { guildId: 1, createdAt: -1 } },

    // ai_logs (with TTL)
    { collection: "ai_logs", spec: { kind: 1, createdAt: -1 } },
    { collection: "ai_logs", spec: { status: 1, createdAt: -1 } },
    {
      collection: "ai_logs",
      spec: { createdAt: 1 },
      options: { expireAfterSeconds: 60 * 60 * 24 * 30 },
    },

    // conversation_memory (with TTL)
    {
      collection: "conversation_memory",
      spec: { guildId: 1, userId: 1, createdAt: -1 },
    },
    {
      collection: "conversation_memory",
      spec: { ttlAt: 1 },
      options: { expireAfterSeconds: 0 },
    },

    // news_items
    { collection: "news_items", spec: { publishedAt: -1 } },
    { collection: "news_items", spec: { source: 1, fetchedAt: -1 } },
    { collection: "news_items", spec: { url: 1 }, options: { unique: true } },
  ];

  let created = 0;
  let skipped = 0;

  for (const { collection, spec, options } of indexSpecs) {
    try {
      await db.collection(collection).createIndex(spec, options || {});
      created++;
    } catch (error) {
      // Swallow expected errors per spec
      if (
        error.code === 26 || // NamespaceNotFound
        error.code === 27 || // IndexNotFound
        error.codeName === "NamespaceNotFound" ||
        error.codeName === "IndexNotFound"
      ) {
        skipped++;
      } else if (
        error.code === 85 ||
        error.codeName === "IndexOptionsConflict"
      ) {
        // Index already exists with different options - log warning but continue
        logger.warn("[DB] Index already exists with different options", {
          collection,
          spec: JSON.stringify(spec),
        });
        skipped++;
      } else {
        // Unexpected error - log but don't throw
        logger.warn("[DB] Index creation warning", {
          collection,
          spec: JSON.stringify(spec),
          error: error.message,
        });
        skipped++;
      }
    }
  }

  logger.info("[JOB] indexes ensured", {
    created,
    skipped,
    total: indexSpecs.length,
  });
}

/**
 * Get database instance (must call connectDB first)
 * @returns {Db}
 */
export function getDB() {
  if (!db) throw new Error("Database not initialized. Call connectDB() first.");
  return db;
}

/**
 * Close database connection gracefully
 */
export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info("[DB] Connection closed");
  }
=======
const state = { client: null, db: null };

export async function connectMongo() {
  if (state.client) return state.db;
  const uri = CONFIG.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  const client = new MongoClient(uri, { appName: "communiverse-bot" });
  await client.connect();

  const dbName = CONFIG.DB_NAME || "communiverse_bot";
  const db = client.db(dbName);
  state.client = client;
  state.db = db;
  console.log("[INT] Mongo connected", { db: dbName });
  return db;
}

export function getDb() {
  if (!state.db) throw new Error("Mongo not connected. Call connectMongo() first.");
  return state.db;
}

export async function withCollection(name, fn) {
  const col = getDb().collection(name);
  return fn(col);
}

export async function closeMongo() {
  if (!state.client) return;
  await state.client.close();
  state.client = null;
  state.db = null;
  console.log("[INT] Mongo closed");
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
}

// --- Backward-compatible `collections` ---
// Make a callable function object, then wrap with Proxy to also support property access.
function collectionGetter(name) {
  return getDb().collection(name);
}

export const collections = new Proxy(collectionGetter, {
  apply(_target, _thisArg, args) {
    // allow collections('media')
    return collectionGetter(args[0]);
  },
  get(_target, prop) {
    if (typeof prop !== "string") return undefined;
    // allow collections.media
    return collectionGetter(prop);
  },
});

export function getCollection(name) {
  return getDb().collection(name);
}

export default {
  connectMongo,
  getDb,
  withCollection,
  closeMongo,
  collections,
  getCollection,
};
