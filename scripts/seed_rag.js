/**
 * Seed RAG from Discord channels/threads.
 * English-only code/comments.
 *
 * Environment vars:
 *  DISCORD_TOKEN=...
 *  SEED_GUILD_ID=123...
 *  SEED_CHANNEL_IDS=111,222,333            # comma-separated channel or thread IDs
 *  AI_API_BASE_URL=http://ai:8000
 *  SEED_NAMESPACE=pixar                     # optional
 *  SEED_TAGS=discord,seed,cn                # optional, comma-separated
 *  SEED_MAX_PER_CHANNEL=500                 # optional, default 500 messages
 *  SEED_INCLUDE_BOTS=false                  # optional, include bot messages
 *  SEED_BATCH_CHARS=4000                    # optional, batch text per upsert
 *
 * Run in container (compose service `seed`) or manually:
 *  node scripts/seed_rag.js
 */

import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const {
  DISCORD_TOKEN,
  SEED_GUILD_ID,
  SEED_CHANNEL_IDS,
  AI_API_BASE_URL = 'http://localhost:8000',
  SEED_NAMESPACE,
  SEED_TAGS,
  SEED_MAX_PER_CHANNEL = '500',
  SEED_INCLUDE_BOTS = 'false',
  SEED_BATCH_CHARS = '4000',
} = process.env;

const MAX_PER_CHANNEL = Number(SEED_MAX_PER_CHANNEL);
const INCLUDE_BOTS = String(SEED_INCLUDE_BOTS).toLowerCase() === 'true';
const BATCH_CHARS = Number(SEED_BATCH_CHARS);

if (!DISCORD_TOKEN) {
  console.error('[SEED] DISCORD_TOKEN missing');
  process.exit(2);
}
if (!SEED_GUILD_ID) {
  console.error('[SEED] SEED_GUILD_ID missing');
  process.exit(2);
}
if (!SEED_CHANNEL_IDS) {
  console.error('[SEED] SEED_CHANNEL_IDS missing');
  process.exit(2);
}

const TAGS = (SEED_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function fetchChannelMessages(channelId, limit) {
  const collected = [];
  let before = undefined;
  while (collected.length < limit) {
    const page = await rest.get(Routes.channelMessages(channelId), {
      query: new URLSearchParams({
        limit: '100',
        ...(before ? { before } : {}),
      }),
    }).catch(err => {
      console.error('[SEED] fetch messages error', channelId, String(err));
      return [];
    });

    if (!Array.isArray(page) || page.length === 0) break;

    for (const m of page) {
      if (!INCLUDE_BOTS && m.author?.bot) continue;
      collected.push(m);
      if (collected.length >= limit) break;
    }
    before = page[page.length - 1].id;
    await delay(400); // be nice to rate limits
  }
  return collected;
}

function formatMessage(m) {
  const ts = new Date(m.timestamp || m.edited_timestamp || Date.now()).toISOString();
  const attachments = (m.attachments || []).map(a => a.filename).join(', ');
  const author = `${m.author?.username}#${m.author?.discriminator}`;
  const header = `# [${ts}] ${author} (${m.id})`;
  const body = (m.content || '').trim();
  const lines = [header];
  if (body) lines.push(body);
  if (attachments) lines.push(`(attachments: ${attachments})`);
  return lines.join('\n');
}

function chunkText(big, maxChars) {
  const out = [];
  let buf = '';
  for (const block of big.split('\n\n')) {
    if ((buf + '\n\n' + block).length > maxChars) {
      if (buf) out.push(buf);
      buf = block;
    } else {
      buf = buf ? buf + '\n\n' + block : block;
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function upsertBatch(text, channelId) {
  const payload = {
    text,
    metadata: { source: 'discord', guildId: SEED_GUILD_ID, channelId },
    namespace: SEED_NAMESPACE || undefined,
    tags: TAGS.length ? TAGS : undefined,
  };
  const res = await fetch(`${AI_API_BASE_URL.replace(/\/+$/,'')}/rag/upsert_text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));

  if (!res?.ok) {
    console.error('[SEED] upsert failed', res);
    return false;
  }
  console.log(`[SEED] upsert ok doc=${res.doc_id} chunks=${res.chunks}`);
  return true;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('[SEED] start',
    { guild: SEED_GUILD_ID, channels: SEED_CHANNEL_IDS, max: MAX_PER_CHANNEL, includeBots: INCLUDE_BOTS, batchChars: BATCH_CHARS });

  const channelIds = SEED_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean);
  let totalMsgs = 0;
  for (const cid of channelIds) {
    console.log(`[SEED] fetching channel ${cid}`);
    const msgs = await fetchChannelMessages(cid, MAX_PER_CHANNEL);
    console.log(`[SEED] channel ${cid} messages fetched: ${msgs.length}`);

    const blobs = msgs
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(formatMessage)
      .join('\n\n');

    const batches = chunkText(blobs, BATCH_CHARS);
    for (const b of batches) {
      await upsertBatch(b, cid);
      await delay(200);
    }
    totalMsgs += msgs.length;
    await delay(1000);
  }

  console.log('[SEED] done total messages:', totalMsgs);
}

run().then(() => process.exit(0)).catch(e => {
  console.error('[SEED] fatal', e);
  process.exit(1);
});
