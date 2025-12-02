// /src/db/ensure-indexes.js
// Apply validators & create indexes, with Atlas-safe fallback (skip collMod if forbidden).

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { validators } from "./validators.js";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://communiverse_user:elioversebot@cluster0.1s3kk.mongodb.net/communiverse_bot?retryWrites=true&w=majority&appName=communiverse";
const DB_NAME   = process.env.DB_NAME  || "communiverse_bot";

function isCollModForbidden(e) {
  const s = String(e?.errmsg || e?.message || e || "");
  return s.includes("not allowed to do action [collMod]") || s.includes("collMod") || s.includes("AtlasError");
}

export async function ensureIndexes() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  let validatorsApplied = true;

  // Try apply validators; if collMod forbidden, skip but ensure collections exist.
  for (const [name, validator] of Object.entries(validators)) {
    try {
      const exists = await db.listCollections({ name }).hasNext();
      if (exists) {
        await db.command({ collMod: name, validator });
      } else {
        await db.createCollection(name, { validator });
      }
    } catch (e) {
      if (isCollModForbidden(e)) {
        console.warn(`[JOB] validator skipped for ${name}: collMod forbidden on this user/cluster`);
        validatorsApplied = false;
        // Ensure collection exists even if validator skipped
        const exists = await db.listCollections({ name }).hasNext();
        if (!exists) await db.createCollection(name);
      } else {
        console.error("[ERR] ensureIndexes validator error:", e);
        throw e;
      }
    }
  }

  // Indexes (safe even if validators skipped)
  // personas
  await db.collection("personas").createIndex({ name: 1 }, { unique: true });
  await db.collection("personas").createIndex({ enabled: 1 });

  // scenarios: unique prompt only when prompt is a string (avoid null duplicates)
  await db.collection("scenarios").createIndex(
    { prompt: 1 },
    { unique: true, partialFilterExpression: { prompt: { $type: "string" } } }
  );
  await db.collection("scenarios").createIndex({ enabled: 1, weight: -1 });
  await db.collection("scenarios").createIndex({ tags: 1 });
  // ---- RECOMMENDED for scenario speed-quiz (one answer per user) ----
  // scenario sessions/answers
  await db.collection('scenario_sessions').createIndex({ guildId: 1, channelId: 1, active: 1 });
  await db.collection('scenario_answers').createIndex({ sessionId: 1, userId: 1 }, { unique: true });
  await db.collection('scenario_answers').createIndex({ sessionId: 1, createdAt: 1 });

  // greetings
  await db.collection("greetings").createIndex({ enabled: 1, weight: -1 });
  await db.collection("greetings").createIndex({ personaHost: 1 });
  await db.collection("greetings").createIndex({ tags: 1 }, { sparse: true });

  // media
  await db.collection('media').createIndex({ enabled: 1, nsfw: 1 });
  await db.collection('media').createIndex({ tags: 1 });
  await db.collection('media').createIndex({ addedAt: -1 });

  // schedules
  await db.collection('schedules').createIndex({ guildId: 1, kind: 1 }, { unique: true });
  await db.collection('schedules').createIndex({ enabled: 1 });
  await db.collection('schedules').createIndex({ channelId: 1 });

  // One profile per (guildId, userId), and fast sort by points desc for leaderboard.
  await db.collection('profiles').createIndex({ guildId: 1, userId: 1 }, { unique: true });
  await db.collection('profiles').createIndex({ guildId: 1, points: -1, updatedAt: -1 });

  // rag_chunks: vector search + BM25 text search + metadata filters
  await db.collection('rag_chunks').createIndex({ id: 1 }, { unique: true });
  await db.collection('rag_chunks').createIndex({ 'meta.subject': 1, 'meta.type': 1 });
  await db.collection('rag_chunks').createIndex({ 'meta.tags': 1 });
  await db.collection('rag_chunks').createIndex({ 'meta.updated_at': -1 });
  // Text index for BM25-style keyword search
  await db.collection('rag_chunks').createIndex({ bm25Text: 'text', 'meta.source': 'text' });

  // Vector search index (Atlas only - will error on local MongoDB, but that's OK)
  // For local dev, use FAISS in-memory or skip vector search
  try {
    const RAG_EMBEDDING_DIM = parseInt(process.env.RAG_EMBEDDING_DIM || "1024", 10);
    // Note: Vector search index must be created via Atlas UI or Admin API
    // This is a placeholder for documentation
    console.log(`[JOB] Vector search index should be created manually in Atlas for rag_chunks.embedding (${RAG_EMBEDDING_DIM}D, cosine)`);
  } catch (e) {
    console.warn('[JOB] Vector index creation skipped (Atlas only)');
  }

  // conversation_memory: for channel summaries and context
  await db.collection('conversation_memory').createIndex({ guildId: 1, channelId: 1, timestamp: -1 });
  await db.collection('conversation_memory').createIndex({ timestamp: -1 });

  // dm_sessions: for DM mini-game tracking
  await db.collection('dm_sessions').createIndex({ userId: 1, active: 1 });
  await db.collection('dm_sessions').createIndex({ createdAt: -1 });

  // channel_messages: Discord history storage
  await db.collection('channel_messages').createIndex({ messageId: 1 }, { unique: true });
  await db.collection('channel_messages').createIndex({ guildId: 1, channelId: 1, timestamp: -1 });
  await db.collection('channel_messages').createIndex({ authorId: 1, timestamp: -1 });
  await db.collection('channel_messages').createIndex({ timestamp: -1 });
  await db.collection('channel_messages').createIndex({ trainingEligible: 1, optedOut: 1 });
  await db.collection('channel_messages').createIndex({ ingestedAt: -1 });
  // Text search for message content
  await db.collection('channel_messages').createIndex(
    { content: 'text', cleanContent: 'text' },
    { name: 'channel_messages_text_idx' }
  );
  // TTL index for automatic cleanup (90 days retention)
  const RETENTION_DAYS = parseInt(process.env.CHANNEL_HISTORY_RETENTION_DAYS || '90', 10);
  await db.collection('channel_messages').createIndex(
    { ingestedAt: 1 },
    { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60, name: 'channel_messages_ttl' }
  );

  // privacy_settings: user opt-out preferences
  await db.collection('privacy_settings').createIndex({ userId: 1 }, { unique: true });
  await db.collection('privacy_settings').createIndex({ userId: 1, guildId: 1 });
  await db.collection('privacy_settings').createIndex({ requestedDeletion: 1 });

  console.log(`[JOB] indexes ensured (validators ${validatorsApplied ? "applied" : "skipped"})`);
  await client.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureIndexes().catch((e) => {
    console.error("[ERR] ensureIndexes failed:", e);
    process.exit(1);
  });
}
