# -*- coding: utf-8 -*-
"""
RAG QA tool: wraps ChineseRAGEngine to search (and optionally answer).
"""

from __future__ import annotations

from typing import Any, Dict, List

from core.rag import ChineseRAGEngine, RetrievalQuery, get_embedding_manager
from core.llm import EnhancedLLMAdapter

from . import Tool, ToolResult


class RagQATool(Tool):
    name = "ragQA"

    def __init__(self) -> None:
        self._engine = ChineseRAGEngine(embedding_manager=get_embedding_manager())
        self._llm = EnhancedLLMAdapter()

    def meta(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": "Hybrid retrieval on local vector store + optional LLM answer.",
            "params": {"query": "str", "top_k": "int<=20", "mode": "semantic|bm25|hybrid|advanced", "only_search": "bool"},
        }

    def run(self, params: Dict[str, Any]) -> ToolResult:
        query = str(params.get("query", "")).strip()
        if not query:
            return ToolResult(ok=False, error="Empty query")
        top_k = int(params.get("top_k", 6))
        mode = str(params.get("mode", "hybrid"))
        only_search = bool(params.get("only_search", False))

        hits = self._engine.search(RetrievalQuery(text=query, top_k=top_k, mode=mode)) # type: ignore
        context_text = "\n".join(f"[{i+1}] {h.content}" for i, h in enumerate(hits))
        extra = {
            "context": [h.model_dump() for h in hits],
            "context_text": context_text,
        }
        if only_search:
            return ToolResult(ok=True, preview=f"retrieved {len(hits)} chunks", extra=extra)

        system = "Answer concisely using the context. Include citation numbers like [1][2] if applicable."
        prompt = f"{system}\n\nContext:\n{context_text}\n\nQuestion: {query}\nAnswer:"
        answer = self._llm.generate_text(prompt, max_length=512, temperature=0.2)
        extra["answer"] = answer
        return ToolResult(ok=True, preview=answer[:120], extra=extra)
