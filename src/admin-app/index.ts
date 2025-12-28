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
  listSchedules,
  upsertAdminSession,
  upsertSchedule,
  disableSchedule,
  serializeId,
  type AdminSession,
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

const { client: mongoClient, db } = await connectAdminDb({
  mongoUri: config.mongoUri,
  dbName: config.dbName,
});

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
  const url = new URL(req.url || "/", `http://${config.host}:${config.port}`);
  const pathname = url.pathname;

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
        createdAt: now,
        updatedAt: now,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      };

      await upsertAdminSession(db, session);

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

    // session routes
    if (req.method === "GET" && pathname === "/api/me") {
      sendJson(res, 200, {
        ok: true,
        data: {
          user: session.user,
          guilds: session.guilds.filter(userCanManageGuild),
        },
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      await deleteAdminSession(db, session._id);
      clearCookie(res, { name: config.cookieName, secure: config.cookieSecure });
      sendJson(res, 200, { ok: true });
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
      if (!canManageGuild(session.guilds, guildId)) {
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }

      if (req.method === "GET") {
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
          sendJson(res, 400, { ok: false, error: "kind, channelId, hhmm are required" });
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(hhmm)) {
          sendJson(res, 400, { ok: false, error: "Invalid hhmm (expected HH:MM)" });
          return;
        }

        await upsertSchedule(db, { guildId, kind, channelId, hhmm, enabled });
        await triggerBotSchedulerReload(guildId);

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
        sendJson(res, 403, { ok: false, error: "Forbidden" });
        return;
      }
      await disableSchedule(db, guildId, kind);
      await triggerBotSchedulerReload(guildId);
      sendJson(res, 200, { ok: true });
      return;
    }

    // Bot runtime bridge (optional)
    if (req.method === "GET" && pathname === "/api/bot/health") {
      const out = await fetchBotAdminJson("/health");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/metrics") {
      const out = await fetchBotAdminJson("/api/metrics");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/scheduler/jobs") {
      const out = await fetchBotAdminJson("/api/scheduler/jobs");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/discord/guilds") {
      const out = await fetchBotAdminJson("/api/discord/guilds");
      sendJson(res, 200, out);
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/discord/channels") {
      const guildId = url.searchParams.get("guildId") || "";
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

  const session = await getAdminSession(db, sessionId);
  if (!session) {
    clearCookie(res, { name: config.cookieName, secure: config.cookieSecure });
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return null;
  }

  // Expire session by TTL (not just Discord token)
  const ttlMs = config.sessionTtlHours * 3600 * 1000;
  if (Date.now() - new Date(session.updatedAt).getTime() > ttlMs) {
    await deleteAdminSession(db, sessionId);
    clearCookie(res, { name: config.cookieName, secure: config.cookieSecure });
    sendJson(res, 401, { ok: false, error: "Session expired" });
    return null;
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
