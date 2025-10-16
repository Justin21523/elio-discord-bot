# -*- coding: utf-8 -*-
"""Admin endpoints for warmup/reload."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from core.llm import EnhancedLLMAdapter
from core.vlm import VLMEngine
from core.rag import get_embedding_manager

router = APIRouter()


@router.post("/warmup")
def warmup() -> Dict[str, Any]:
    """Lazy warmup of major models (non-fatal if any part fails)."""
    stats = {}
    try:
        llm = EnhancedLLMAdapter()
        _ = llm.chat_completion([{"role": "user", "content": "ping"}], max_length=8, temperature=0.0)
        stats["llm"] = "ok"
    except Exception as e:
        stats["llm"] = f"skip: {e}"

    try:
        _ = get_embedding_manager()
        stats["embeddings"] = "ok"
    except Exception as e:
        stats["embeddings"] = f"skip: {e}"

    try:
        _ = VLMEngine()
        stats["vlm"] = "ok"
    except Exception as e:
        stats["vlm"] = f"skip: {e}"

    return {"ok": True, "stats": stats}
