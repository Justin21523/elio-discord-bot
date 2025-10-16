# -*- coding: utf-8 -*-
"""Agent endpoints (full-featured).

- GET  /agent/tools   -> list supported tools
- POST /agent/run     -> run an agent 'kind' flow with params
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .agent import AgentOrchestrator

router = APIRouter()
_agent = AgentOrchestrator()


class AgentRunRequest(BaseModel):
    kind: Literal[
        "free_chat",
        "rag_qa",
        "summarize_with_rag",
        "news_digest",
        "persona_reply",
        "describe_image",
    ]
    params: Dict[str, Any] = Field(default_factory=dict)


@router.get("/tools")
def list_tools() -> Dict[str, Any]:
    return {"ok": True, "tools": _agent.list_tools()}


@router.post("/run")
def run(req: AgentRunRequest) -> Dict[str, Any]:
    try:
        result = _agent.run(req.kind, req.params)
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
