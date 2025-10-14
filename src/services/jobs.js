// Job handlers (called by scheduler via setJobRunner)
// English-only. Uses aiService + webhooks to post results.

import aiService from './ai/index.js';
import * as webhooks from './webhooks.js';
import { logError } from '../util/logger.js';

export async function run(kind, ctx) {
  try {
    if (kind === 'heartbeat') {
      await post(ctx.channelId, 'Heartbeat', '🛰️ Beep boop — all systems nominal.');
      return;
    }

    if (kind === 'cosmic_digest') {
      const query = ctx.meta?.query || 'Pixar Elio news';
      const res = await aiService.summarizeNews(query, 6);
      if (!res.ok) throw new Error(`summarizeNews failed: ${res.error?.message}`);
      const bullets = String(res.data.summary || '').slice(0, 1800);
      const sources = (res.data.sources || []).map((s, i) => `**[${i + 1}]** ${s.title}`).join('\n');
      await post(ctx.channelId, 'Cosmic Digest', `${bullets}\n\n${sources}`);
      return;
    }

    if (kind === 'rag_digest') {
      const namespace = ctx.meta?.namespace || 'discord';
      const search = await aiService.rag.search('latest updates', 'hybrid', 8, 0.7, namespace);
      if (!search.ok) throw new Error(`rag.search failed`);
      const ctxText = (search.data.results || []).map(x => x.content).join('\n\n').slice(0, 3000);
      const prompt = `Summarize the following community updates into 6 concise bullets for a daily digest:\n\n${ctxText}\n\n-`;
      const gen = await aiService.llm.generate(prompt, { max_length: 360, temperature: 0.4 });
      if (!gen.ok) throw new Error(`llm.generate failed`);
      await post(ctx.channelId, 'Community RAG Digest', gen.data.text || gen.data);
      return;
    }

    // fallback
    await post(ctx.channelId, 'Unknown job', `Job kind **${kind}** ran with meta: \`${JSON.stringify(ctx.meta || {})}\``);
  } catch (e) {
    logError('[JOB]', { kind, error: String(e) });
    await post(ctx.channelId, 'Job error', `❌ ${String(e)}`);
  }
}

async function post(channelId, personaName, content) {
  await webhooks.personaSay(channelId, { name: personaName, color: 0x00bcd4 }, content);
}
