// /src/services/ai/agent.js
// English-only code & comments.
//
// Simple goal-oriented agent executor.
// We keep the orchestration minimal: a few tools, step logging,
// and a final synthesis with LLM. All I/O via the sidecar when possible.

import * as LLM from './llm.js';
import * as RAG from './rag.js';
import * as IMG from './images.js';
import * as WEB from './web.js';
import { CONFIG } from '../../config.js';
import { logger } from '../../util/logger.js';

/**
 * @typedef {import('../types').AppError} AppError
 * @typedef {{ ok: true, data: any } | { ok: false, error: AppError }} Result
 */

/**
 * Run an agent task.
 * @param {'research'|'qa'|'caption'|'freeform'} kind
 * @param {object} params
 * @returns {Promise<Result>}
 */
export async function run(kind, params) {
  const started = Date.now();
  const steps = [];
  const meta = { kind, guildId: params.guildId, channelId: params.channelId, userId: params.userId };

  function logStep(name, payload, output, error) {
    const t = Date.now() - started;
    const entry = { t_ms: t, name, payload, output, error };
    steps.push(entry);
    logger.info({ ...meta, step: name, t_ms: t }, '[JOB] agent step');
  }

  try {
    if (kind === 'research') {
      // 1) web search
      const q = params.query?.trim();
      if (!q) return { ok: false, error: { code: 'BAD_REQUEST', message: 'query is required' } };
      const s = await WEB.search(q, { top: 8 });
      if (!s.ok) { logStep('web.search', { q }, null, s.error); return s; }
      logStep('web.search', { q }, s.data);

      // 2) optional fetch the top-1 url full text
      const topUrl = s.data.results?.[0]?.url;
      if (topUrl) {
        const fx = await WEB.fetchUrl(topUrl);
        logStep('web.fetch', { url: topUrl }, fx.ok ? { size: fx.data?.content?.length || 0 } : fx.error, !fx.ok ? fx.error : undefined);
      }

      // 3) synthesize answer
      const summaryPrompt = `Summarize and synthesize the findings for the query:\n"${q}"\nUse bullet points with citations [n].`;
      const g = await LLM.generate(summaryPrompt, { max_new_tokens: 300, temperature: 0.4 });
      if (!g.ok) { logStep('llm.generate', { summaryPrompt }, null, g.error); return g; }
      logStep('llm.generate', { summaryPrompt }, g.data);

      return { ok: true, data: { steps, result: g.data } };
    }

    if (kind === 'qa') {
      // RAG question answering
      const question = params.question?.trim();
      if (!question) return { ok: false, error: { code: 'BAD_REQUEST', message: 'question is required' } };
      const ans = await RAG.answer(question, { top_k: CONFIG.rag.topK, mode: 'advanced' });
      logStep('rag.answer', { question }, ans.ok ? ans.data : ans.error, !ans.ok ? ans.error : undefined);
      return ans.ok ? { ok: true, data: { steps, result: ans.data } } : ans;
    }

    if (kind === 'caption') {
      // Image → caption
      const { image_b64, url } = params;
      let res;
      if (image_b64) res = await IMG.captionB64(image_b64, 80);
      else if (url) res = await IMG.captionUrl(url, 80);
      else return { ok: false, error: { code: 'BAD_REQUEST', message: 'image_b64 or url required' } };
      logStep('vlm.caption', { has_b64: !!image_b64, url }, res.ok ? res.data : res.error, !res.ok ? res.error : undefined);
      return res.ok ? { ok: true, data: { steps, result: res.data } } : res;
    }

    // freeform → just call LLM chat/generate
    const prompt = (params.prompt || '').trim();
    const chat = await LLM.generate(prompt, { max_new_tokens: 300, temperature: 0.6 });
    logStep('llm.generate', { prompt }, chat.ok ? chat.data : chat.error, !chat.ok ? chat.error : undefined);
    return chat.ok ? { ok: true, data: { steps, result: chat.data } } : chat;

  } catch (err) {
    logStep('exception', {}, null, err);
    return { ok: false, error: { code: 'UNKNOWN', message: 'Agent crashed', cause: err } };
  } finally {
    const dt = Date.now() - started;
    logger.info({ ...meta, ms: dt, steps: steps.length }, '[JOB] agent run finished');
  }
}
