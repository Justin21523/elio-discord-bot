/**
 * admin/server.ts
 * Minimal Admin HTTP API (optional).
 * All code/comments in English only.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { logger } from "../util/logger.js";
import { ChannelType } from "discord.js";
import type { Client } from "discord.js";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type SchedulerLike = {
  getActiveJobs: () => unknown;
  reloadForGuild?: (guildId: string) => Promise<unknown>;
};

type MetricsLike = {
  getAllMetrics: () => unknown;
};

type PublicConfigLike = {
  nodeEnv?: string;
  observability?: { logLevel?: string; metricsPort?: number };
  admin?: { enabled?: boolean; host?: string; port?: number };
  channelHistory?: { enabled?: boolean; cron?: string; maxDays?: number };
  ai?: { enabled?: boolean; modelText?: string; modelVlm?: string; embeddingsModel?: string };
};

export type AdminServerDeps = {
  client: Client;
  scheduler: SchedulerLike;
  metrics: MetricsLike;
  config: PublicConfigLike;
};

export type AdminServerOptions = {
  host: string;
  port: number;
  token?: string;
};

export function startAdminServer(
  deps: AdminServerDeps,
  options: AdminServerOptions
): Server {
  const { host, port, token } = options;

  const server = createServer((req, res) => {
    handleRequest(req, res, deps, token).catch((error: unknown) => {
      logger.error("[ADMIN] Unhandled request error", { error: getErrorMessage(error) });
      sendJson(res, 500, { ok: false, error: "Internal error" });
    });
  });

  server.listen(port, host, () => {
    logger.info("[ADMIN] Admin API listening", { host, port });
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AdminServerDeps,
  token: string | undefined
): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (token && !isAuthorized(req, token)) {
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    const client = deps.client;
    sendJson(res, 200, {
      ok: true,
      node: { version: process.version, pid: process.pid, uptimeSec: process.uptime() },
      bot: {
        ready: client.isReady(),
        userTag: client.user?.tag ?? null,
        guildCount: client.guilds.cache.size,
      },
    });
    return;
  }

  if (req.method === "GET" && path === "/api/config") {
    sendJson(res, 200, { ok: true, data: sanitizeConfig(deps.config) });
    return;
  }

  if (req.method === "GET" && path === "/api/metrics") {
    sendJson(res, 200, { ok: true, data: deps.metrics.getAllMetrics() as Json });
    return;
  }

  if (req.method === "GET" && path === "/api/scheduler/jobs") {
    sendJson(res, 200, { ok: true, data: deps.scheduler.getActiveJobs() as Json });
    return;
  }

  if (req.method === "GET" && path === "/api/discord/guilds") {
    const guilds = deps.client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
    }));
    sendJson(res, 200, { ok: true, data: guilds as Json });
    return;
  }

  if (req.method === "GET" && path === "/api/discord/channels") {
    const guildId = url.searchParams.get("guildId");
    if (!guildId) {
      sendJson(res, 400, { ok: false, error: "guildId is required" });
      return;
    }

    const guild = deps.client.guilds.cache.get(guildId);
    if (!guild) {
      sendJson(res, 404, { ok: false, error: "Guild not found" });
      return;
    }

    const channels = guild.channels.cache
      .filter(
        (c) =>
          c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      }));

    sendJson(res, 200, { ok: true, data: channels as Json });
    return;
  }

  if (req.method === "POST" && path === "/api/scheduler/reload") {
    if (typeof deps.scheduler.reloadForGuild !== "function") {
      sendJson(res, 501, { ok: false, error: "Not implemented" });
      return;
    }

    const body = await readJson<{ guildId?: string }>(req);
    const guildId = body?.guildId;
    if (!guildId) {
      sendJson(res, 400, { ok: false, error: "guildId is required" });
      return;
    }

    const result = await deps.scheduler.reloadForGuild(guildId);
    sendJson(res, 200, { ok: true, data: result as Json });
    return;
  }

  if (req.method === "GET" && path === "/") {
    sendHtml(res, 200, renderHomeHtml());
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

function renderHomeHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bot Admin</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px; max-width: 1100px; margin: 0 auto; }
      header { display: flex; align-items: baseline; justify-content: space-between; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      pre { background: #0b1020; color: #e8eefc; padding: 12px; border-radius: 8px; overflow: auto; }
      button { padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
      button:hover { background: #f8fafc; }
      .muted { color: #64748b; font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <h1>Bot Admin</h1>
      <div class="muted">v0 (API scaffold)</div>
    </header>
    <p class="muted">
      This is a minimal placeholder UI. Next step: React + Plotly dashboard on top of these APIs.
    </p>
    <p><button id="refresh">Refresh</button></p>
    <div class="grid">
      <section>
        <h2>/health</h2>
        <pre id="health"></pre>
      </section>
      <section>
        <h2>/api/scheduler/jobs</h2>
        <pre id="jobs"></pre>
      </section>
      <section style="grid-column: 1 / -1;">
        <h2>/api/metrics</h2>
        <pre id="metrics"></pre>
      </section>
    </div>
    <script>
      async function load() {
        const [health, jobs, metrics] = await Promise.all([
          fetch('/health').then(r => r.json()),
          fetch('/api/scheduler/jobs').then(r => r.json()),
          fetch('/api/metrics').then(r => r.json()),
        ]);
        document.getElementById('health').textContent = JSON.stringify(health, null, 2);
        document.getElementById('jobs').textContent = JSON.stringify(jobs, null, 2);
        document.getElementById('metrics').textContent = JSON.stringify(metrics, null, 2);
      }
      document.getElementById('refresh').addEventListener('click', load);
      load();
    </script>
  </body>
</html>`;
}

function sanitizeConfig(config: PublicConfigLike): PublicConfigLike {
  const out: PublicConfigLike = {};

  if (typeof config.nodeEnv === "string") {
    out.nodeEnv = config.nodeEnv;
  }

  if (config.observability) {
    const observability: NonNullable<PublicConfigLike["observability"]> = {};
    if (typeof config.observability.logLevel === "string") {
      observability.logLevel = config.observability.logLevel;
    }
    if (typeof config.observability.metricsPort === "number") {
      observability.metricsPort = config.observability.metricsPort;
    }
    out.observability = observability;
  }

  if (config.admin) {
    const admin: NonNullable<PublicConfigLike["admin"]> = {
      enabled: !!config.admin.enabled,
    };
    if (typeof config.admin.host === "string") admin.host = config.admin.host;
    if (typeof config.admin.port === "number") admin.port = config.admin.port;
    out.admin = admin;
  }

  const channelHistory = config.channelHistory;
  if (channelHistory) {
    const safe: NonNullable<PublicConfigLike["channelHistory"]> = {
      enabled: !!channelHistory.enabled,
    };
    if (typeof channelHistory.cron === "string") safe.cron = channelHistory.cron;
    if (typeof channelHistory.maxDays === "number") safe.maxDays = channelHistory.maxDays;
    out.channelHistory = safe;
  }

  const ai = config.ai;
  if (ai) {
    const safe: NonNullable<PublicConfigLike["ai"]> = {
      enabled: !!ai.enabled,
    };
    if (typeof ai.modelText === "string") safe.modelText = ai.modelText;
    if (typeof ai.modelVlm === "string") safe.modelVlm = ai.modelVlm;
    if (typeof ai.embeddingsModel === "string") safe.embeddingsModel = ai.embeddingsModel;
    out.ai = safe;
  }

  return out;
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const raw = req.headers.authorization || "";
  const expected = `Bearer ${token}`;
  return raw === expected;
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: ServerResponse, status: number, body: Json): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (chunks.reduce((sum, b) => sum + b.length, 0) > 1024 * 1024) {
      throw new Error("Request body too large");
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
