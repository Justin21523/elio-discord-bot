# -*- coding: utf-8 -*-
"""Embeddings endpoint.

- POST /embeddings/encode  -> returns vectors (float32) and dimension
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.rag import get_embedding_manager

logger = logging.getLogger(__name__)
router = APIRouter()

_embed = get_embedding_manager()


class EncodeRequest(BaseModel):
    texts: List[str]


class EncodeResponse(BaseModel):
    ok: bool
    dim: int
    vectors: List[List[float]]


@router.post("/encode", response_model=EncodeResponse)
def encode(req: EncodeRequest) -> Any:
    try:
        vectors = _embed.encode(req.texts)
        return {"ok": True, "dim": _embed.get_dimension(), "vectors": [v.tolist() for v in vectors]}
    except Exception as e:
        logger.exception("Embeddings encode failed")
        raise HTTPException(status_code=500, detail=str(e))
