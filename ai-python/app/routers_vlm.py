# -*- coding: utf-8 -*-
"""VLM endpoints.

- POST /vlm/caption    -> image caption
- POST /vlm/vqa        -> visual question answering
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from core.vlm import VLMEngine
from core.config import get_config

logger = logging.getLogger(__name__)
router = APIRouter()
_cfg = get_config()
_vlm = VLMEngine()


class CaptionQuery(BaseModel):
    max_length: int = Field(80, ge=8, le=512)
    num_beams: int = Field(3, ge=1, le=8)
    temperature: float = Field(0.7, ge=0.0, le=2.0)


@router.post("/caption")
async def caption_image(
    query: CaptionQuery, file: UploadFile = File(...)
) -> Dict[str, Any]:
    """Generate image caption."""
    try:
        img_bytes = await file.read()
        # engine.caption expects PIL/image; VLMEngine has async helper as well
        result = _vlm.caption(image=img_bytes, max_length=query.max_length, num_beams=query.num_beams, temperature=query.temperature)  # type: ignore
        return {"ok": True, "result": result}
    except Exception as e:
        logger.exception("VLM caption failed")
        raise HTTPException(status_code=500, detail=str(e))


class VQAQuery(BaseModel):
    question: str
    max_length: int = Field(128, ge=8, le=512)
    temperature: float = Field(0.7, ge=0.0, le=2.0)


@router.post("/vqa")
async def vqa_image(query: VQAQuery, file: UploadFile = File(...)) -> Dict[str, Any]:
    """Answer a question about an image."""
    try:
        img_bytes = await file.read()
        result = _vlm.vqa(  # type: ignore
            image=img_bytes, question=query.question, max_length=query.max_length, temperature=query.temperature
        )
        return {"ok": True, "result": result}
    except Exception as e:
        logger.exception("VLM vqa failed")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/version")
def version() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "communiverse-ai-sidecar",
        "version": "0.1.0",
        "features": {
            "llm": _cfg.features.enable_chat,
            "rag": _cfg.features.enable_rag,
            "vlm": _cfg.features.enable_vqa or _cfg.features.enable_caption,
            "agent": _cfg.features.enable_agent,
        },
        "models": {
            "llm": _cfg.llm_models.chat_model,
            "embeddings": _cfg.embeddings.model_name,
        },
        "backend": _cfg.mongo.rag_backend,
    }


@router.get("/health")
def health() -> Dict[str, Any]:
    # lightweight OK; deeper checks could probe Mongo when backend=avs
    return {"ok": True, "status": "healthy"}