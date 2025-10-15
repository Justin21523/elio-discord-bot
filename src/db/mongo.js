// src/db/mongo.js
// Mongo connection + helpers + backward-compatible `collections` export.
// It now supports BOTH styles:
//   collections('media')        // callable
//   collections.media           // property access

import { MongoClient } from "mongodb";
import { CONFIG } from "../config.js";

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
