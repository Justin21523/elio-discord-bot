// src/services/ai/agentService.js
// ============================================================================
// Agent Service - Multi-step agentic tasks with reasoning, planning, and orchestration
// This is a NEW comprehensive wrapper for Python AI service /agent/* endpoints
// ============================================================================

import { post } from "./client.js";
import { logger } from "../../util/logger.js";
import { ErrorCodes, AGENT_MAX_STEPS } from "../../config.js";

/**
 * Perform structured reasoning on a problem
 * @param {object} params
 * @param {string} params.problem - Problem to reason about
 * @param {string} [params.context] - Additional context
 * @param {string} [params.reasoningType] - Type: 'chain-of-thought', 'tree-of-thought', 'step-by-step'
 * @param {number} [params.maxSteps] - Maximum reasoning steps (1-20)
 * @returns {Promise<{ok: true, data: {problem: string, reasoningType: string, steps: Array, conclusion: string, fullReasoning: string, tokensUsed: number}} | {ok: false, error: object}>}
 */
export async function reasoning(params) {
  const {
    problem,
    context,
    reasoningType = "chain-of-thought",
    maxSteps = 5,
  } = params;

  try {
    if (!problem) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "problem is required",
        },
      };
    }

    logger.info("[AGENT] Reasoning request", {
      problemLength: problem.length,
      type: reasoningType,
      maxSteps,
    });

    const result = await post("/agent/reasoning", {
      problem,
      context,
      reasoning_type: reasoningType,
      max_steps: maxSteps,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        problem: result.data.problem,
        reasoningType: result.data.reasoning_type,
        steps: result.data.steps,
        conclusion: result.data.conclusion,
        fullReasoning: result.data.full_reasoning,
        tokensUsed: result.data.tokens?.total || 0,
        usage: result.data.tokens,
      },
    };
  } catch (error) {
    logger.error("[AGENT] Reasoning error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Reasoning task failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Generate a task plan to achieve a goal
 * @param {object} params
 * @param {string} params.goal - High-level goal to plan for
 * @param {Array<string>} [params.constraints] - Constraints or requirements
 * @param {Array<string>} [params.availableTools] - Available tools
 * @param {number} [params.maxTasks] - Maximum number of tasks (1-50)
 * @returns {Promise<{ok: true, data: {goal: string, tasks: Array, totalTasks: number, estimatedTotalDuration: number}} | {ok: false, error: object}>}
 */
export async function taskPlanning(params) {
  const {
    goal,
    constraints,
    availableTools,
    maxTasks = 10,
  } = params;

  try {
    if (!goal) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "goal is required",
        },
      };
    }

    logger.info("[AGENT] Task planning request", {
      goalLength: goal.length,
      maxTasks,
    });

    const result = await post("/agent/task-planning", {
      goal,
      constraints,
      available_tools: availableTools,
      max_tasks: maxTasks,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        goal: result.data.goal,
        tasks: result.data.tasks,
        totalTasks: result.data.total_tasks,
        estimatedTotalDuration: result.data.estimated_total_duration,
      },
    };
  } catch (error) {
    logger.error("[AGENT] Task planning error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Task planning failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Execute multiple tasks (sequential or parallel)
 * @param {object} params
 * @param {Array<object>} params.tasks - List of tasks to execute
 * @param {string} [params.executionMode] - 'sequential' or 'parallel'
 * @param {number} [params.timeoutPerTask] - Timeout per task in seconds (5-300)
 * @returns {Promise<{ok: true, data: {executionMode: string, totalTasks: number, successful: number, failed: number, results: Array, totalDurationMs: number}} | {ok: false, error: object}>}
 */
export async function multiTask(params) {
  const {
    tasks,
    executionMode = "sequential",
    timeoutPerTask = 30,
  } = params;

  try {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "tasks must be a non-empty array",
        },
      };
    }

    logger.info("[AGENT] Multi-task request", {
      taskCount: tasks.length,
      mode: executionMode,
    });

    const result = await post("/agent/multi-task", {
      tasks,
      execution_mode: executionMode,
      timeout_per_task: timeoutPerTask,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        executionMode: result.data.execution_mode,
        totalTasks: result.data.total_tasks,
        successful: result.data.successful,
        failed: result.data.failed,
        results: result.data.results,
        totalDurationMs: result.data.total_duration_ms,
      },
    };
  } catch (error) {
    logger.error("[AGENT] Multi-task error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Multi-task execution failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Perform web search using Brave API and optionally summarize results
 * @param {object} params
 * @param {string} params.query - Search query
 * @param {number} [params.numResults] - Number of results (1-20)
 * @param {number} [params.recencyDays] - Filter by recency in days
 * @param {Array<string>} [params.domains] - Limit to specific domains
 * @param {boolean} [params.summarize] - Whether to summarize results
 * @returns {Promise<{ok: true, data: {query: string, results: Array, totalResults: number, summary: string, hasSummary: boolean}} | {ok: false, error: object}>}
 */
export async function webSearch(params) {
  const {
    query,
    numResults = 5,
    recencyDays,
    domains,
    summarize = true,
  } = params;

  try {
    if (!query) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "query is required",
        },
      };
    }

    logger.info("[AGENT] Web search request", {
      query: query.substring(0, 50),
      numResults,
      summarize,
    });

    const result = await post("/agent/web-search", {
      query,
      num_results: numResults,
      recency_days: recencyDays,
      domains,
      summarize,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        query: result.data.query,
        results: result.data.results,
        totalResults: result.data.total_results,
        summary: result.data.summary,
        hasSummary: result.data.has_summary,
      },
    };
  } catch (error) {
    logger.error("[AGENT] Web search error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Web search failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Execute multi-step agentic task with full orchestration
 * @param {object} params
 * @param {string} params.kind - Task kind (e.g., 'daily_digest', 'fact_check', 'persona_compose')
 * @param {object} [params.params] - Task-specific parameters
 * @param {number} [params.maxSteps] - Maximum steps (1-50)
 * @param {number} [params.timeoutSeconds] - Timeout in seconds (10-300)
 * @returns {Promise<{ok: true, data: {kind: string, finalResponse: string, steps: Array, totalTokens: number, durationMs: number}} | {ok: false, error: object}>}
 */
export async function run(params) {
  const {
    kind,
    params: taskParams = {},
    maxSteps = AGENT_MAX_STEPS,
    timeoutSeconds = 60,
  } = params;

  try {
    if (!kind) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "kind is required",
        },
      };
    }

    logger.info("[AGENT] Run request", {
      kind,
      maxSteps,
      timeoutSeconds,
    });

    const result = await post("/agent/run", {
      kind,
      params: taskParams,
      max_steps: maxSteps,
      timeout_seconds: timeoutSeconds,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        kind: result.data.kind || kind,
        finalResponse: result.data.finalResponse || result.data.final_response,
        steps: result.data.steps || [],
        totalTokens: result.data.totalTokens || result.data.total_tokens || 0,
        durationMs: result.data.durationMs || result.data.duration_ms || 0,
      },
    };
  } catch (error) {
    logger.error("[AGENT] Run error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Agent task execution failed",
        details: { cause: error.message, kind },
      },
    };
  }
}

/**
 * Filter and generate persona responses for challenge game
 * @param {object} params
 * @param {string} params.personaName - Persona name
 * @param {Array<object>} params.messages - User messages to filter
 * @param {number} [params.maxReplies] - Maximum number of replies (1-20)
 * @returns {Promise<{ok: true, data: {persona: string, replies: Array, totalEvaluated: number}} | {ok: false, error: object}>}
 */
export async function personaChallenge(params) {
  const {
    personaName,
    messages,
    maxReplies = 5,
  } = params;

  try {
    if (!personaName || !Array.isArray(messages) || messages.length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "personaName and messages array are required",
        },
      };
    }

    logger.info("[AGENT] Persona challenge request", {
      persona: personaName,
      messageCount: messages.length,
      maxReplies,
    });

    const result = await post("/agent/persona-challenge", {
      persona_name: personaName,
      messages,
      max_replies: maxReplies,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        persona: result.data.persona,
        replies: result.data.replies,
        totalEvaluated: result.data.total_evaluated,
      },
    };
  } catch (error) {
    logger.error("[AGENT] Persona challenge error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: ErrorCodes.AI_MODEL_ERROR,
        message: "Persona challenge failed",
        details: { cause: error.message },
      },
    };
  }
}
