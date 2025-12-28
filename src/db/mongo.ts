/**
 * db/mongo.ts
 * MongoDB connection and index bootstrapping.
 * Follows DATABASE_SCHEMA.md exactly.
 */

import { MongoClient } from "mongodb";
import type { Collection, Db, Document } from "mongodb";
import { config } from "../config.js";
import { logger } from "../util/logger.js";

type MongoState = { client: MongoClient | null; db: Db | null };
const state: MongoState = { client: null, db: null };

export async function connectMongo() {
  if (state.client) return state.db;
  const uri = config.db?.uri || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  const client = new MongoClient(uri, { appName: "communiverse-bot" });
  await client.connect();

  const dbName = config.db?.name || process.env.DB_NAME || "communiverse_bot";
  const db = client.db(dbName);
  state.client = client;
  state.db = db;
  logger.db("Mongo connected", { db: dbName });
  return db;
}

export function getDb() {
  if (!state.db)
    throw new Error("Mongo not connected. Call connectMongo() first.");
  return state.db;
}

export async function withCollection<T>(
  name: string,
  fn: (col: Collection<Document>) => Promise<T> | T
): Promise<T> {
  const col = getDb().collection(name);
  return fn(col);
}

export async function closeMongo() {
  if (!state.client) return;
  await state.client.close();
  state.client = null;
  state.db = null;
  logger.db("Mongo closed");
}

// --- Backward-compatible `collections` ---
// Make a callable function object, then wrap with Proxy to also support property access.
function collectionGetter(name: string) {
  return getDb().collection(name);
}

export const collections: any = new Proxy(collectionGetter, {
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

export function getCollection<T extends Document = Document>(name: string) {
  return getDb().collection<T>(name);
}

// Backward compatibility aliases
export const connectDB = connectMongo;
export const closeDB = closeMongo;
export const getDB = getDb;

export default {
  connectMongo,
  connectDB,
  getDb,
  getDB,
  withCollection,
  closeMongo,
  closeDB,
  collections,
  getCollection,
};
