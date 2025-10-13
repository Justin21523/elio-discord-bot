// src/services/webhooks.js
// Ensures a per-channel webhook and sends messages with dynamic username/avatar.
// Robust: no token required; graceful fallback to channel.send().

const cache = new Map(); // channelId -> { id, token }

/** Ensure a webhook exists for this channel (named "Communiverse Persona"). */
export async function ensureWebhook(channel) {
  const key = channel.id;
  if (cache.has(key)) return cache.get(key);

  try {
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find((h) => h.name === "Communiverse Persona" && h.token); // prefer one with token
    if (!hook) {
      // try any existing hook with our name (no token is fine)
      hook = hooks.find((h) => h.name === "Communiverse Persona") || null;
    }
    if (!hook) {
      // need Manage Webhooks permission
      hook = await channel.createWebhook({ name: "Communiverse Persona" });
    }
    const info = { id: hook.id, token: hook.token || null };
    cache.set(key, info);
    return info;
  } catch (e) {
    // No permission or other error
    return null;
  }
}

export async function personaSay(channel, { name, avatar, content, embeds }) {
  try {
    const info = await ensureWebhook(channel);
    if (info) {
      // If token is present, we can use webhook token route; otherwise use bot auth by id only.
      const wh = info.token
        ? await channel.client.fetchWebhook(info.id, info.token)
        : await channel.client.fetchWebhook(info.id);

      return await wh.send({
        username: name,
        avatarURL: avatar || undefined,
        content: content || undefined,
        embeds,
      });
    }
    // Fallback when webhook is unavailable (no permission)
    return await channel.send({ content: content || undefined, embeds });
  } catch (e) {
    // Final fallback
    try {
      return await channel.send({ content: content || undefined, embeds });
    } catch {
      throw e;
    }
  }
}
