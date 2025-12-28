import type {
  AuditLogRow,
  BotChannel,
  BotHealth,
  BotMetrics,
  BotGuild,
  LlamaHealth,
  LlamaSlots,
  MeResponse,
  PersonaDoc,
  PersonaSummary,
  ScheduleRow,
} from "./types";

const DEMO_KEY = "admin_demo_mode";
const SCHEDULES_KEY = "admin_demo_schedules_v1";
const AUDIT_KEY = "admin_demo_audit_v1";
const PERSONAS_KEY = "admin_demo_personas_v1";

type DemoState = {
  schedulesByGuild: Record<string, ScheduleRow[]>;
  audit: AuditLogRow[];
  personas: PersonaDoc[];
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

  if (url.pathname === "/api/personas") {
    const q = (url.searchParams.get("q") || "").trim();
    const includeDisabled = url.searchParams.get("includeDisabled") === "true";
    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);
    return demoPersonasList({ q, includeDisabled, limit }) as unknown as T;
  }

  const personaMatch = url.pathname.match(/^\/api\/personas\/([^/]+)$/);
  if (personaMatch) {
    const id = decodeURIComponent(personaMatch[1] || "");
    return demoPersonaById(id) as unknown as T;
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

  if (url.pathname === "/api/bot/ai/persona/reply") {
    const input = body as any;
    const personaName = String(input?.personaName || "").trim();
    const message = String(input?.message || "").trim();
    const useRag = input?.useRag !== false;

    const state = loadState();
    const persona = state.personas.find((p) => p.name === personaName);

    const result = !personaName || !message
      ? { ok: false, error: { message: "personaName and message are required" } }
      : !persona
        ? { ok: false, error: { message: `Persona "${personaName}" not found` } }
        : {
            ok: true,
            data: {
              text: `${persona.name} (demo): ${message}`,
              tokensEvaluated: 128,
              tokensPredicted: 64,
              tokensUsed: 192,
              model: "demo-llama",
              latencyMs: 220,
              ...(useRag ? { ragSources: ["demo://rag/elioverse.md"] } : {}),
            },
          };

    appendAudit({
      action: "ai.personaReplyTest",
      guildId: null,
      risk: "low",
      ok: Boolean((result as any).ok),
      meta: { personaName, messageLen: message.length, useRag },
    });

    return result as unknown as T;
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

  if (url.pathname === "/api/personas") {
    const input = body as any;
    const name = String(input?.name || "").trim();
    if (!name) throw new Error("Demo: name is required");

    const state = loadState();
    const existing = state.personas.find((p) => p.name === name);
    if (existing) throw new Error(`Demo: persona "${name}" already exists`);

    const now = new Date().toISOString();
    const doc: PersonaDoc = {
      id: `demo_persona_${uuid()}`,
      name,
      enabled: input?.enabled !== false,
      avatar: typeof input?.avatar === "string" ? input.avatar : null,
      avatarUrl: typeof input?.avatarUrl === "string" ? input.avatarUrl : null,
      color: typeof input?.color === "number" ? input.color : input?.color ? Number.parseInt(String(input.color), 10) : null,
      description: typeof input?.description === "string" ? input.description : null,
      system_prompt: typeof input?.system_prompt === "string" ? input.system_prompt : null,
      openers: coerceStringArray(input?.openers),
      likes: coerceStringArray(input?.likes),
      dislikes: coerceStringArray(input?.dislikes),
      traits: coerceNumberMap(input?.traits),
      personality: typeof input?.personality === "string" ? input.personality : null,
      speaking_style: typeof input?.speaking_style === "string" ? input.speaking_style : null,
      createdAt: now,
      updatedAt: now,
    };

    state.personas = [doc, ...state.personas];
    saveState(state);

    appendAudit({ action: "personas.create", guildId: null, risk: "high", ok: true, meta: { id: doc.id, name } });

    return ({ id: doc.id } as unknown) as T;
  }

  const personaMatch = url.pathname.match(/^\/api\/personas\/([^/]+)$/);
  if (personaMatch) {
    const id = decodeURIComponent(personaMatch[1] || "");
    const input = body as any;
    const name = String(input?.name || "").trim();
    if (!name) throw new Error("Demo: name is required");

    const state = loadState();
    const idx = state.personas.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Demo: persona not found");

    const existingName = state.personas.find((p) => p.name === name && p.id !== id);
    if (existingName) throw new Error(`Demo: persona "${name}" already exists`);

    const now = new Date().toISOString();
    const prev = state.personas[idx]!;
    const next: PersonaDoc = {
      ...prev,
      name,
      enabled: input?.enabled !== false,
      avatar: typeof input?.avatar === "string" ? input.avatar : null,
      avatarUrl: typeof input?.avatarUrl === "string" ? input.avatarUrl : null,
      color: typeof input?.color === "number" ? input.color : input?.color ? Number.parseInt(String(input.color), 10) : null,
      description: typeof input?.description === "string" ? input.description : null,
      system_prompt: typeof input?.system_prompt === "string" ? input.system_prompt : null,
      openers: coerceStringArray(input?.openers),
      likes: coerceStringArray(input?.likes),
      dislikes: coerceStringArray(input?.dislikes),
      traits: coerceNumberMap(input?.traits),
      personality: typeof input?.personality === "string" ? input.personality : null,
      speaking_style: typeof input?.speaking_style === "string" ? input.speaking_style : null,
      updatedAt: now,
    };

    state.personas = state.personas.map((p) => (p.id === id ? next : p));
    saveState(state);

    appendAudit({ action: "personas.update", guildId: null, risk: "high", ok: true, meta: { id, name } });

    return next as unknown as T;
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
    personas: defaultPersonas(),
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

    const rawPersonas = localStorage.getItem(PERSONAS_KEY);
    if (rawPersonas) {
      const parsed = JSON.parse(rawPersonas) as DemoState["personas"];
      if (Array.isArray(parsed)) base.personas = parsed;
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
    localStorage.setItem(PERSONAS_KEY, JSON.stringify(state.personas));
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

function defaultPersonas(): PersonaDoc[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo_persona_elio",
      name: "Elio",
      enabled: true,
      avatar: null,
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
      color: 3066993,
      description: "Curious cosmic kid ambassador (demo)",
      system_prompt: "You are Elio. Keep replies short, playful, and in-character.",
      openers: ["cosmic hi!!", "wow hi there!"],
      likes: ["space", "friends", "snacks"],
      dislikes: ["bullies", "boring lectures"],
      traits: { curiosity: 0.9, kindness: 0.8 },
      personality: "friendly and enthusiastic",
      speaking_style: "short, casual, kid-like",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo_persona_bryce",
      name: "Bryce",
      enabled: true,
      avatar: null,
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
      color: 15105570,
      description: "A redeemed friend with a calm vibe (demo)",
      system_prompt: "You are Bryce. Keep it casual and supportive.",
      openers: ["hey.", "yo what's up"],
      likes: ["music", "hanging out"],
      dislikes: ["drama"],
      traits: { calm: 0.7, loyalty: 0.8 },
      personality: "chill, protective",
      speaking_style: "short, grounded",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo_persona_disabled",
      name: "Old Persona (Disabled)",
      enabled: false,
      avatar: null,
      avatarUrl: null,
      color: null,
      description: "Hidden unless includeDisabled=true (demo)",
      system_prompt: null,
      openers: [],
      likes: [],
      dislikes: [],
      traits: {},
      personality: null,
      speaking_style: null,
      createdAt: now,
      updatedAt: now,
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

function demoPersonasList(params: { q: string; includeDisabled: boolean; limit: number }): PersonaSummary[] {
  const q = params.q.trim().toLowerCase();
  const state = loadState();

  let rows = [...state.personas];
  if (!params.includeDisabled) rows = rows.filter((p) => p.enabled);
  if (q) {
    rows = rows.filter((p) => {
      const hay = `${p.name} ${p.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return rows.slice(0, params.limit).map((p) => ({
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    avatar: p.avatar ?? null,
    avatarUrl: p.avatarUrl ?? null,
    color: typeof p.color === "number" ? p.color : null,
    description: p.description ?? null,
    updatedAt: p.updatedAt ?? null,
  }));
}

function demoPersonaById(id: string): PersonaDoc {
  const state = loadState();
  const doc = state.personas.find((p) => p.id === id);
  if (!doc) throw new Error("Demo: persona not found");
  return doc;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x)).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function coerceNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number.parseFloat(String(v));
    if (!Number.isFinite(n)) continue;
    out[k] = n;
  }
  return out;
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `u_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}
