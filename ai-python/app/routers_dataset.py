# -*- coding: utf-8 -*-
"""Dataset ingestion endpoints for RAG (URL -> fetch -> process -> upsert)."""

from __future__ import annotations

import re
import requests
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.rag import DocumentProcessor, ChineseRAGEngine, get_embedding_manager

router = APIRouter()
_doc = DocumentProcessor()
_rag = ChineseRAGEngine(embedding_manager=get_embedding_manager())


class UpsertUrlRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=2048)
    doc_id: Optional[str] = None


def _strip_html(raw: str) -> str:
    text = re.sub(r"(?is)<script.*?>.*?</script>", "", raw)
    text = re.sub(r"(?is)<style.*?>.*?</style>", "", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@router.post("/upsert_url")
def upsert_url(req: UpsertUrlRequest) -> Dict[str, Any]:
    """Fetch a URL and insert plain text into vector store."""
    try:
        host = urlparse(req.url).netloc
        if not host:
            raise ValueError("Invalid URL")

        resp = requests.get(req.url, timeout=8)
        if resp.status_code >= 400:
            raise ValueError(f"Fetch failed: {resp.status_code}")

        text = resp.text
        # naive HTML -> text stripping; replace with readability later
        plain = _strip_html(text)[:500_000]

        processed = _doc.process_text(plain, doc_id=req.doc_id, metadata={"source_url": req.url})
        chunks = _rag.add_document(processed)
        return {"ok": True, "doc_id": processed.doc_id, "chunks": len(chunks), "host": host}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
