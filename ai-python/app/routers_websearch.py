# -*- coding: utf-8 -*-
"""Web search endpoints (thin wrapper over WebSearchTool)."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .tools.web_search import WebSearchTool

router = APIRouter()
_tool = WebSearchTool()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=256)
    max_results: int = Field(6, ge=1, le=10)


@router.post("/search")
def websearch(req: SearchRequest) -> Dict[str, Any]:
    """Perform a quick web search (allowlisted domains, resilient offline)."""
    try:
        r = _tool.run({"query": req.query, "max_results": req.max_results})
        return {"ok": True, "results": r.extra.get("results", []), "preview": r.preview}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
