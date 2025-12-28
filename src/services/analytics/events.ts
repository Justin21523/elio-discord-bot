/**
 * Lightweight event logger for gameplay actions (CPU-only, no AI).
 * Writes to Mongo collection `events`.
 */
import { getCollection } from "../../db/mongo.js";

type LogEventInput = {
  userId: string;
  username?: string;
  guildId?: string | null;
  gameType?: string | null;
  action: string;
  meta?: Record<string, unknown>;
};

export async function logEvent({
  userId,
  username,
  guildId,
  gameType,
  action,
  meta = {},
}: LogEventInput) {
  if (!userId || !action) return;
  const col = getCollection<any>("events");
  const ts = new Date();
  await col.insertOne({
    userId,
    username,
    guildId: guildId || null,
    gameType: gameType || null,
    action,
    meta,
    ts,
    day: ts.toISOString().slice(0, 10), // YYYY-MM-DD
  });
}

export default { logEvent };

