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
export * as web from "./web.js";
export * as images from "./images.js";
export * as persona from "./persona.js";

// Legacy exports for backward compatibility
export { run as agentRun } from "./agent.js";
export { healthCheck } from "./client.js";

// Convenience re-exports
export { generate as generateText } from "./llm.js";
export { describe as describeImage } from "./vlm.js";
export { search as searchRAG } from "./rag.js";
export { embed as embedText } from "./embeddings.js";
export { generate as generateStory } from "./story.js";

// Extended AI facade helpers
export async function classifyRelevance(text, vlmCaption = null) {
  const combined = [text, vlmCaption].filter(Boolean).join(" ").toLowerCase();
  const keywords = ["elio", "communiverse", "olga", "glordon", "pixar", "alien", "space"];
  let score = 0;
  for (const kw of keywords) {
    if (combined.includes(kw)) score += 0.15;
  }
  if (text.includes("?")) score += 0.1;
  return Math.min(score, 1.0);
}

export async function personaCompose({ personaId, text, ragSnippets = [], vlmCaption = null }) {
  // This is a simplified version - real implementation would call LLM with persona style
  const prompt = `Persona ${personaId} responds to: ${text}`;
  if (ragSnippets.length > 0) {
    prompt += `\nContext: ${ragSnippets.slice(0, 2).join(" ")}`;
  }
  return { ok: true, data: { text: prompt } };
}

export async function summarizeNewsPersona(query, personaVoice) {
  // Simplified - would use llm.summarizeNews + rewrite in persona voice
  return { ok: true, data: { digest: `News about ${query} in ${personaVoice} voice` } };
}

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

// Default export for backward compatibility
import * as llmModule from "./llm.js";
import * as vlmModule from "./vlm.js";
import * as ragModule from "./rag.js";
import * as embeddingsModule from "./embeddings.js";
import * as storyModule from "./story.js";
import * as agentModule from "./agentService.js";
import * as finetuneModule from "./finetune.js";
import * as moderationModule from "./moderation.js";
import * as webModule from "./web.js";
import * as imagesModule from "./images.js";
import * as personaModule from "./persona.js";
import { healthCheck as healthCheckFn } from "./client.js";

export default {
  llm: llmModule,
  vlm: vlmModule,
  rag: ragModule,
  embeddings: embeddingsModule,
  story: storyModule,
  agent: agentModule,
  finetune: finetuneModule,
  moderation: moderationModule,
  web: webModule,
  images: imagesModule,
  persona: personaModule,
  healthCheck: healthCheckFn,
};
