# -*- coding: utf-8 -*-
"""Image utilities endpoints (caption/VQA wrappers + base64 helper)."""

from __future__ import annotations

import base64
from typing import Any, Dict

import requests
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from core.vlm import VLMEngine

router = APIRouter()
_vlm = VLMEngine()


class B64CaptionRequest(BaseModel):
    image_b64: str
    max_length: int = Field(80, ge=8, le=512)


@router.post("/caption/b64")
def caption_b64(req: B64CaptionRequest) -> Dict[str, Any]:
    """Caption from base64 image."""
    try:
        img = base64.b64decode(req.image_b64, validate=True)
        text = _vlm.caption(image=img, max_length=req.max_length, num_beams=3, temperature=0.7)  # type: ignore
        return {"ok": True, "caption": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/caption/file")
async def caption_file(file: UploadFile = File(...), max_length: int = 80) -> Dict[str, Any]:
    """Caption from uploaded file."""
    try:
        img = await file.read()
        text = _vlm.caption(image=img, max_length=max_length, num_beams=3, temperature=0.7)  # type: ignore
        return {"ok": True, "caption": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class UrlCaptionRequest(BaseModel):
    url: str
    max_length: int = Field(80, ge=8, le=512)

@router.post("/caption/url")
def caption_url(req: UrlCaptionRequest) -> Dict[str, Any]:
    """Sidecar fetches the image by URL and captions it."""
    try:
        resp = requests.get(req.url, timeout=10)
        if resp.status_code >= 400:
            raise ValueError(f"fetch failed: {resp.status_code}")
        text = _vlm.caption(image=resp.content, max_length=req.max_length, num_beams=3, temperature=0.7)  # type: ignore
        return {"ok": True, "caption": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class B64VQARequest(BaseModel):
    image_b64: str
    question: str = Field(..., min_length=1, max_length=256)
    max_length: int = Field(128, ge=16, le=512)

@router.post("/vqa/b64")
def vqa_b64(req: B64VQARequest) -> Dict[str, Any]:
    try:
        img = base64.b64decode(req.image_b64, validate=True)
        text = _vlm.vqa(image=img, question=req.question, max_length=req.max_length, temperature=0.7)  # type: ignore
        return {"ok": True, "answer": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class UrlVQARequest(BaseModel):
    url: str
    question: str = Field(..., min_length=1, max_length=256)
    max_length: int = Field(128, ge=16, le=512)

@router.post("/vqa/url")
def vqa_url(req: UrlVQARequest) -> Dict[str, Any]:
    """Sidecar fetches the image by URL and runs VQA."""
    try:
        resp = requests.get(req.url, timeout=10)
        if resp.status_code >= 400:
            raise ValueError(f"fetch failed: {resp.status_code}")
        text = _vlm.vqa(image=resp.content, question=req.question, max_length=req.max_length, temperature=0.7)  # type: ignore
        return {"ok": True, "answer": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))