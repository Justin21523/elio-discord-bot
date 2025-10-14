# -*- coding: utf-8 -*-
"""Persona compose endpoints.

- POST /persona/compose -> LLM reply in persona style
All code and comments in English only.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .tools.persona_compose import PersonaComposeTool

router = APIRouter()
_tool = PersonaComposeTool()


class PersonaModel(BaseModel):
    name: str = "Elio"
    style: str = "playful, supportive"
    tone: Optional[str] = None


class ComposeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    persona: PersonaModel = PersonaModel()
    max_length: int = Field(180, ge=40, le=400)


@router.post("/compose")
def compose(req: ComposeRequest) -> Dict[str, Any]:
    """Compose a short persona-styled reply."""
    try:
        r = _tool.run(
            {
                "text": req.text,
                "persona": req.persona.model_dump(),
                "max_length": req.max_length,
            }
        )
        return {"ok": True, "reply": r.extra.get("output", ""), "preview": r.preview}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
