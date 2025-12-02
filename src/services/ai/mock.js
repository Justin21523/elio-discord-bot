// Lightweight mock responses for AI endpoints. Keep responses small and deterministic.
import { AI_MOCK_LATENCY_MS } from "../../config.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const maybeDelay = async () => {
  if (AI_MOCK_LATENCY_MS > 0) {
    await wait(Math.min(AI_MOCK_LATENCY_MS, 2000));
  }
};

const short = (text = "", limit = 120) =>
  (text || "").toString().slice(0, limit).trim() || "mocked content";

const mockVector = (len = 3) => Array.from({ length: len }, (_, i) => 0.01 * (i + 1));

export async function mockPost(endpoint, payload = {}) {
  await maybeDelay();

  switch (endpoint) {
    case "/llm/generate": {
      const text = `[MOCK LLM] ${short(payload.prompt)}`;
      return { ok: true, data: { text, usage: { total: text.length }, model: "mock-llm" } };
    }

    case "/persona/compose": {
      const personaName = payload.persona?.name || "MockPersona";
      const reply = `[${personaName}] ${short(payload.text)}`;
      return {
        ok: true,
        data: {
          text: reply,
          persona: personaName,
          tokens: { total: reply.length },
        },
      };
    }
    case "/persona/logic/reply": {
      const personaName = payload.persona || "MockPersona";
      const reply = `[${personaName}][logic] ${short(payload.message)}`;
      return {
        ok: true,
        data: {
          text: reply,
          persona: personaName,
          strategy: "mock-logic",
          mood: "neutral",
        },
      };
    }

    case "/llm/personaReply": {
      const persona = payload.persona_name || "MockPersona";
      const reply = `[${persona}] ${short(payload.user_message)}`;
      return {
        ok: true,
        data: {
          reply,
          persona,
          tokens: { total: reply.length },
          model: "mock-llm",
        },
      };
    }

    case "/llm/summarizeNews": {
      const topics = payload.topics || ["news"];
      const items = topics.map((t, idx) => ({
        title: `${t} update ${idx + 1}`,
        summary: `Mock summary about ${t}.`,
        url: `https://example.com/${idx + 1}`,
      }));
      return {
        ok: true,
        data: {
          items,
          digest: `Mock digest for ${topics.join(", ")}`,
          tokens: { total: 42 },
          model: "mock-llm",
        },
      };
    }

    case "/rag/search": {
      const query = payload.query || "mock query";
      const hits = [
        {
          id: "mock-doc-1",
          chunk: `Mock fact related to "${short(query, 60)}".`,
          score: 0.88,
          source: "mock-source",
        },
      ];
      return {
        ok: true,
        data: {
          hits,
          answer: `Mock answer for "${short(query, 60)}".`,
          citations: [],
          query,
          total_hits: hits.length,
        },
      };
    }

    case "/rag/insert":
      return {
        ok: true,
        data: {
          doc_id: "mock-doc",
          source: payload.source || "mock",
        },
      };

    case "/rag/delete":
      return {
        ok: true,
        data: {
          deleted_count: payload.doc_id ? 1 : 0,
        },
      };

    case "/embed/text": {
      const texts = payload.texts || [];
      return {
        ok: true,
        data: {
          vectors: texts.map(() => mockVector(6)),
          dim: 6,
          model: "mock-embed",
          count: texts.length,
        },
      };
    }

    case "/vlm/describe": {
      const description = `Mock description for image (${short(payload.image_url, 40)}).`;
      return {
        ok: true,
        data: {
          caption: "Mock caption",
          description,
          reaction: "Mock reaction",
          tokens: { total: description.length },
          model: "mock-vlm",
        },
      };
    }

    case "/vlm/imageReact": {
      const reaction = `[${payload.persona_name || "persona"}] sees image: ${short(
        payload.image_url,
        40
      )}`;
      return {
        ok: true,
        data: {
          reaction,
          persona: payload.persona_name || "MockPersona",
          label: "mock",
          tokens: { total: reaction.length },
          model: "mock-vlm",
        },
      };
    }

    case "/images/caption/b64":
    case "/images/caption/url": {
      const caption = `Mock caption for image`;
      return {
        ok: true,
        data: {
          caption,
          tokens: { total: caption.length },
          model: "mock-vlm",
        },
      };
    }
    case "/images/vqa/b64":
    case "/images/vqa/url": {
      const answer = `Mock answer to: ${short(payload.question, 60)}`;
      return { ok: true, data: { answer, tokens: { total: answer.length }, model: "mock-vlm" } };
    }
    case "/images/describe": {
      const description = `Mock describe: ${short(payload.url || payload.image_b64, 40)}`;
      return { ok: true, data: { description, tokens: { total: description.length }, model: "mock-vlm" } };
    }

    case "/story/generate": {
      const story = `Mock story start: ${short(payload.prompt, 80)} ...`;
      return { ok: true, data: { story, tokens: { total: story.length }, model: "mock-llm" } };
    }
    case "/story/continue": {
      const continuation = `${short(payload.story_so_far, 60)} (mock continue)`;
      return { ok: true, data: { story: continuation, tokens: { total: continuation.length } } };
    }
    case "/story/dialogue": {
      const lines = (payload.characters || ["A", "B"]).map(
        (c, idx) => `${c}: mock line ${idx + 1}`
      );
      return { ok: true, data: { lines, tokens: { total: lines.join(" ").length } } };
    }
    case "/story/character-develop": {
      return {
        ok: true,
        data: {
          profile: `Mock arc for ${payload.character || "hero"}`,
          beats: ["setup", "conflict", "resolution"],
        },
      };
    }
    case "/story/analyze":
      return {
        ok: true,
        data: {
          summary: "Mock analysis",
          pacing: "balanced",
          tone: "light",
          themes: ["friendship"],
        },
      };

    case "/moderation/scan":
      return {
        ok: true,
        data: {
          safe: true,
          flags: [],
        },
      };
    case "/moderation/rewrite":
      return { ok: true, data: { rewritten: short(payload.text, 80) } };
    case "/moderation/batch-scan":
      return {
        ok: true,
        data: {
          results: (payload.texts || []).map((t) => ({ text: t, safe: true, flags: [] })),
        },
      };

    case "/agent/reasoning":
      return {
        ok: true,
        data: {
          problem: payload.problem,
          reasoning_type: payload.reasoning_type || "chain-of-thought",
          steps: ["Identify goal", "List options", "Pick the simplest path"],
          conclusion: `Mock conclusion for ${short(payload.problem, 60)}`,
          full_reasoning: "Mock reasoning trail.",
          tokens: { total: 30 },
        },
      };
    case "/agent/task-planning":
      return {
        ok: true,
        data: {
          goal: payload.goal,
          tasks: [
            { title: "Task 1", detail: "Mock step 1" },
            { title: "Task 2", detail: "Mock step 2" },
          ],
          total_tasks: 2,
          estimated_total_duration: 5,
        },
      };
    case "/agent/multi-task":
      return {
        ok: true,
        data: {
          execution_mode: payload.execution_mode || "sequential",
          total_tasks: payload.tasks?.length || 0,
          successful: payload.tasks?.length || 0,
          failed: 0,
          results: (payload.tasks || []).map((t, idx) => ({ task: t, status: "done", idx })),
          total_duration_ms: 100,
        },
      };
    case "/agent/web-search":
      return {
        ok: true,
        data: {
          query: payload.query,
          results: [{ title: "Mock result", url: "https://example.com", snippet: "Mock snippet." }],
          total_results: 1,
          summary: "Mock web summary.",
          has_summary: true,
        },
      };
    case "/agent/run":
      return {
        ok: true,
        data: {
          kind: payload.kind || "mock",
          finalResponse: `Mock final response for ${payload.kind || "task"}.`,
          steps: ["Mock step 1", "Mock step 2"],
          totalTokens: 20,
          durationMs: 50,
        },
      };
    case "/agent/persona-challenge":
      return {
        ok: true,
        data: {
          persona: payload.persona_name || "MockPersona",
          replies: (payload.messages || []).slice(0, payload.max_replies || 3).map((m, idx) => ({
            text: `Mock reply ${idx + 1} to "${short(m.content || m, 40)}"`,
          })),
          total_evaluated: payload.messages?.length || 0,
        },
      };

    case "/finetune/start-training":
      return {
        ok: true,
        data: {
          job_id: "mock-job",
          job_name: payload.job_name || "mock-training",
          status: "queued",
          config: payload,
        },
      };
    case "/finetune/job-status":
      return {
        ok: true,
        data: {
          job_id: payload.job_id || "mock-job",
          job_name: "mock-training",
          status: "running",
          progress: 42,
          current_step: 2,
          total_steps: 5,
          metrics: { loss: 0.1 },
          output_model: "mock-model",
          error: null,
        },
      };
    case "/finetune/cancel-job":
      return {
        ok: true,
        data: {
          job_id: payload.job_id || "mock-job",
          status: "cancelled",
          message: "Mock cancel acknowledged",
        },
      };
    case "/finetune/hyperparameter-tuning":
      return {
        ok: true,
        data: {
          job_id: "mock-hpo",
          status: "queued",
          trials: 3,
        },
      };
    case "/finetune/register-model":
      return {
        ok: true,
        data: {
          model_id: "mock-model",
          status: "registered",
        },
      };
    case "/finetune/prepare-dataset":
      return { ok: true, data: { dataset_id: "mock-dataset", status: "ready" } };

    default:
      return { ok: true, data: { message: `Mock response for ${endpoint}` } };
  }
}

export async function mockGet(endpoint, params = {}) {
  await maybeDelay();

  switch (endpoint) {
    case "/health":
      return { ok: true, data: { status: "ok", mode: "mock" } };
    case "/embed/model-info":
      return {
        ok: true,
        data: { model: "mock-embed", dimension: 6, max_length: 512, supports_multilingual: true },
      };
    case "/finetune/list-jobs":
      return {
        ok: true,
        data: {
          jobs: [],
          total: 0,
        },
      };
    default:
      return { ok: true, data: { message: `Mock GET for ${endpoint}`, params } };
  }
}

export async function mockFetch(path, body = {}, method = "POST") {
  const res = method === "GET" ? await mockGet(path, body) : await mockPost(path, body);
  if (!res.ok) {
    return { status: 503, json: { ok: false, error: res.error || { code: "MOCK_ERROR" } } };
  }

  const data = res.data || {};
  const json = typeof data === "object" ? { ok: true, ...data } : { ok: true, data };
  return { status: 200, json };
}
