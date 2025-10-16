# -*- coding: utf-8 -*-
"""LLM endpoints.

- POST /llm/chat        -> chat-style completion (messages[])
- POST /llm/generate    -> single prompt completion
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.llm import EnhancedLLMAdapter  # richer adapter over transformers
from core.config import get_config

logger = logging.getLogger(__name__)
router = APIRouter()

_config = get_config()
_llm = EnhancedLLMAdapter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    max_length: int = Field(512, ge=1, le=4096)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    top_p: float = Field(0.9, ge=0.0, le=1.0)
    repetition_penalty: float = Field(1.1, ge=0.9, le=2.0)
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    ok: bool
    content: str
    usage: Dict[str, int]
    model: str


class GenerateRequest(BaseModel):
    prompt: str
    max_length: int = Field(256, ge=1, le=4096)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    top_p: float = Field(0.9, ge=0.0, le=1.0)
    repetition_penalty: float = Field(1.1, ge=0.9, le=2.0)


class GenerateResponse(BaseModel):
    ok: bool
    text: str
    model: str


@router.post("/chat", response_model=ChatResponse)
def llm_chat(req: ChatRequest) -> Any:
    """Chat completion with session/memory hint."""
    try:
        result = _llm.chat_completion(
            [m.model_dump() for m in req.messages],
            max_length=req.max_length,
            temperature=req.temperature,
            top_p=req.top_p,
            repetition_penalty=req.repetition_penalty,
            session_id=req.session_id,
        )
        return {
            "ok": True,
            "content": result["message"],
            "usage": result.get("usage", {}),
            "model": result.get("model_used", _config.llm_models.chat_model),
        }
    except Exception as e:
        logger.exception("LLM chat failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=GenerateResponse)
def llm_generate(req: GenerateRequest) -> Any:
    """Single prompt completion."""
    try:
        text = _llm.generate_text(
            req.prompt,
            max_length=req.max_length,
            temperature=req.temperature,
            top_p=req.top_p,
            repetition_penalty=req.repetition_penalty,
        )
        return {
            "ok": True,
            "text": text,
            "model": _config.llm_models.chat_model,
        }
    except Exception as e:
        logger.exception("LLM generate failed")
        raise HTTPException(status_code=500, detail=str(e))
