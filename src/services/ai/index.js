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
