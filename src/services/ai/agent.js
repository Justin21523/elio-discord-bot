// src/services/ai/agent.js
// ============================================================================
// Agent Orchestrator - Multi-step agentic task execution
// Coordinates LLM, RAG, tools, and VLM to accomplish complex tasks
// ============================================================================

import { generateChat } from "./adapters/llmAdapter.js";
import { search as ragSearch } from "./rag.js";
import { search as webSearch } from "./tools/webSearch.js";
import {
  scan as moderationScan,
  rewrite as moderationRewrite,
} from "./tools/moderation.js";
import { compose as personaCompose } from "./tools/personaCompose.js";
import { describeImage, generateImageReaction } from "./adapters/vlmAdapter.js";
import { getDb } from "../../db/mongo.js";
import {
  AGENT_MAX_STEPS,
  AGENT_STEP_TIMEOUT_MS,
  ErrorCodes,
} from "../../config.js";
import { logger } from "../../util/logger.js";
import { incrementCounter, observeHistogram } from "../../util/metrics.js";

/**
 * @typedef {Object} AgentStep
 * @property {number} stepNumber - Step sequence number
 * @property {string} tool - Tool name used
 * @property {object} input - Tool input parameters
 * @property {object} output - Tool output
 * @property {number} latencyMs - Step execution time
 * @property {boolean} success - Whether step succeeded
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} AgentResult
 * @property {string} finalResponse - Final agent response
 * @property {AgentStep[]} steps - Execution trace
 * @property {number} totalTokens - Total tokens used
 * @property {number} totalLatencyMs - Total execution time
 */

/**
 * Run an agentic task with multi-step reasoning and tool use
 * @param {string} kind - Task kind (e.g., 'news_digest', 'persona_reply', 'image_react')
 * @param {object} params - Task-specific parameters
 * @returns {Promise<{ok: true, data: AgentResult} | {ok: false, error: object}>}
 */
export async function run(kind, params) {
  const startTime = Date.now();
  const steps = [];
  let totalTokens = 0;

  try {
    logger.info("[JOB] Agent task started", { kind, params });
    incrementCounter("agent_runs_total", { tool: kind });

    let result;

    switch (kind) {
      case "news_digest":
        result = await runNewsDigest(params, steps);
        break;
      case "persona_reply":
        result = await runPersonaReply(params, steps);
        break;
      case "image_react":
        result = await runImageReact(params, steps);
        break;
      case "rag_query":
        result = await runRAGQuery(params, steps);
        break;
      default:
        return {
          ok: false,
          error: {
            code: ErrorCodes.BAD_REQUEST,
            message: `Unknown agent task kind: ${kind}`,
          },
        };
    }

    // Calculate total tokens from steps
    totalTokens = steps.reduce((sum, step) => {
      return sum + (step.output?.tokensUsed || 0);
    }, 0);

    const totalLatencyMs = Date.now() - startTime;

    // Log execution to ai_logs collection
    await logAgentExecution({
      kind,
      params,
      steps,
      result: result.ok ? result.data : null,
      error: result.ok ? null : result.error,
      totalTokens,
      totalLatencyMs,
    });

    logger.info("[JOB] Agent task completed", {
      kind,
      success: result.ok,
      stepsExecuted: steps.length,
      totalTokens,
      totalLatencyMs,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        finalResponse: result.data,
        steps,
        totalTokens,
        totalLatencyMs,
      },
    };
  } catch (error) {
    logger.error("[JOB] Agent task error", {
      kind,
      error: error.message,
      stack: error.stack,
      stepsCompleted: steps.length,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.UNKNOWN,
        message: "Agent task failed",
        cause: error,
        details: { kind, stepsCompleted: steps.length },
      },
    };
  }
}

/**
 * Run news digest task: search → filter → summarize → moderate
 */
async function runNewsDigest(params, steps) {
  const { topic, guildId } = params;

  // Step 1: Web search for news
  const searchStep = await executeStep(
    "webSearch",
    { query: topic, guildId },
    webSearch,
    steps
  );
  if (!searchStep.success) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.DEPENDENCY_UNAVAILABLE,
        message: "Web search failed",
      },
    };
  }

  const searchResults = searchStep.output.data;

  // Step 2: Summarize results using LLM
  const summaryPrompt = `Summarize the following news search results about "${topic}":

${searchResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join("\n")}

Create a concise, engaging summary (3-5 sentences) highlighting the key points.`;

  const summaryStep = await executeStep(
    "llm_summarize",
    { prompt: summaryPrompt },
    async (p) => generateChat([{ role: "user", content: p.prompt }]),
    steps
  );
  if (!summaryStep.success) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Summary generation failed",
      },
    };
  }

  const summary = summaryStep.output.data.text;

  // Step 3: Moderate content
  const moderationStep = await executeStep(
    "moderation",
    { content: summary },
    moderationScan,
    steps
  );
  if (!moderationStep.success) {
    // Non-critical, continue with unmoderated content
    logger.warn("[JOB] Moderation failed, using unmoderated content");
  }

  let finalSummary = summary;
  if (moderationStep.success && moderationStep.output.data.flagged) {
    // Step 4: Rewrite if flagged
    const rewriteStep = await executeStep(
      "moderation_rewrite",
      {
        content: summary,
        flaggedCategories: moderationStep.output.data.categories,
      },
      moderationRewrite,
      steps
    );
    if (rewriteStep.success) {
      finalSummary = rewriteStep.output.data.rewrittenContent;
    }
  }

  return {
    ok: true,
    data: {
      finalResponse: finalSummary,
      answer: finalSummary,
    },
  };
}

/**
 * Run persona reply task: RAG context → compose response → moderate
 */
async function runPersonaReply(params, steps) {
  const { persona, personaTraits, userMessage, guildId } = params;

  // Step 1: RAG search for relevant context
  const ragStep = await executeStep(
    "rag_search",
    { query: userMessage, guildId },
    ragSearch,
    steps
  );

  let context = "";
  if (ragStep.success && ragStep.output.data.length > 0) {
    context = ragStep.output.data
      .map((doc) => doc.content)
      .join("\n\n")
      .substring(0, 2000); // Limit context length
  }

  // Step 2: Compose persona response
  const composeStep = await executeStep(
    "persona_compose",
    {
      persona,
      personaTraits,
      context: context || "No additional context available.",
      userMessage,
    },
    personaCompose,
    steps
  );
  if (!composeStep.success) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Persona composition failed",
      },
    };
  }

  const response = composeStep.output.data.response;

  // Step 3: Moderate response
  const moderationStep = await executeStep(
    "moderation",
    { content: response },
    moderationScan,
    steps
  );

  let finalResponse = response;
  if (moderationStep.success && moderationStep.output.data.flagged) {
    const rewriteStep = await executeStep(
      "moderation_rewrite",
      {
        content: response,
        flaggedCategories: moderationStep.output.data.categories,
      },
      moderationRewrite,
      steps
    );
    if (rewriteStep.success) {
      finalResponse = rewriteStep.output.data.rewrittenContent;
    }
  }

  return {
    ok: true,
    data: {
      finalResponse: finalResponse,
      answer: finalResponse,
    },
  };
}

/**
 * Run image reaction task: VLM describe → compose reaction → moderate
 */
async function runImageReact(params, steps) {
  const { imageUrl, persona, personaTraits } = params;

  // Step 1: Generate image reaction using VLM
  const reactionStep = await executeStep(
    "vlm_react",
    { imageUrl, persona },
    generateImageReaction,
    steps
  );
  if (!reactionStep.success) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Image reaction generation failed",
      },
    };
  }

  const reaction = reactionStep.output.data.reaction;

  // Step 2: Moderate reaction
  const moderationStep = await executeStep(
    "moderation",
    { content: reaction },
    moderationScan,
    steps
  );

  let finalReaction = reaction;
  if (moderationStep.success && moderationStep.output.data.flagged) {
    const rewriteStep = await executeStep(
      "moderation_rewrite",
      {
        content: reaction,
        flaggedCategories: moderationStep.output.data.categories,
      },
      moderationRewrite,
      steps
    );
    if (rewriteStep.success) {
      finalReaction = rewriteStep.output.data.rewrittenContent;
    }
  }

  return {
    ok: true,
    data: {
      finalResponse: finalReaction,
      answer: finalReaction,
    },
  };
}

/**
 * Run RAG query task: search → synthesize answer
 */
async function runRAGQuery(params, steps) {
  const { query, guildId } = params;

  // Step 1: RAG search
  const ragStep = await executeStep(
    "rag_search",
    { query, guildId },
    ragSearch,
    steps
  );
  if (!ragStep.success) {
    return ragStep;
  }

  const docs = ragStep.output.data.hits || [];

  // If no documents found, return a message
  if (docs.length === 0) {
    return {
      ok: true,
      data: {
        finalResponse: "I couldn't find any relevant information to answer your question.",
        answer: "I couldn't find any relevant information to answer your question.",
      },
    };
  }

  // Step 2: Synthesize answer using LLM
  const context = docs
    .map((doc, i) => `[${i + 1}] ${doc.content}`)
    .join("\n\n");
  const synthesisPrompt = `Based on the following documents, answer the question: "${query}"

Documents:
${context}

Provide a clear, concise answer (2-4 sentences) synthesizing the information above.`;

  const synthesisStep = await executeStep(
    "llm_synthesize",
    { prompt: synthesisPrompt },
    async (p) => generateChat([{ role: "user", content: p.prompt }]),
    steps
  );
  if (!synthesisStep.success) {
    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Answer synthesis failed",
      },
    };
  }

  const answerText = synthesisStep.output.data.text || "I generated an answer but couldn't retrieve the text.";

  return {
    ok: true,
    data: {
      finalResponse: answerText,
      answer: answerText,
    },
  };
}

/**
 * Execute a single agent step with timing and error handling
 */
async function executeStep(toolName, input, toolFunction, steps) {
  const stepNumber = steps.length + 1;
  const stepStart = Date.now();

  try {
    logger.info("[JOB] Agent step started", { stepNumber, tool: toolName });

    const result = await toolFunction(input);
    const latencyMs = Date.now() - stepStart;

    observeHistogram("agent_step_seconds", latencyMs / 1000, {
      tool: toolName,
    });

    const step = {
      stepNumber,
      tool: toolName,
      input,
      output: result,
      latencyMs,
      success: result.ok,
      error: result.ok ? undefined : result.error?.message,
    };

    steps.push(step);

    logger.info("[JOB] Agent step completed", {
      stepNumber,
      tool: toolName,
      success: result.ok,
      latencyMs,
    });

    return step;
  } catch (error) {
    const latencyMs = Date.now() - stepStart;

    logger.error("[JOB] Agent step error", {
      stepNumber,
      tool: toolName,
      error: error.message,
      latencyMs,
    });

    const step = {
      stepNumber,
      tool: toolName,
      input,
      output: null,
      latencyMs,
      success: false,
      error: error.message,
    };

    steps.push(step);
    return step;
  }
}

/**
 * Log agent execution to database
 */
async function logAgentExecution(data) {
  try {
    const db = getDb();
    const collection = db.collection("ai_logs");

    await collection.insertOne({
      kind: data.kind,
      params: data.params,
      steps: data.steps,
      result: data.result,
      error: data.error,
      total_tokens: data.totalTokens,
      total_latency_ms: data.totalLatencyMs,
      created_at: new Date(),
    });
  } catch (error) {
    logger.error("[JOB] Failed to log agent execution", {
      error: error.message,
    });
    // Non-critical, don't fail the task
  }
}
