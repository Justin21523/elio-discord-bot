/**
 * admin-app/index.ts
 * Separate Admin Web service (Discord OAuth + management API + static UI).
 * All code/comments in English only.
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import type { Filter } from "mongodb";

import { loadAdminAppConfig } from "./config.js";
import {
  buildDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordUser,
  refreshDiscordToken,
  userCanManageGuild,
  type DiscordGuild,
} from "./discord.js";
import {
  connectAdminDb,
  deleteAdminSession,
  getAdminSession,
  insertAuditLog,
  listAuditLogs,
  listSchedules,
  listPersonas,
  getPersonaById,
  getPersonaByName,
  createPersona,
  updatePersonaById,
  setAdminSessionCsrfToken,
  touchAdminSession,
  upsertAdminSession,
  upsertSchedule,
  disableSchedule,
  serializeId,
  type AdminSession,
  type AdminAuditLogDoc,
  type AdminAuditLogRisk,
  type PersonaFields,
  type PersonaDoc,
} from "./db.js";
import {
  clearCookie,
  parseCookies,
  readJson,
  sendJson,
  sendRedirect,
  sendText,
  setCookie,
  tryServeStaticFile,
  type Json,
} from "./http.js";

const config = loadAdminAppConfig();
const allowedOrigin = config.webOrigin.replace(/\/+$/, "");

const { client: mongoClient, db } = await connectAdminDb({
  mongoUri: config.mongoUri,
  dbName: config.dbName,
});

const apiRate = createRateLimiter({ windowMs: 60_000, maxRequests: 300 });
const authRate = createRateLimiter({ windowMs: 60_000, maxRequests: 40 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distRoot = path.resolve(__dirname, "../..");
const staticRoot = path.join(distRoot, "admin-web");

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error: unknown) => {
    logError("Unhandled request error", error);
    sendJson(res, 500, { ok: false, error: "Internal error" });
  });
});

server.listen(config.port, config.host, () => {
  logInfo("Admin Web listening", { host: config.host, port: config.port });
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function shutdown(signal: string) {
  logInfo("Shutting down", { signal });
  server.close(() => {
    // noop
  });
  await mongoClient.close().catch(() => {});
  process.exit(0);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);

  const url = new URL(req.url || "/", `http://${config.host}:${config.port}`);
  const pathname = url.pathname;

  setSecurityHeaders(res);
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const ip = getClientIp(req) || "unknown";
  if (pathname.startsWith("/api/") && !apiRate.allow(ip)) {
    sendJson(res, 429, { ok: false, error: "Rate limited" });
    return;
  }
  if (pathname.startsWith("/auth/") && !authRate.allow(ip)) {
    sendText(res, 429, "Rate limited");
    return;
  }

  // Health
  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      node: { version: process.version, pid: process.pid, uptimeSec: process.uptime() },
      mongo: { connected: true, db: config.dbName },
      botAdmin: { configured: !!config.botAdmin },
      discordOAuth: { configured: !!config.discord },
    });
    return;
  }

  // OAuth: start
  if (req.method === "GET" && pathname === "/auth/discord") {
    if (!config.discord) {
      sendText(
        res,
        503,
        "Discord OAuth is not configured. Set DISCORD_OAUTH_CLIENT_SECRET and DISCORD_OAUTH_REDIRECT_URI."
      );
      return;
    }

    const state = crypto.randomUUID();
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    setCookie(res, {
      name: "admin_oauth_state",
      value: state,
      httpOnly: true,
      sameSite: "Lax",
      secure: config.cookieSecure,
      maxAgeSec: 10 * 60,
    });
    setCookie(res, {
      name: "admin_return_to",
      value: returnTo,
      httpOnly: true,
      sameSite: "Lax",
      secure: config.cookieSecure,
      maxAgeSec: 10 * 60,
    });

    const wantsBot = config.discord.scopes.includes("bot");
    const location = buildDiscordAuthorizeUrl({
      clientId: config.discord.clientId,
      redirectUri: config.discord.redirectUri,
      scopes: config.discord.scopes,
      state,
      ...(wantsBot ? { permissions: config.discord.permissions } : {}),
    });
    sendRedirect(res, location);
    return;
  }

  // OAuth: start + guild install (identify+guilds+bot+applications.commands)
  if (req.method === "GET" && pathname === "/auth/discord/install") {
    if (!config.discord) {
      sendText(
        res,
        503,
        "Discord OAuth is not configured. Set DISCORD_OAUTH_CLIENT_SECRET and DISCORD_OAUTH_REDIRECT_URI."
      );
      return;
    }

    const guildId = String(url.searchParams.get("guildId") || "").trim();
    if (!isSnowflake(guildId)) {
      sendText(res, 400, "Invalid guildId");
      return;
    }

    const state = crypto.randomUUID();
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    setCookie(res, {
      name: "admin_oauth_state",
      value: state,
      httpOnly: true,
      sameSite: "Lax",
      secure: config.cookieSecure,
      maxAgeSec: 10 * 60,
    });
    setCookie(res, {
      name: "admin_return_to",
      value: returnTo,
      httpOnly: true,
      sameSite: "Lax",
      secure: config.cookieSecure,
      maxAgeSec: 10 * 60,
    });

    const location = buildDiscordAuthorizeUrl({
      clientId: config.discord.clientId,
      redirectUri: config.discord.redirectUri,
      scopes: installScopes(config.discord.scopes),
      state,
      permissions: config.discord.permissions,
      guildId,
      disableGuildSelect: true,
    });
    sendRedirect(res, location);
    return;
  }

  // OAuth: callback
  if (req.method === "GET" && pathname === "/auth/discord/callback") {
    if (!config.discord) {
      sendText(res, 503, "Discord OAuth is not configured.");
      return;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      sendText(res, 400, "Missing code/state");
      return;
    }

    const cookies = parseCookies(req);
    const expectedState = cookies.admin_oauth_state;
    const returnTo = sanitizeReturnTo(cookies.admin_return_to);

    if (!expectedState || expectedState !== state) {
      sendText(res, 400, "Invalid state");
      return;
    }

    try {
      const token = await exchangeDiscordCode({
        clientId: config.discord.clientId,
        clientSecret: config.discord.clientSecret,
        redirectUri: config.discord.redirectUri,
        code,
      });

      const user = await fetchDiscordUser(token.access_token);
      const guilds = await fetchDiscordGuilds(token.access_token);

      const sessionId = crypto.randomUUID();
      const now = new Date();
      const tokenExpiresAt = new Date(now.getTime() + token.expires_in * 1000);

      const session: AdminSession = {
        _id: sessionId,
        user,
        guilds,
        accessToken: token.access_token,
        tokenExpiresAt,
        csrfToken: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      };

      await upsertAdminSession(db, session);

      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "auth.login",
        risk: "low",
        ok: true,
        req,
        meta: {
          guildCount: session.guilds.length,
          manageableGuildCount: session.guilds.filter(userCanManageGuild).length,
        },
      });

      // Clear one-time cookies and set session cookie
      clearCookie(res, { name: "admin_oauth_state", secure: config.cookieSecure });
      clearCookie(res, { name: "admin_return_to", secure: config.cookieSecure });

      setCookie(res, {
        name: config.cookieName,
        value: sessionId,
        httpOnly: true,
        sameSite: "Lax",
        secure: config.cookieSecure,
        maxAgeSec: config.sessionTtlHours * 3600,
      });

      sendRedirect(res, `${config.webOrigin}${returnTo}`);
      return;
    } catch (error: unknown) {
      logError("OAuth callback failed", error);
      sendText(res, 500, "OAuth callback failed");
      return;
    }
  }

  // API: auth required
  if (pathname.startsWith("/api/")) {
    const session = await requireSession(req, res);
    if (!session) return;

    const isSuperAdmin = isSuperAdminUser(session.user.id);
    const manageableGuildIds = session.guilds.filter(userCanManageGuild).map((g) => g.id);

    if (isUnsafeMethod(req.method) && !passesCsrf(req, session)) {
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "security.csrf",
        risk: "medium",
        ok: false,
        req,
        meta: { pathname },
      });
      sendJson(res, 403, { ok: false, error: "CSRF check failed" });
      return;
    }

    // session routes
    if (req.method === "GET" && pathname === "/api/me") {
      sendJson(res, 200, {
        ok: true,
        data: {
          user: session.user,
          superAdmin: isSuperAdmin,
          csrfToken: session.csrfToken || null,
          guilds: session.guilds.filter(userCanManageGuild).map((g) => ({
            ...g,
            role: getGuildRole(g),
          })),
        },
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      await deleteAdminSession(db, session._id);
      clearCookie(res, { name: config.cookieName, secure: config.cookieSecure });
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "auth.logout",
        risk: "low",
        ok: true,
        req,
        meta: null,
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Personas (catalog)
    if (req.method === "GET" && pathname === "/api/personas") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const q = (url.searchParams.get("q") || "").trim();
      const includeDisabled = url.searchParams.get("includeDisabled") === "true" && isSuperAdmin;
      const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);

      const rows = await listPersonas(db, { q, includeDisabled, limit });
      sendJson(res, 200, {
        ok: true,
        data: rows.map((p) => ({
          id: serializeId(p),
          name: p.name,
          enabled: p.enabled !== false,
          avatar: p.avatar ?? null,
          avatarUrl: p.avatarUrl ?? null,
          color: typeof p.color === "number" ? p.color : null,
          description: p.description ?? null,
          updatedAt: p.updatedAt?.toISOString?.() ?? null,
        })) as Json,
      });
      return;
    }

    const personaByIdMatch = pathname.match(/^\/api\/personas\/([^/]+)$/);
    if (req.method === "GET" && personaByIdMatch) {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const id = decodeURIComponent(personaByIdMatch[1] || "");
      const doc = await getPersonaById(db, id);
      if (!doc) {
        sendJson(res, 404, { ok: false, error: "Persona not found" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        data: serializePersonaDoc(doc) as Json,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/personas") {
      if (!isSuperAdmin) {
        void writeAuditLog({
          requestId,
          actor: toAuditActor(session.user),
          guildId: null,
          action: "personas.create",
          risk: "high",
          ok: false,
          req,
          meta: { reason: "forbidden" },
        });
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const body = await readJson<Record<string, unknown>>(req);
      const parsed = parsePersonaInput(body);
      if (!parsed.ok) {
        sendJson(res, 400, { ok: false, error: parsed.error });
        return;
      }

      const name = parsed.data.name;
      const existing = await getPersonaByName(db, name);
      if (existing) {
        sendJson(res, 409, { ok: false, error: `Persona "${name}" already exists` });
        return;
      }

      const now = new Date();
      const doc: Omit<PersonaDoc, "_id"> = {
        ...parsed.data,
        createdAt: now,
        updatedAt: now,
      };

      const result = await createPersona(db, doc);
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "personas.create",
        risk: "high",
        ok: true,
        req,
        meta: { personaId: result.insertedId.toHexString(), name },
      });

      sendJson(res, 200, { ok: true, data: { id: result.insertedId.toHexString() } as Json });
      return;
    }

    if (req.method === "POST" && personaByIdMatch) {
      if (!isSuperAdmin) {
        void writeAuditLog({
          requestId,
          actor: toAuditActor(session.user),
          guildId: null,
          action: "personas.update",
          risk: "high",
          ok: false,
          req,
          meta: { reason: "forbidden" },
        });
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const id = decodeURIComponent(personaByIdMatch[1] || "");
      const existing = await getPersonaById(db, id);
      if (!existing) {
        sendJson(res, 404, { ok: false, error: "Persona not found" });
        return;
      }

      const body = await readJson<Record<string, unknown>>(req);
      const parsed = parsePersonaInput(body);
      if (!parsed.ok) {
        sendJson(res, 400, { ok: false, error: parsed.error });
        return;
      }

      if (parsed.data.name !== existing.name) {
        const dupe = await getPersonaByName(db, parsed.data.name);
        if (dupe && serializeId(dupe) !== id) {
          sendJson(res, 409, { ok: false, error: `Persona "${parsed.data.name}" already exists` });
          return;
        }
      }

      const now = new Date();
      const patch: Partial<PersonaDoc> = {
        ...parsed.data,
        updatedAt: now,
      };

      await updatePersonaById(db, id, patch);
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "personas.update",
        risk: "high",
        ok: true,
        req,
        meta: {
          personaId: id,
          name: parsed.data.name,
          fields: Object.keys(parsed.data),
          systemPromptLength: typeof parsed.data.system_prompt === "string" ? parsed.data.system_prompt.length : 0,
        },
      });

      const updated = await getPersonaById(db, id);
      sendJson(res, 200, { ok: true, data: updated ? (serializePersonaDoc(updated) as Json) : (serializePersonaDoc({ ...existing, ...patch } as PersonaDoc) as Json) });
      return;
    }

    // Audit log (read-only)
    if (req.method === "GET" && pathname === "/api/audit") {
      const limit = clampInt(url.searchParams.get("limit"), 1, 200, 100);
      const guildId = (url.searchParams.get("guildId") || "").trim();
      const actorUserId = (url.searchParams.get("actorUserId") || "").trim();
      const action = (url.searchParams.get("action") || "").trim();
      const risk = (url.searchParams.get("risk") || "").trim().toLowerCase();
      const okParam = (url.searchParams.get("ok") || "").trim().toLowerCase();
      const before = (url.searchParams.get("before") || "").trim();

      const filter: Filter<AdminAuditLogDoc> & Record<string, unknown> = {};

      if (action) filter.action = action;
      if (actorUserId) filter["actor.userId"] = actorUserId;
      if (okParam === "true") filter.ok = true;
      if (okParam === "false") filter.ok = false;
      if (risk && isAuditRisk(risk)) filter.risk = risk;

      if (before) {
        const beforeDate = new Date(before);
        if (Number.isNaN(beforeDate.getTime())) {
          sendJson(res, 400, { ok: false, error: "Invalid before (expected ISO date)" });
          return;
        }
        filter.ts = { ...(filter.ts || {}), $lt: beforeDate };
      }

      if (guildId) {
        if (!isSnowflake(guildId)) {
          sendJson(res, 400, { ok: false, error: "Invalid guildId" });
          return;
        }
        if (!isSuperAdmin && !canManageGuild(session.guilds, guildId)) {
          sendJson(res, 403, { ok: false, error: "Forbidden" });
          return;
        }
        filter.guildId = guildId;
      } else if (!isSuperAdmin) {
        filter.guildId = { $in: [...manageableGuildIds, null] };
      }

      const logs = await listAuditLogs(db, filter, limit);
      sendJson(res, 200, {
        ok: true,
        data: logs.map((row) => ({
          id: serializeId(row),
          ts: row.ts.toISOString(),
          requestId: row.requestId,
          actor: row.actor,
          guildId: row.guildId,
          action: row.action,
          risk: row.risk,
          ok: row.ok,
          ip: row.ip,
          userAgent: row.userAgent,
          meta: row.meta,
        })) as Json,
      });
      return;
    }

    // Schedules
    const schedMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/schedules$/);
    if (schedMatch) {
      const guildId = schedMatch[1];
      if (!guildId) {
        sendJson(res, 400, { ok: false, error: "Invalid guildId" });
        return;
      }

      if (req.method === "GET") {
        if (!canManageGuild(session.guilds, guildId)) {
          sendJson(res, 403, { ok: false, error: "Forbidden" });
          return;
        }
        const rows = await listSchedules(db, guildId);
        const data = rows.map((r) => ({
          id: serializeId(r),
          guildId: r.guildId,
          channelId: r.channelId,
          kind: r.kind,
          hhmm: r.hhmm,
          enabled: r.enabled,
          createdAt: r.createdAt?.toISOString?.() ?? null,
          updatedAt: r.updatedAt?.toISOString?.() ?? null,
        }));
        sendJson(res, 200, { ok: true, data: data as Json });
        return;
      }

      if (req.method === "POST") {
        if (!canManageGuild(session.guilds, guildId)) {
          void writeAuditLog({
            requestId,
            actor: toAuditActor(session.user),
            guildId,
            action: "schedules.upsert",
            risk: "medium",
            ok: false,
            req,
            meta: { reason: "forbidden" },
          });
          sendJson(res, 403, { ok: false, error: "Forbidden" });
          return;
        }

        const body = await readJson<{
          kind?: string;
          channelId?: string;
          hhmm?: string;
          enabled?: boolean;
        }>(req);

        const kind = String(body.kind || "").trim();
        const channelId = String(body.channelId || "").trim();
        const hhmm = String(body.hhmm || "").trim();
        const enabled = body.enabled !== false;

        if (!kind || !channelId || !hhmm) {
          void writeAuditLog({
            requestId,
            actor: toAuditActor(session.user),
            guildId,
            action: "schedules.upsert",
            risk: "medium",
            ok: false,
            req,
            meta: { reason: "validation", missing: ["kind", "channelId", "hhmm"].filter((k) => !body?.[k as keyof typeof body]) },
          });
          sendJson(res, 400, { ok: false, error: "kind, channelId, hhmm are required" });
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(hhmm)) {
          void writeAuditLog({
            requestId,
            actor: toAuditActor(session.user),
            guildId,
            action: "schedules.upsert",
            risk: "medium",
            ok: false,
            req,
            meta: { reason: "validation", field: "hhmm", value: hhmm },
          });
          sendJson(res, 400, { ok: false, error: "Invalid hhmm (expected HH:MM)" });
          return;
        }

        await upsertSchedule(db, { guildId, kind, channelId, hhmm, enabled });
        await triggerBotSchedulerReload(guildId);

        void writeAuditLog({
          requestId,
          actor: toAuditActor(session.user),
          guildId,
          action: "schedules.upsert",
          risk: "medium",
          ok: true,
          req,
          meta: { kind, channelId, hhmm, enabled },
        });

        sendJson(res, 200, { ok: true });
        return;
      }
    }

    const schedDisableMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/schedules\/([^/]+)$/);
    if (schedDisableMatch && req.method === "DELETE") {
      const guildId = schedDisableMatch[1];
      const kindEnc = schedDisableMatch[2];
      if (!guildId || !kindEnc) {
        sendJson(res, 400, { ok: false, error: "Invalid path" });
        return;
      }
      const kind = decodeURIComponent(kindEnc);
      if (!canManageGuild(session.guilds, guildId)) {
        void writeAuditLog({
          requestId,
          actor: toAuditActor(session.user),
          guildId,
          action: "schedules.disable",
          risk: "medium",
          ok: false,
          req,
          meta: { reason: "forbidden", kind },
        });
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      await disableSchedule(db, guildId, kind);
      await triggerBotSchedulerReload(guildId);
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId,
        action: "schedules.disable",
        risk: "medium",
        ok: true,
        req,
        meta: { kind },
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Bot runtime bridge (optional)
    if (req.method === "GET" && pathname === "/api/bot/health") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const out = await fetchBotAdminJson("/health");
      sendJson(res, 200, { ok: true, data: out as Json });
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/metrics") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const out = await fetchBotAdminJson("/api/metrics");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/ai/llama/health") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const out = await fetchBotAdminJson("/api/ai/llama/health");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/ai/llama/slots") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const out = await fetchBotAdminJson("/api/ai/llama/slots");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "POST" && pathname === "/api/bot/ai/persona/reply") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const body = await readJson<Record<string, unknown>>(req);
      const personaName = typeof body.personaName === "string" ? body.personaName : null;
      const message = typeof body.message === "string" ? body.message : null;
      const useRag = body.useRag !== false;

      const out = await fetchBotAdminJson("/api/ai/persona/reply", {
        method: "POST",
        body: JSON.stringify({ ...body, ...(typeof useRag === "boolean" ? { useRag } : {}) }),
        headers: { "Content-Type": "application/json" },
      });

      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "ai.personaReplyTest",
        risk: "low",
        ok: typeof out === "object" && out !== null ? Boolean((out as any).ok) : true,
        req,
        meta: {
          personaName,
          messageLen: typeof message === "string" ? message.length : null,
        },
      });

      // Always return ok:true for the HTTP call; the inner {ok:false,error} is part of the testbench output.
      sendJson(res, 200, { ok: true, data: out as Json });
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/scheduler/jobs") {
      if (!isSuperAdmin && manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const out = await fetchBotAdminJson("/api/scheduler/jobs");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "POST" && pathname === "/api/bot/runtime/restart") {
      if (!isSuperAdmin) {
        void writeAuditLog({
          requestId,
          actor: toAuditActor(session.user),
          guildId: null,
          action: "runtime.restart",
          risk: "critical",
          ok: false,
          req,
          meta: { reason: "forbidden" },
        });
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const out = await fetchBotAdminJson("/api/runtime/restart", { method: "POST" });
      const ok = typeof out === "object" && out !== null ? Boolean((out as any).ok) : true;
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "runtime.restart",
        risk: "critical",
        ok,
        req,
        meta: null,
      });
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "POST" && pathname === "/api/bot/discord/deploy-commands") {
      if (!isSuperAdmin) {
        void writeAuditLog({
          requestId,
          actor: toAuditActor(session.user),
          guildId: null,
          action: "discord.deployCommands",
          risk: "critical",
          ok: false,
          req,
          meta: { reason: "forbidden" },
        });
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      const body = await readJson<{ scope?: string; guildId?: string }>(req);
      const scope = typeof body.scope === "string" ? body.scope : undefined;
      const guildId = typeof body.guildId === "string" ? body.guildId : undefined;

      const out = await fetchBotAdminJson("/api/discord/deploy-commands", {
        method: "POST",
        body: JSON.stringify({ ...(scope ? { scope } : {}), ...(guildId ? { guildId } : {}) }),
        headers: { "Content-Type": "application/json" },
      });

      const ok = typeof out === "object" && out !== null ? Boolean((out as any).ok) : true;
      void writeAuditLog({
        requestId,
        actor: toAuditActor(session.user),
        guildId: null,
        action: "discord.deployCommands",
        risk: "critical",
        ok,
        req,
        meta: { scope: scope || null, guildId: guildId || null },
      });

      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/discord/guilds") {
      const out = await fetchBotAdminJson("/api/discord/guilds");
      if (isSuperAdmin) {
        sendJson(res, 200, out);
        return;
      }
      if (manageableGuildIds.length === 0) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const base = out as any;
      const list = Array.isArray(base?.data) ? base.data : null;
      if (!list) {
        sendJson(res, 200, out);
        return;
      }
      sendJson(res, 200, {
        ...base,
        data: list.filter((g: any) => manageableGuildIds.includes(String(g?.id || ""))),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/discord/channels") {
      const guildId = url.searchParams.get("guildId") || "";
      if (!canManageGuild(session.guilds, guildId)) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      const out = await fetchBotAdminJson(`/api/discord/channels?guildId=${encodeURIComponent(guildId)}`);
      sendJson(res, 200, out);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  // Static UI (production)
  if (req.method === "GET") {
    const hasStatic = await dirExists(staticRoot);
    if (hasStatic) {
      const served =
        pathname === "/"
          ? await tryServeStaticFile({
              reqPath: "/index.html",
              rootDir: staticRoot,
              res,
            })
          : await tryServeStaticFile({ reqPath: pathname, rootDir: staticRoot, res });

      if (served) return;

      // SPA fallback
      const fallback = await tryServeStaticFile({
        reqPath: "/index.html",
        rootDir: staticRoot,
        res,
      });
      if (fallback) return;
    }

    sendText(
      res,
      200,
      "Admin Web UI not built. Run `npm run admin:web:build` then start this service."
    );
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

function installScopes(baseScopes: string[]): string[] {
  return uniqStrings([
    ...baseScopes,
    "identify",
    "guilds",
    "bot",
    "applications.commands",
  ]);
}

function uniqStrings(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const v = String(item || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function isSnowflake(id: string): boolean {
  return /^\d{16,20}$/.test(id);
}

async function requireSession(req: IncomingMessage, res: ServerResponse): Promise<AdminSession | null> {
  const cookies = parseCookies(req);
  const sessionId = cookies[config.cookieName];
  if (!sessionId) {
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return null;
  }

  const sessionDoc = await getAdminSession(db, sessionId);
  if (!sessionDoc) {
    clearCookie(res, { name: config.cookieName, secure: config.cookieSecure });
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return null;
  }

  // Expire session by TTL (not just Discord token)
  const ttlMs = config.sessionTtlHours * 3600 * 1000;
  const lastSeenMs = new Date(sessionDoc.updatedAt).getTime();
  if (Date.now() - lastSeenMs > ttlMs) {
    await deleteAdminSession(db, sessionId);
    clearCookie(res, { name: config.cookieName, secure: config.cookieSecure });
    sendJson(res, 401, { ok: false, error: "Session expired" });
    return null;
  }

  let session = sessionDoc;
  if (!session.csrfToken) {
    const now = new Date();
    const csrfToken = crypto.randomUUID();
    await setAdminSessionCsrfToken(db, sessionId, csrfToken, now);
    session = { ...session, csrfToken, updatedAt: now };
  } else if (Date.now() - lastSeenMs > 10 * 60 * 1000) {
    const now = new Date();
    await touchAdminSession(db, sessionId, now);
    session = { ...session, updatedAt: now };
  }

  // Refresh Discord token if needed (best-effort)
  if (
    config.discord &&
    new Date(session.tokenExpiresAt).getTime() <= Date.now() + 30_000 &&
    session.refreshToken
  ) {
    try {
      const token = await refreshDiscordToken({
        clientId: config.discord.clientId,
        clientSecret: config.discord.clientSecret,
        refreshToken: session.refreshToken,
      });

      const now = new Date();
      const updated: AdminSession = {
        ...session,
        accessToken: token.access_token,
        refreshToken: token.refresh_token || session.refreshToken,
        tokenExpiresAt: new Date(now.getTime() + token.expires_in * 1000),
        updatedAt: now,
      };

      await upsertAdminSession(db, updated);
      return updated;
    } catch (error: unknown) {
      logError("Discord token refresh failed", error);
      // keep current session; user may re-login if API calls fail
    }
  }

  return session;
}

function sanitizeReturnTo(raw: string | null | undefined): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "/";
  if (!v.startsWith("/")) return "/";
  if (v.startsWith("//")) return "/";
  return v;
}

function canManageGuild(guilds: DiscordGuild[], guildId: string): boolean {
  const g = guilds.find((x) => x.id === guildId);
  if (!g) return false;
  return userCanManageGuild(g);
}

async function triggerBotSchedulerReload(guildId: string): Promise<void> {
  if (!config.botAdmin?.url) return;
  try {
    await fetchBotAdminJson("/api/scheduler/reload", {
      method: "POST",
      body: JSON.stringify({ guildId }),
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    logError("Bot scheduler reload failed (non-fatal)", error);
  }
}

async function fetchBotAdminJson(
  pathAndQuery: string,
  init: RequestInit = {}
): Promise<Json> {
  if (!config.botAdmin?.url) {
    return { ok: false, error: "BOT_ADMIN_URL not configured" };
  }

  const headers = new Headers(init.headers || {});
  if (config.botAdmin.token) {
    headers.set("Authorization", `Bearer ${config.botAdmin.token}`);
  }

  const res = await fetch(`${config.botAdmin.url}${pathAndQuery}`, {
    ...init,
    headers,
  });

  const text = await res.text().catch(() => "");
  if (!text) return { ok: false, error: `Empty response (${res.status})` };

  try {
    return JSON.parse(text) as Json;
  } catch {
    return { ok: false, error: `Non-JSON response (${res.status})`, body: text as unknown as Json };
  }
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", message, ...meta }));
}

function logError(message: string, error: unknown, meta?: Record<string, unknown>) {
  console.error(
    JSON.stringify({ level: "error", message, error: getErrorMessage(error), ...meta })
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

type WebRole = "super_admin" | "guild_admin" | "guild_manager" | "read_only";

function isSuperAdminUser(userId: string): boolean {
  return config.superAdminUserIds.includes(userId);
}

function getGuildRole(guild: DiscordGuild): WebRole {
  if (guild.owner) return "guild_admin";
  const perms = BigInt(guild.permissions || "0");
  const ADMINISTRATOR = 0x8n;
  const MANAGE_GUILD = 0x20n;
  if ((perms & ADMINISTRATOR) === ADMINISTRATOR) return "guild_admin";
  if ((perms & MANAGE_GUILD) === MANAGE_GUILD) return "guild_manager";
  return "read_only";
}

function isAuditRisk(value: string): value is AdminAuditLogRisk {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number
): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toAuditActor(user: AdminSession["user"]): AdminAuditLogDoc["actor"] {
  return {
    userId: user.id,
    username: user.username,
    discriminator: user.discriminator,
    ...(typeof user.global_name !== "undefined" ? { globalName: user.global_name } : {}),
  };
}

async function writeAuditLog(params: {
  requestId: string;
  actor: AdminAuditLogDoc["actor"];
  guildId: string | null;
  action: string;
  risk: AdminAuditLogRisk;
  ok: boolean;
  req: IncomingMessage;
  meta: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await insertAuditLog(db, {
      ts: new Date(),
      requestId: params.requestId,
      actor: params.actor,
      guildId: params.guildId,
      action: params.action,
      risk: params.risk,
      ok: params.ok,
      ip: getClientIp(params.req),
      userAgent: (params.req.headers["user-agent"] || null) as string | null,
      meta: params.meta,
    });
  } catch (error: unknown) {
    logError("Audit log write failed (non-fatal)", error, { requestId: params.requestId });
  }
}

function getClientIp(req: IncomingMessage): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    return first || null;
  }
  return req.socket.remoteAddress || null;
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== "string") return;
  if (origin !== allowedOrigin) return;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");

  const existing = res.getHeader("Vary");
  const existingValue = Array.isArray(existing)
    ? existing.join(", ")
    : typeof existing === "string"
      ? existing
      : "";
  const next = existingValue ? `${existingValue}, Origin` : "Origin";
  res.setHeader("Vary", next);
}

function isUnsafeMethod(method: string | undefined): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function passesCsrf(req: IncomingMessage, session: AdminSession): boolean {
  if (!isTrustedOrigin(req)) return false;
  const expected = session.csrfToken;
  if (!expected) return false;
  const raw = req.headers["x-csrf-token"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (!provided || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isTrustedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin === allowedOrigin) return true;

  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.startsWith(allowedOrigin)) return true;

  return false;
}

function createRateLimiter(params: {
  windowMs: number;
  maxRequests: number;
}): { allow: (key: string) => boolean } {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    allow(key: string) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || now >= existing.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + params.windowMs });
        return true;
      }
      existing.count += 1;
      buckets.set(key, existing);
      return existing.count <= params.maxRequests;
    },
  };
}

function serializePersonaDoc(doc: PersonaDoc): Record<string, unknown> {
  return {
    id: serializeId(doc),
    name: String(doc.name || ""),
    enabled: doc.enabled !== false,
    avatar: typeof doc.avatar === "string" ? doc.avatar : null,
    avatarUrl: typeof doc.avatarUrl === "string" ? doc.avatarUrl : null,
    color: typeof doc.color === "number" ? doc.color : null,
    description: typeof doc.description === "string" ? doc.description : null,
    system_prompt: typeof doc.system_prompt === "string" ? doc.system_prompt : null,
    openers: Array.isArray(doc.openers) ? doc.openers.map((x) => String(x)) : [],
    likes: Array.isArray(doc.likes) ? doc.likes.map((x) => String(x)) : [],
    dislikes: Array.isArray(doc.dislikes) ? doc.dislikes.map((x) => String(x)) : [],
    traits: doc.traits && typeof doc.traits === "object" ? doc.traits : {},
    personality: typeof doc.personality === "string" ? doc.personality : null,
    speaking_style: typeof doc.speaking_style === "string" ? doc.speaking_style : null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : null,
  };
}

function parsePersonaInput(
  body: Record<string, unknown>
): { ok: true; data: PersonaFields } | { ok: false; error: string } {
  const name = String(body.name || "").trim();
  if (!name) return { ok: false, error: "name is required" };
  if (name.length > 64) return { ok: false, error: "name is too long" };

  const enabled = body.enabled !== false;

  const avatar = typeof body.avatar === "string" ? body.avatar.trim() : "";
  const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";

  const color = body.color === null || typeof body.color === "undefined"
    ? null
    : typeof body.color === "number"
      ? body.color
      : Number.parseInt(String(body.color), 10);

  if (typeof color === "number" && !Number.isFinite(color)) {
    return { ok: false, error: "color must be a number" };
  }

  const description = typeof body.description === "string" ? body.description : null;
  const system_prompt = typeof body.system_prompt === "string" ? body.system_prompt : null;
  const personality = typeof body.personality === "string" ? body.personality : null;
  const speaking_style = typeof body.speaking_style === "string" ? body.speaking_style : null;

  const openers = coerceStringArray(body.openers);
  const likes = coerceStringArray(body.likes);
  const dislikes = coerceStringArray(body.dislikes);

  const traits = coerceNumberMap(body.traits);

  return {
    ok: true,
    data: {
      name,
      enabled,
      ...(avatar ? { avatar } : { avatar: null }),
      ...(avatarUrl ? { avatarUrl } : { avatarUrl: null }),
      ...(typeof color === "number" ? { color } : { color: null }),
      ...(description ? { description } : { description: null }),
      ...(system_prompt ? { system_prompt } : { system_prompt: null }),
      openers,
      likes,
      dislikes,
      traits,
      ...(personality ? { personality } : { personality: null }),
      ...(speaking_style ? { speaking_style } : { speaking_style: null }),
    },
  };
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
