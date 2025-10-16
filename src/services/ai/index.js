<<<<<<< HEAD
// src/services/ai/index.js
// ============================================================================
// AI Services - Unified export for all AI service integrations
// ============================================================================

// Core services
export * as llm from "./llm.js";
export * as vlm from "./vlm.js";
export * as rag from "./rag.js";
export * as embeddings from "./embeddings.js";
export * as story from "./story.js";
export * as agent from "./agentService.js";
export * as finetune from "./finetune.js";
export * as moderation from "./moderation.js";

// Legacy exports for backward compatibility
export { run as agentRun } from "./agent.js";
export { healthCheck } from "./client.js";

// Convenience re-exports
export { generate as generateText } from "./llm.js";
export { describe as describeImage } from "./vlm.js";
export { search as searchRAG } from "./rag.js";
export { embed as embedText } from "./embeddings.js";
export { generate as generateStory } from "./story.js";

/**
 * Usage examples:
 *
 * // LLM
 * import { llm } from './services/ai/index.js';
 * const result = await llm.generate({ prompt: "Hello" });
 *
 * // VLM
 * import { vlm } from './services/ai/index.js';
 * const result = await vlm.describe({ imageUrl: "https://..." });
 *
 * // RAG
 * import { rag } from './services/ai/index.js';
 * const result = await rag.search({ query: "What is..." });
 *
 * // Agent
 * import { agent } from './services/ai/index.js';
 * const result = await agent.reasoning({ problem: "How to..." });
 *
 * // Story
 * import { story } from './services/ai/index.js';
 * const result = await story.generate({ prompt: "Once upon a time..." });
 *
 * // Finetuning
 * import { finetune } from './services/ai/index.js';
 * const result = await finetune.startTraining({ jobName: "my-model", ... });
 */
=======
// Unified AI Facade for the bot.
// English-only code/comments.

import { httpPostJson } from './_client.js';
import * as LLM from './llm.js';
import * as RAG from './rag.js';
import * as RAGADMIN from './rag_admin.js';
import * as DATASET from './dataset.js';
import * as IMAGES from './images.js';
import * as WEB from './web.js';
import * as MOD from './moderation.js';
import * as PERSONA from './persona.js';
import { incCounter, observeHistogram } from '../../util/metrics.js';

export const llm = LLM;
export const rag = RAG;
export const ragAdmin = RAGADMIN;
export const dataset = DATASET;
export const images = IMAGES;
export const web = WEB;
export const moderation = MOD;
export const persona = PERSONA;

/**
 * summarizeNews:
 * - web.search(query) -> take top N
 * - LLM.generate() summarize with bullet points and cite indices [1]..[N]
 */
export async function summarizeNews(query, maxResults = 6) {
  const t0 = Date.now();
  const sr = await WEB.search(query, maxResults);
  if (!sr.ok) return sr;

  const items = (sr.data.results || []).slice(0, maxResults);
  const bullets = items
    .map((x, i) => `[${i + 1}] ${x.title} - ${x.url}`)
    .join('\n');

  const prompt = `You are a concise news summarizer.
Summarize the following sources in 5-8 bullets, with source indices like [1], [2].
Be neutral, avoid speculation.

Sources:
${bullets}

Summary:`;

  const gen = await LLM.generate(prompt, { max_length: 400, temperature: 0.3, top_p: 0.9 });
  observeHistogram('agent_step_seconds', (Date.now() - t0) / 1000, { tool: 'summarizeNews' });
  incCounter('agent_runs_total', { tool: 'summarizeNews' });

  if (!gen.ok) return gen;
  return { ok: true, data: { summary: gen.data.text ?? gen.data, sources: items } };
}

/**
 * personaReply:
 * - moderation.scan() pre-check
 * - persona.compose() to rewrite in style
 */
export async function personaReply(text, persona = { name: 'Elio', style: 'playful, supportive' }, maxLen = 180) {
  const mod = await MOD.scan(text);
  if (!mod.ok) return mod;
  if (mod.data.blocked) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Content flagged by moderation.' } };
  }
  const res = await PERSONA.compose(text, persona, maxLen);
  return res;
}

/**
 * imageReact:
 * - If question provided -> VQA(url)
 * - Else -> caption(url)
 */
export async function imageReact(url, question = null, maxLen = 120) {
  if (question && question.trim()) {
    return IMAGES.vqaUrl(url, question.trim(), Math.min(Math.max(32, maxLen), 512));
  }
  return IMAGES.captionUrl(url, Math.min(Math.max(16, maxLen), 512));
}

/**
 * agentTask:
 * - Proxy to /agent/run to keep step traces on sidecar
 */
export async function agentTask(kind, params = {}) {
  const t0 = Date.now();
  const res = await httpPostJson('/agent/run', { kind, params });
  observeHistogram('agent_step_seconds', (Date.now() - t0) / 1000, { tool: kind || 'unknown' });
  incCounter('agent_runs_total', { tool: kind || 'unknown' });
  if (res.status >= 400 || !res.json?.ok) {
    return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'Agent task failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}

const defaultExport = {
  llm, rag, ragAdmin, dataset, images, web, moderation, persona,
  summarizeNews, personaReply, imageReact, agentTask,
};
export default defaultExport;
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
