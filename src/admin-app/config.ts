/**
 * admin-app/config.ts
 * Admin Web (separate service) configuration.
 * All code/comments in English only.
 */

import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`Invalid integer env ${key}: ${raw}`);
  return value;
}

export type AdminAppConfig = {
  host: string;
  port: number;
  webOrigin: string;

  mongoUri: string;
  dbName: string;

  cookieName: string;
  cookieSecure: boolean;
  sessionTtlHours: number;

  discord: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    permissions: string;
  } | null;

  botAdmin?: {
    url: string;
    token?: string;
  };
};

export function loadAdminAppConfig(): AdminAppConfig {
  const host = process.env.ADMIN_WEB_HOST || "127.0.0.1";
  const port = optionalInt("ADMIN_WEB_PORT", 3030);
  const webOrigin = process.env.ADMIN_WEB_ORIGIN || `http://${host}:${port}`;

  const mongoUri = requireEnv("MONGODB_URI");
  const dbName = process.env.DB_NAME || "communiverse_bot";

  const cookieName = process.env.ADMIN_WEB_COOKIE_NAME || "admin_session";
  const cookieSecure =
    process.env.ADMIN_WEB_COOKIE_SECURE === "true" || webOrigin.startsWith("https://");
  const sessionTtlHours = optionalInt("ADMIN_WEB_SESSION_TTL_HOURS", 12);

  const clientId = (process.env.DISCORD_OAUTH_CLIENT_ID || process.env.APP_ID || "").trim();
  const clientSecret = (process.env.DISCORD_OAUTH_CLIENT_SECRET || "").trim();
  const redirectUri = (process.env.DISCORD_OAUTH_REDIRECT_URI || "").trim();
  const oauthConfigured = Boolean(clientId && clientSecret && redirectUri);
  const oauthPartiallyConfigured = Boolean(clientSecret || redirectUri);

  if (oauthPartiallyConfigured && !clientId) {
    throw new Error("Missing DISCORD_OAUTH_CLIENT_ID (or APP_ID)");
  }

  const discord = oauthConfigured
    ? {
        clientId,
        clientSecret,
        redirectUri,
        scopes: (process.env.DISCORD_OAUTH_SCOPES || "identify guilds")
          .split(/\s+/)
          .filter(Boolean),
        permissions: (process.env.DISCORD_OAUTH_PERMISSIONS || "8").trim(),
      }
    : null;

  const botAdminUrl = process.env.BOT_ADMIN_URL;
  const botAdminToken = process.env.BOT_ADMIN_TOKEN;

  return {
    host,
    port,
    webOrigin,
    mongoUri,
    dbName,
    cookieName,
    cookieSecure,
    sessionTtlHours,
    discord,
    ...(botAdminUrl
      ? {
          botAdmin: {
            url: botAdminUrl.replace(/\/+$/, ""),
            ...(botAdminToken ? { token: botAdminToken } : {}),
          },
        }
      : {}),
  };
}
