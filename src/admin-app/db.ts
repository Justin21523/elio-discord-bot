/**
 * admin-app/db.ts
 * Mongo helpers and admin session storage.
 * All code/comments in English only.
 */

import { MongoClient, ObjectId } from "mongodb";
import type { Db, Filter } from "mongodb";
import type { DiscordGuild, DiscordUser } from "./discord.js";

export type AdminSession = {
  _id: string; // session id
  user: DiscordUser;
  guilds: DiscordGuild[];
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: Date;
  csrfToken?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduleDoc = {
  _id?: ObjectId;
  guildId: string;
  channelId: string;
  kind: string;
  hhmm: string;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type PersonaFields = {
  name: string;
  enabled?: boolean;
  avatar?: string | null;
  avatarUrl?: string | null;
  color?: number | null;
  description?: string | null;
  system_prompt?: string | null;
  openers?: string[];
  likes?: string[];
  dislikes?: string[];
  traits?: Record<string, number>;
  personality?: string | null;
  speaking_style?: string | null;
};

export type PersonaDoc = PersonaFields & {
  _id?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export type PersonaSummary = {
  _id?: ObjectId;
  name: string;
  enabled?: boolean;
  avatar?: string | null;
  avatarUrl?: string | null;
  color?: number | null;
  description?: string | null;
  updatedAt?: Date;
};

export type AdminAuditLogRisk = "low" | "medium" | "high" | "critical";

export type AdminAuditLogActor = {
  userId: string;
  username: string;
  discriminator: string;
  globalName?: string | null;
};

export type AdminAuditLogDoc = {
  _id?: ObjectId;
  ts: Date;
  requestId: string;
  actor: AdminAuditLogActor;
  guildId: string | null;
  action: string;
  risk: AdminAuditLogRisk;
  ok: boolean;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
};

export async function connectAdminDb(params: {
  mongoUri: string;
  dbName: string;
}): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(params.mongoUri, { appName: "communiverse-admin" });
  await client.connect();
  return { client, db: client.db(params.dbName) };
}

export function serializeId(doc: { _id?: ObjectId }): string | null {
  return doc._id ? doc._id.toHexString() : null;
}

export async function upsertAdminSession(db: Db, session: AdminSession): Promise<void> {
  await db.collection<AdminSession>("admin_sessions").updateOne(
    { _id: session._id },
    { $set: session, $setOnInsert: { createdAt: session.createdAt } },
    { upsert: true }
  );
}

export async function getAdminSession(db: Db, sessionId: string): Promise<AdminSession | null> {
  return db.collection<AdminSession>("admin_sessions").findOne({ _id: sessionId });
}

export async function deleteAdminSession(db: Db, sessionId: string): Promise<void> {
  await db.collection<AdminSession>("admin_sessions").deleteOne({ _id: sessionId });
}

export async function touchAdminSession(db: Db, sessionId: string, updatedAt: Date): Promise<void> {
  await db
    .collection<AdminSession>("admin_sessions")
    .updateOne({ _id: sessionId }, { $set: { updatedAt } });
}

export async function setAdminSessionCsrfToken(
  db: Db,
  sessionId: string,
  csrfToken: string,
  updatedAt: Date
): Promise<void> {
  await db
    .collection<AdminSession>("admin_sessions")
    .updateOne({ _id: sessionId }, { $set: { csrfToken, updatedAt } });
}

export async function listSchedules(db: Db, guildId: string): Promise<ScheduleDoc[]> {
  return db
    .collection<ScheduleDoc>("schedules")
    .find({ guildId })
    .sort({ kind: 1 })
    .toArray();
}

export async function upsertSchedule(
  db: Db,
  input: Omit<ScheduleDoc, "_id" | "createdAt" | "updatedAt">
): Promise<void> {
  const now = new Date();
  await db.collection<ScheduleDoc>("schedules").updateOne(
    { guildId: input.guildId, kind: input.kind },
    {
      $set: { ...input, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

export async function disableSchedule(db: Db, guildId: string, kind: string): Promise<void> {
  await db.collection<ScheduleDoc>("schedules").updateOne(
    { guildId, kind },
    { $set: { enabled: false, updatedAt: new Date() } }
  );
}

export async function listPersonas(
  db: Db,
  params: { q?: string; includeDisabled?: boolean; limit: number }
): Promise<PersonaSummary[]> {
  const query = (params.q || "").trim();
  const includeDisabled = params.includeDisabled === true;

  const filter: Filter<PersonaDoc> & Record<string, unknown> = {};
  if (!includeDisabled) filter.enabled = { $ne: false };

  if (query) {
    const safe = escapeRegex(query);
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
    ];
  }

  const projection = {
    name: 1,
    enabled: 1,
    avatar: 1,
    avatarUrl: 1,
    color: 1,
    description: 1,
    updatedAt: 1,
  };

  return db
    .collection<PersonaDoc>("personas")
    .find(filter, { projection })
    .sort({ name: 1 })
    .limit(params.limit)
    .toArray() as unknown as PersonaSummary[];
}

export async function getPersonaById(db: Db, id: string): Promise<PersonaDoc | null> {
  try {
    const oid = new ObjectId(id);
    return await db.collection<PersonaDoc>("personas").findOne({ _id: oid });
  } catch {
    return null;
  }
}

export async function getPersonaByName(db: Db, name: string): Promise<PersonaDoc | null> {
  return await db.collection<PersonaDoc>("personas").findOne({ name });
}

export async function createPersona(
  db: Db,
  doc: Omit<PersonaDoc, "_id">
): Promise<{ insertedId: ObjectId }> {
  const result = await db.collection<PersonaDoc>("personas").insertOne(doc);
  return { insertedId: result.insertedId };
}

export async function updatePersonaById(
  db: Db,
  id: string,
  update: Partial<PersonaDoc>
): Promise<void> {
  const oid = new ObjectId(id);
  await db.collection<PersonaDoc>("personas").updateOne({ _id: oid }, { $set: update });
}

export async function insertAuditLog(
  db: Db,
  log: Omit<AdminAuditLogDoc, "_id">
): Promise<void> {
  await db.collection<AdminAuditLogDoc>("admin_audit_logs").insertOne(log);
}

export async function listAuditLogs(
  db: Db,
  filter: Filter<AdminAuditLogDoc>,
  limit: number
): Promise<AdminAuditLogDoc[]> {
  return db
    .collection<AdminAuditLogDoc>("admin_audit_logs")
    .find(filter)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
