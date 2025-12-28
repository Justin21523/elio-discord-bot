/**
 * admin-app/discord.ts
 * Discord OAuth helpers.
 * All code/comments in English only.
 */

export type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type DiscordUser = {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  features?: string[];
};

const DISCORD_API_BASE = "https://discord.com/api";

export function buildDiscordAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  permissions?: string;
  guildId?: string;
  disableGuildSelect?: boolean;
}): string {
  const url = new URL(`${DISCORD_API_BASE}/oauth2/authorize`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  if (params.permissions) {
    url.searchParams.set("permissions", params.permissions);
  }
  if (params.guildId) {
    url.searchParams.set("guild_id", params.guildId);
    if (params.disableGuildSelect) {
      url.searchParams.set("disable_guild_select", "true");
    }
  }
  return url.toString();
}

export async function exchangeDiscordCode(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams();
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);

  const res = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as DiscordTokenResponse;
}

export async function refreshDiscordToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams();
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", params.refreshToken);

  const res = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord token refresh failed (${res.status}): ${text}`);
  }

  return (await res.json()) as DiscordTokenResponse;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord user fetch failed (${res.status}): ${text}`);
  }
  return (await res.json()) as DiscordUser;
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord guilds fetch failed (${res.status}): ${text}`);
  }
  return (await res.json()) as DiscordGuild[];
}

export function userCanManageGuild(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  const perms = BigInt(guild.permissions || "0");
  const ADMINISTRATOR = 0x8n;
  const MANAGE_GUILD = 0x20n;
  return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}
