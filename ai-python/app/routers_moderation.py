# -*- coding: utf-8 -*-
"""Moderation endpoints.

- POST /moderation/scan -> simple heuristic scan (placeholder for real model)
All code and comments in English only.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .tools.moderation import ModerationTool

router = APIRouter()
_mod = ModerationTool()


class ScanRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


@router.post("/scan")
def scan(req: ScanRequest) -> Dict[str, Any]:
    """Scan a text and return a block/score decision."""
    try:
        r = _mod.run({"text": req.text})
        return {
            "ok": True,
            "blocked": bool(r.extra.get("blocked", False)),
            "score": float(r.extra.get("score", 0.0)),
            "preview": r.preview,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
