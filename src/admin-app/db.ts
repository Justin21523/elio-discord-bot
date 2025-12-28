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
