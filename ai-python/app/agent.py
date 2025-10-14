# -*- coding: utf-8 -*-
"""
Agent Orchestrator for Communiverse AI Sidecar.

Design goals:
- Tool-based orchestration (webSearch, rag, moderation, personaCompose, imageDescribe)
- Deterministic "flows" selectable by 'kind'
- Step-level traces with timing, inputs/outputs (sanitized), and error capture
- Safe defaults (timeouts, allowlist, input length caps)
- Extensible registry: add a new Tool by subclassing Tool and registering it

All code and comments in English only.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from core.llm import EnhancedLLMAdapter
from core.config import get_config

from .tools import (
    Tool,
    ToolResult,
    WebSearchTool,
    RagQATool,
    ModerationTool,
    PersonaComposeTool,
    ImageDescribeTool,
)

Config = get_config()


@dataclass
class AgentStep:
    """Trace of a single tool invocation."""

    tool: str
    params: Dict[str, Any]
    started_at: float
    finished_at: float
    ok: bool
    output_preview: str
    error: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool": self.tool,
            "params": self.params,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_sec": round(self.finished_at - self.started_at, 3),
            "ok": self.ok,
            "output_preview": self.output_preview,
            "error": self.error,
            "extra": self.extra,
        }


@dataclass
class AgentTrace:
    """Full trace of an agent run."""

    run_id: str
    kind: str
    input: Dict[str, Any]
    steps: List[AgentStep] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    finished_at: float = 0.0
    result: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "run_id": self.run_id,
            "kind": self.kind,
            "input": self.input,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_sec": round(self.finished_at - self.started_at, 3),
            "steps": [s.to_dict() for s in self.steps],
            "result": self.result or {},
        }


class AgentOrchestrator:
    """
    Simple, robust orchestrator around a registry of Tools.
    """

    def __init__(self) -> None:
        self._tools: Dict[str, Tool] = {
            "webSearch": WebSearchTool(),
            "ragQA": RagQATool(),
            "moderation": ModerationTool(),
            "personaCompose": PersonaComposeTool(),
            "imageDescribe": ImageDescribeTool(),
        }
        self._llm = EnhancedLLMAdapter()

    # -------- Public API --------

    def list_tools(self) -> List[Dict[str, Any]]:
        """Return tool metadata."""
        return [t.meta() for t in self._tools.values()]

    def run(self, kind: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run an agent flow by kind.

        Available kinds:
        - free_chat: direct LLM chat
        - rag_qa: retrieve-then-answer via RAG tool
        - summarize_with_rag: search -> summarize
        - news_digest: webSearch (allowlist) -> summarize
        - persona_reply: moderation -> personaCompose (LLM style)
        - describe_image: imageDescribe (VLM caption)
        """
        run_id = str(uuid.uuid4())
        trace = AgentTrace(run_id=run_id, kind=kind, input=params)

        try:
            if kind == "free_chat":
                out = self._llm.chat_completion(
                    [{"role": "user", "content": params.get("query", "")}],
                    max_length=int(params.get("max_length", 512)),
                    temperature=float(params.get("temperature", 0.7)),
                )
                trace.result = {"answer": out.get("message", ""), "usage": out.get("usage", {})}
                return self._finish(trace)

            if kind == "rag_qa":
                step = self._call("ragQA", {"query": params["query"], "top_k": params.get("top_k", 6)})
                trace.steps.append(step)
                answer = step.extra.get("answer", "")
                trace.result = {"answer": answer, "context": step.extra.get("context", [])}
                return self._finish(trace)

            if kind == "summarize_with_rag":
                # RAG search first
                s1 = self._call("ragQA", {"query": params["query"], "top_k": params.get("top_k", 8), "mode": "hybrid", "only_search": True})
                trace.steps.append(s1)
                context = s1.extra.get("context_text", "")
                prompt = f"Summarize the following context in bullet points, then provide a concise answer to the user's request.\n\nContext:\n{context}\n\nUser: {params['query']}\nSummary+Answer:"
                text = self._llm.generate_text(prompt, max_length=512, temperature=0.2)
                trace.result = {"summary": text, "context": s1.extra.get("context", [])}
                return self._finish(trace)

            if kind == "news_digest":
                # webSearch -> summarize; safe domains come from config
                s1 = self._call("webSearch", {"query": params["query"], "max_results": params.get("max_results", 6)})
                trace.steps.append(s1)
                articles = s1.extra.get("results", [])
                condensed = "\n".join(f"- {a['title']} — {a['url']}" for a in articles[:8])
                prompt = (
                    "Write a short digest in Chinese with 3–5 bullets. "
                    "Each bullet should contain the key fact and one short implication. "
                    "Use neutral tone.\n\nSources:\n" + condensed
                )
                text = self._llm.generate_text(prompt, max_length=400, temperature=0.3)
                trace.result = {"digest": text, "sources": articles}
                return self._finish(trace)

            if kind == "persona_reply":
                # moderation -> personaCompose
                s1 = self._call("moderation", {"text": params["text"]})
                trace.steps.append(s1)
                if s1.extra.get("blocked", False):
                    trace.result = {
                        "blocked": True,
                        "reason": "Content flagged by moderation.",
                        "score": s1.extra.get("score", 1.0),
                    }
                    return self._finish(trace)
                s2 = self._call(
                    "personaCompose",
                    {
                        "text": params["text"],
                        "persona": params.get("persona", {"name": "Elio", "style": "playful, supportive"}),
                        "max_length": params.get("max_length", 180),
                    },
                )
                trace.steps.append(s2)
                trace.result = {"reply": s2.extra.get("output", "")}
                return self._finish(trace)

            if kind == "describe_image":
                # imageDescribe tool expects bytes or base64
                s1 = self._call("imageDescribe", {"image_b64": params["image_b64"], "max_length": params.get("max_length", 80)})
                trace.steps.append(s1)
                trace.result = {"caption": s1.extra.get("caption", "")}
                return self._finish(trace)

            # Unknown kind
            trace.result = {"error": f"Unknown kind: {kind}"}
            return self._finish(trace)

        except Exception as e:
            trace.result = {"error": str(e)}
            return self._finish(trace)

    # -------- Internals --------

    def _call(self, tool_name: str, params: Dict[str, Any]) -> AgentStep:
        tool = self._tools[tool_name]
        started = time.time()
        try:
            res: ToolResult = tool.run(params)
            finished = time.time()
            preview = res.preview or ""
            return AgentStep(
                tool=tool_name,
                params=tool.sanitized_params(params),
                started_at=started,
                finished_at=finished,
                ok=res.ok,
                output_preview=preview[:240],
                error=res.error,
                extra=res.extra,
            )
        except Exception as e:
            finished = time.time()
            return AgentStep(
                tool=tool_name,
                params=tool.sanitized_params(params),
                started_at=started,
                finished_at=finished,
                ok=False,
                output_preview="",
                error=str(e),
                extra={},
            )

    def _finish(self, trace: AgentTrace) -> Dict[str, Any]:
        trace.finished_at = time.time()
        return trace.to_dict()
