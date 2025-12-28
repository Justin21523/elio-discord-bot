import type { AuditLogRow, BotChannel, BotHealth, BotMetrics, BotGuild, LlamaHealth, LlamaSlots, MeResponse, ScheduleRow } from "./types";

const DEMO_KEY = "admin_demo_mode";
const SCHEDULES_KEY = "admin_demo_schedules_v1";
const AUDIT_KEY = "admin_demo_audit_v1";

type DemoState = {
  schedulesByGuild: Record<string, ScheduleRow[]>;
  audit: AuditLogRow[];
};

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const demo = url.searchParams.get("demo");
    if (demo === "1") {
      localStorage.setItem(DEMO_KEY, "true");
      return true;
    }
    if (demo === "0") {
      localStorage.removeItem(DEMO_KEY);
      return false;
    }
    return localStorage.getItem(DEMO_KEY) === "true";
  } catch {
    return false;
  }
}

export function enableDemoMode(): void {
  try {
    localStorage.setItem(DEMO_KEY, "true");
  } catch {
    // ignore
  }
}

export function disableDemoMode(): void {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    // ignore
  }
}

export function demoGet<T>(path: string): T {
  const url = new URL(path, "http://demo.local");

  if (url.pathname === "/api/me") return demoMe() as unknown as T;
  if (url.pathname === "/api/bot/health") return demoBotHealth() as unknown as T;
  if (url.pathname === "/api/bot/metrics") return demoBotMetrics() as unknown as T;
  if (url.pathname === "/api/bot/ai/llama/health") return demoLlamaHealth() as unknown as T;
  if (url.pathname === "/api/bot/ai/llama/slots") return demoLlamaSlots() as unknown as T;
  if (url.pathname === "/api/bot/scheduler/jobs") return demoJobs() as unknown as T;
  if (url.pathname === "/api/bot/discord/guilds") return demoBotGuilds() as unknown as T;

  if (url.pathname === "/api/bot/discord/channels") {
    const guildId = url.searchParams.get("guildId") || "";
    return demoBotChannels(guildId) as unknown as T;
  }

  const schedMatch = url.pathname.match(/^\/api\/guilds\/([^/]+)\/schedules$/);
  if (schedMatch) {
    const guildId = schedMatch[1]!;
    return demoSchedulesList(guildId) as unknown as T;
  }

  if (url.pathname === "/api/audit") {
    const guildId = url.searchParams.get("guildId") || "";
    const risk = url.searchParams.get("risk") || "";
    const okParam = url.searchParams.get("ok") || "";
    const action = url.searchParams.get("action") || "";
    const actorUserId = url.searchParams.get("actorUserId") || "";
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 100);
    return demoAuditList({ guildId, risk, okParam, action, actorUserId, limit }) as unknown as T;
  }

  throw new Error(`Demo API: no handler for GET ${url.pathname}`);
}

export function demoPost<T>(path: string, body: unknown): T {
  const url = new URL(path, "http://demo.local");

  if (url.pathname === "/api/logout") {
    appendAudit({
      action: "auth.logout",
      guildId: null,
      risk: "low",
      ok: true,
      meta: null,
    });
    return undefined as unknown as T;
  }

  if (url.pathname === "/api/bot/runtime/restart") {
    appendAudit({ action: "runtime.restart", guildId: null, risk: "critical", ok: true, meta: null });
    return ({ restarting: true } as unknown) as T;
  }

  if (url.pathname === "/api/bot/discord/deploy-commands") {
    const input = body as any;
    appendAudit({
      action: "discord.deployCommands",
      guildId: null,
      risk: "critical",
      ok: true,
      meta: { scope: input?.scope || null, guildId: input?.guildId || null },
    });
    return ({ ok: true, message: "Demo: commands deployed" } as unknown) as T;
  }

  const schedMatch = url.pathname.match(/^\/api\/guilds\/([^/]+)\/schedules$/);
  if (schedMatch) {
    const guildId = schedMatch[1]!;
    const input = body as any;
    const kind = String(input?.kind || "").trim();
    const hhmm = String(input?.hhmm || "").trim();
    const channelId = String(input?.channelId || "").trim();
    const enabled = input?.enabled !== false;
    if (!kind || !hhmm || !channelId) throw new Error("Demo: kind, hhmm, channelId required");

    const state = loadState();
    const now = new Date().toISOString();
    const list = state.schedulesByGuild[guildId] || [];
    const existing = list.find((r) => r.kind === kind);
    const next: ScheduleRow = existing
      ? { ...existing, hhmm, channelId, enabled, updatedAt: now }
      : {
          id: `demo_${uuid()}`,
          guildId,
          kind,
          hhmm,
          channelId,
          enabled,
          createdAt: now,
          updatedAt: now,
        };

    const merged = existing ? list.map((r) => (r.kind === kind ? next : r)) : [next, ...list];
    state.schedulesByGuild[guildId] = merged;
    saveState(state);

    appendAudit({
      action: "schedules.upsert",
      guildId,
      risk: "medium",
      ok: true,
      meta: { kind, hhmm, channelId, enabled },
    });

    return undefined as unknown as T;
  }

  throw new Error(`Demo API: no handler for POST ${url.pathname}`);
}

export function demoDelete(path: string): void {
  const url = new URL(path, "http://demo.local");

  const match = url.pathname.match(/^\/api\/guilds\/([^/]+)\/schedules\/([^/]+)$/);
  if (!match) {
    throw new Error(`Demo API: no handler for DELETE ${url.pathname}`);
  }

  const guildId = match[1]!;
  const kind = decodeURIComponent(match[2]!);
  const state = loadState();
  const list = state.schedulesByGuild[guildId] || [];
  const now = new Date().toISOString();
  state.schedulesByGuild[guildId] = list.map((r) =>
    r.kind === kind ? { ...r, enabled: false, updatedAt: now } : r
  );
  saveState(state);

  appendAudit({ action: "schedules.disable", guildId, risk: "medium", ok: true, meta: { kind } });
}

function demoMe(): MeResponse {
  return {
    user: {
      id: "999999999999999999",
      username: "demo",
      discriminator: "0001",
      global_name: "Demo Admin",
      avatar: null,
    },
    superAdmin: true,
    csrfToken: "demo",
    guilds: [
      { id: "111111111111111111", name: "Elioverse (Demo)", role: "guild_admin" },
      { id: "222222222222222222", name: "Communiverse Labs (Demo)", role: "guild_manager" },
    ],
  };
}

function demoBotHealth(): BotHealth {
  return {
    ok: true,
    node: { version: "v20.x (demo)", pid: 12345, uptimeSec: 3600 },
    bot: { ready: true, userTag: "Communiverse#0000", guildCount: 7 },
  };
}

function demoBotMetrics(): BotMetrics {
  return {
    counters: {
      "commands.invocations": 1284,
      "messages.processed": 9852,
      "ai.llama.calls": 341,
      "ai.fallback.personaLogic": 19,
      "minigames.started": 422,
    },
    gauges: {
      "process.memory.rss_mb": 412,
      "scheduler.active_jobs": 6,
      "llama.queue_depth": 0,
    },
  };
}

function demoLlamaHealth(): LlamaHealth {
  return {
    enabled: true,
    serverUrl: "http://live4.dothost.net:8080",
    health: { ok: true, status: "ok", model: "mistral-7b-instruct-q4 (demo)" },
  };
}

function demoLlamaSlots(): LlamaSlots {
  return {
    enabled: true,
    serverUrl: "http://live4.dothost.net:8080",
    slots: {
      slots: [{ id: 0, state: "idle", n_ctx: 8192, n_batch: 512 }],
      queue: [],
    },
  };
}

function demoJobs(): Array<{ guildId: string; channelId: string; kind: string; hhmm: string }> {
  const state = loadState();
  const schedules = Object.values(state.schedulesByGuild).flat().filter((r) => r.enabled);
  const fromSchedules = schedules.map((r) => ({
    guildId: r.guildId,
    channelId: r.channelId,
    kind: r.kind,
    hhmm: r.hhmm,
  }));
  return [
    ...fromSchedules,
    { guildId: "global", channelId: "—", kind: "maintenance", hhmm: "02:00" },
  ];
}

function demoBotGuilds(): BotGuild[] {
  return [
    { id: "111111111111111111", name: "Elioverse (Demo)" },
    { id: "333333333333333333", name: "A Guild You Don’t Manage" },
  ];
}

function demoBotChannels(guildId: string): BotChannel[] {
  if (guildId === "222222222222222222") {
    return [
      { id: "222200000000000001", name: "lobby", type: 0 },
      { id: "222200000000000002", name: "announcements", type: 0 },
    ];
  }
  return [
    { id: "111100000000000001", name: "general", type: 0 },
    { id: "111100000000000002", name: "bot-commands", type: 0 },
    { id: "111100000000000003", name: "mod-log", type: 0 },
  ];
}

function demoSchedulesList(guildId: string): ScheduleRow[] {
  const state = loadState();
  return state.schedulesByGuild[guildId] || [];
}

function demoAuditList(params: {
  guildId: string;
  risk: string;
  okParam: string;
  action: string;
  actorUserId: string;
  limit: number;
}): AuditLogRow[] {
  const state = loadState();
  let rows = [...state.audit];
  if (params.guildId) rows = rows.filter((r) => r.guildId === params.guildId);
  if (params.risk) rows = rows.filter((r) => r.risk === params.risk);
  if (params.okParam === "true") rows = rows.filter((r) => r.ok);
  if (params.okParam === "false") rows = rows.filter((r) => !r.ok);
  if (params.action) rows = rows.filter((r) => r.action === params.action);
  if (params.actorUserId) rows = rows.filter((r) => r.actor.userId === params.actorUserId);
  return rows.slice(0, params.limit);
}

function loadState(): DemoState {
  const base: DemoState = {
    schedulesByGuild: defaultSchedules(),
    audit: defaultAudit(),
  };

  try {
    const rawSched = localStorage.getItem(SCHEDULES_KEY);
    if (rawSched) {
      const parsed = JSON.parse(rawSched) as DemoState["schedulesByGuild"];
      if (parsed && typeof parsed === "object") base.schedulesByGuild = parsed;
    }

    const rawAudit = localStorage.getItem(AUDIT_KEY);
    if (rawAudit) {
      const parsed = JSON.parse(rawAudit) as DemoState["audit"];
      if (Array.isArray(parsed)) base.audit = parsed;
    }
  } catch {
    // ignore
  }

  return base;
}

function saveState(state: DemoState): void {
  try {
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(state.schedulesByGuild));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(state.audit));
  } catch {
    // ignore
  }
}

function defaultSchedules(): Record<string, ScheduleRow[]> {
  const now = new Date().toISOString();
  return {
    "111111111111111111": [
      {
        id: "demo_sched_1",
        guildId: "111111111111111111",
        channelId: "111100000000000002",
        kind: "drop",
        hhmm: "09:00",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo_sched_2",
        guildId: "111111111111111111",
        channelId: "111100000000000001",
        kind: "greet",
        hhmm: "12:00",
        enabled: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    "222222222222222222": [
      {
        id: "demo_sched_3",
        guildId: "222222222222222222",
        channelId: "222200000000000001",
        kind: "digest",
        hhmm: "10:00",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function defaultAudit(): AuditLogRow[] {
  const actor = demoMe().user;
  const now = new Date();
  return [
    {
      id: "demo_audit_1",
      ts: now.toISOString(),
      requestId: uuid(),
      actor: { userId: actor.id, username: actor.username, discriminator: actor.discriminator, globalName: actor.global_name },
      guildId: null,
      action: "auth.login",
      risk: "low",
      ok: true,
      ip: "127.0.0.1",
      userAgent: "demo",
      meta: { demo: true },
    },
  ];
}

function appendAudit(params: {
  action: string;
  guildId: string | null;
  risk: AuditLogRow["risk"];
  ok: boolean;
  meta: Record<string, unknown> | null;
}) {
  const state = loadState();
  const actor = demoMe().user;
  const row: AuditLogRow = {
    id: `demo_audit_${uuid()}`,
    ts: new Date().toISOString(),
    requestId: uuid(),
    actor: {
      userId: actor.id,
      username: actor.username,
      discriminator: actor.discriminator,
      globalName: actor.global_name,
    },
    guildId: params.guildId,
    action: params.action,
    risk: params.risk,
    ok: params.ok,
    ip: "127.0.0.1",
    userAgent: "demo",
    meta: params.meta,
  };
  state.audit = [row, ...state.audit].slice(0, 500);
  saveState(state);
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `u_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

