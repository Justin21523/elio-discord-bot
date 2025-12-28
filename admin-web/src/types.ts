export type DiscordUser = {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type GuildRole = "guild_admin" | "guild_manager" | "read_only";

export type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  role?: GuildRole;
};

export type MeResponse = {
  user: DiscordUser;
  guilds: DiscordGuild[];
  superAdmin?: boolean;
  csrfToken?: string | null;
};

export type BotChannel = {
  id: string;
  name: string;
  type: number;
};

export type BotGuild = {
  id: string;
  name: string;
};

export type ScheduleRow = {
  id: string | null;
  guildId: string;
  channelId: string;
  kind: string;
  hhmm: string;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BotMetrics = {
  counters?: Record<string, number>;
  gauges?: Record<string, number>;
  histograms?: Record<string, unknown>;
};

export type BotHealth = {
  ok: boolean;
  bot?: { ready?: boolean; userTag?: string | null; guildCount?: number };
  node?: { version?: string; pid?: number; uptimeSec?: number };
};

export type LlamaHealth = {
  enabled: boolean;
  serverUrl: string;
  health: { ok: boolean; status?: string; model?: string };
};

export type LlamaSlots = {
  enabled: boolean;
  serverUrl: string;
  slots: unknown;
};

export type AuditActor = {
  userId: string;
  username: string;
  discriminator: string;
  globalName?: string | null;
};

export type AuditRisk = "low" | "medium" | "high" | "critical";

export type AuditLogRow = {
  id: string | null;
  ts: string;
  requestId: string;
  actor: AuditActor;
  guildId: string | null;
  action: string;
  risk: AuditRisk;
  ok: boolean;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
};

