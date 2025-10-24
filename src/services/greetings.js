// /src/services/greetings.js
// Greetings service: pick weighted greeting, compose embed, post via webhook persona.
// No getMongoState usage; uses withCollection from your mongo.js and metrics helpers you provided.

import { withCollection } from "../db/mongo.js";
import { incCounter } from "../util/metrics.js";

// Result helpers
function ok(data) { return { ok: true, data }; }
function err(code, message, cause, details) { return { ok: false, error: { code, message, cause, details } }; }

// ---------- Public API ----------

/** Upsert many greetings from docs (admin/seed). */
export async function upsertMany(docs) {
  try {
    if (!Array.isArray(docs) || !docs.length) return ok({ upserted: 0, modified: 0 });

    const res = await withCollection("greetings", async (col) => {
      const bulk = col.initializeUnorderedBulkOp();
      for (const g of docs) {
        bulk.find({ text: g.text }).upsert().updateOne({
          $set: {
            text: g.text,
            tags: Array.isArray(g.tags) ? g.tags : [],
            weight: Number.isFinite(g.weight) ? g.weight : 1,
            enabled: g.enabled !== false,
            personaHost: g.personaHost || null,
            style: {
              title: g?.style?.title ?? null,
              markdownAccent: g?.style?.markdownAccent ?? "**",
              useCodeFontForTags: !!g?.style?.useCodeFontForTags,
              showTagsField: g?.style?.showTagsField !== false,
            },
            imageUrl: g?.imageUrl || null,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() }
        });
      }
      const r = await bulk.execute();
      return { upserted: r.nUpserted || 0, modified: r.nModified || 0 };
    });

    return ok(res);
  } catch (cause) {
    return err("DB_ERROR", "Failed to upsert greetings", cause);
  }
}

/** List greetings for preview (admin). */
export async function list({ enabled, tags, personaHost, limit = 50 } = {}) {
  try {
    const items = await withCollection("greetings", async (col) => {
      const q = {};
      if (typeof enabled === "boolean") q.enabled = enabled;
      if (Array.isArray(tags) && tags.length) q.tags = { $all: tags };
      if (personaHost) q.personaHost = personaHost;
      return col.find(q).limit(Math.min(100, limit)).sort({ weight: -1 }).toArray();
    });
    return ok(items);
  } catch (cause) {
    return err("DB_ERROR", "Failed to list greetings", cause);
  }
}

/** Weighted random pick by personaHost/tags. */
export async function pickRandom({ personaHost, tags } = {}) {
  try {
    const docs = await withCollection("greetings", async (col) => {
      const q = { enabled: true };
      if (personaHost) q.personaHost = personaHost;
      if (Array.isArray(tags) && tags.length) q.tags = { $all: tags };
      return col.find(q).limit(500).toArray();
    });
    if (!docs.length) return ok(null);

    const bucket = [];
    for (const d of docs) {
      const w = Number.isFinite(d.weight) ? Math.max(1, d.weight) : 1;
      for (let i = 0; i < Math.min(w, 10); i++) bucket.push(d);
    }
    const chosen = bucket[Math.floor(Math.random() * bucket.length)];
    return ok(chosen || null);
  } catch (cause) {
    return err("DB_ERROR", "Failed to pick greeting", cause);
  }
}

/** Build an embed payload using greeting + persona visuals. */
export function composeEmbed({ greeting, persona, context }) {
  if (!greeting) return null;

  const color = Number.isFinite(persona?.color) ? persona.color : 0x5865F2;
  const avatarUrl = persona?.avatar || persona?.avatarUrl || undefined;
  const name = persona?.name || greeting.personaHost || "Elio";

  const accent = greeting?.style?.markdownAccent || "**";
  const text = String(greeting.text || "")
    .replaceAll("{user}", context?.userTag ?? "")
    .replaceAll("{guild}", context?.guildName ?? "")
    .replaceAll("{weekday}", context?.weekday ?? "");

  const description = `${accent}${text}${accent}`;

  const fields = [];
  if (greeting?.style?.showTagsField !== false && Array.isArray(greeting.tags) && greeting.tags.length) {
    const tagBody = greeting?.style?.useCodeFontForTags
      ? "`" + greeting.tags.join("` `") + "`"
      : greeting.tags.map(t => `#${t}`).join("  ");
    fields.push({ name: "Tags", value: tagBody, inline: false });
  }

  const embed = {
    color,
    author: { name, icon_url: avatarUrl },
    title: greeting?.style?.title || "Greeting",
    description,
    thumbnail: avatarUrl ? { url: avatarUrl } : undefined,
    image: greeting?.imageUrl ? { url: greeting.imageUrl } : undefined,
    fields,
    footer: { text: "Communiverse Bot" },
  };

  return { content: null, embeds: [embed], allowedMentions: { parse: [] } };
}

/** Post greeting via WebhooksService personaSay (preferred). */
export async function postGreeting({ channelId, personaName, tags, context }) {
  try {
    // minimal persona lookup: prefer using personas collection to get avatar/color
    const personaDoc = await withCollection("personas", c => c.findOne({ name: personaName || "Elio", enabled: { $ne: false } }));
    const persona = {
      name: personaDoc?.name || personaName || "Elio",
      avatar: personaDoc?.avatar || null,
      color: Number.isFinite(personaDoc?.color) ? personaDoc.color : 0x5865F2,
    };

    const picked = await pickRandom({ personaHost: persona.name, tags });
    if (!picked.ok) return picked;
    if (!picked.data) return err("NOT_FOUND", "No greeting available for the given filters");

    const payload = composeEmbed({
      greeting: picked.data,
      persona,
      context,
    });

    // Send via webhook service (fallback to plain send if your impl differs)
    const { personaSay } = await import("./webhooks.js");
    const sent = await personaSay(channelId, persona, payload.embeds?.[0]?.description || "");
    if (!sent.ok) return sent;

    incCounter("media_posts_total", { tool: "greet" });
    return ok({ messageId: sent.data?.messageId || null, greetingId: picked.data?._id?.toString?.() || null });
  } catch (cause) {
    return err("DISCORD_API_ERROR", "Failed to post greeting", cause);
  }
}

// Default export for backward compatibility
export default {
  upsertMany,
  list,
  pickRandom,
  composeEmbed,
  postGreeting,
};
