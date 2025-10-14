# -*- coding: utf-8 -*-
"""RAG endpoints.

- POST /rag/upsert_text    -> add raw text into vector store
- POST /rag/upsert_file    -> add a file (pdf/docx/...) into store
- POST /rag/search         -> top-k retrieve (semantic / bm25 / hybrid)
- POST /rag/answer         -> retrieve-then-generate with LLM

This wraps the rich core.rag module (document processor, embeddings, retrievers).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from .pipelines.rag_plus import RAGPlus

from core.rag import (
    DocumentProcessor,
    EmbeddingManager,
    get_embedding_manager,
    ChineseRAGEngine,
    RetrievalQuery,
)
from core.rag_backend import get_rag_engine
from core.llm import EnhancedLLMAdapter
from core.config import get_config

logger = logging.getLogger(__name__)
router = APIRouter()

_config = get_config()
_doc = DocumentProcessor()
_embed: EmbeddingManager = get_embedding_manager()
# ChineseRAGEngine supports hybrid retrieval, rerank, etc. (per your uploaded module)
_rag = get_rag_engine()
_llm = EnhancedLLMAdapter()
_ragplus = RAGPlus()

# -------- Ingest --------

class UpsertTextRequest(BaseModel):
    text: str
    doc_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    namespace: Optional[str] = None
    tags: Optional[List[str]] = None


class UpsertResponse(BaseModel):
    ok: bool
    doc_id: str
    chunks: int


@router.post("/upsert_text", response_model=UpsertResponse)
def upsert_text(req: UpsertTextRequest) -> Any:
    """Process and insert raw text into vector store."""
    try:
        processed = _doc.process_text(req.text, doc_id=req.doc_id, metadata=req.metadata)
        chunks = _rag.add_document(processed)  # engine handles chunking + index
        return {"ok": True, "doc_id": processed.doc_id, "chunks": len(chunks)}
    except Exception as e:
        logger.exception("RAG upsert_text failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upsert_file", response_model=UpsertResponse)
async def upsert_file(file: UploadFile = File(...)) -> Any:
    """Process and insert a file into vector store."""
    try:
        tmp = Path("/tmp") / file.filename # type: ignore
        with tmp.open("wb") as f:
            f.write(await file.read())

        processed = _doc.process_file(tmp)
        chunks = _rag.add_document(processed)
        return {"ok": True, "doc_id": processed.doc_id, "chunks": len(chunks)}
    except Exception as e:
        logger.exception("RAG upsert_file failed")
        raise HTTPException(status_code=500, detail=str(e))


# -------- Search --------

class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(8, ge=1, le=50)
    mode: Literal["semantic", "bm25", "hybrid", "advanced"] = "hybrid"
    alpha: float = Field(0.7, ge=0.0, le=1.0)
    language: Literal["auto", "zh", "en"] = "auto"
    namespace: Optional[str] = None
    tags_any: Optional[List[str]] = None
    tags_all: Optional[List[str]] = None


class SearchResponse(BaseModel):
    ok: bool
    query: str
    results: List[Dict[str, Any]]


@router.post("/search", response_model=SearchResponse)
def rag_search(req: SearchRequest) -> Any:
    try:
        q = RetrievalQuery(
            text=req.query,
            top_k=req.top_k,
            mode="hybrid" if req.mode == "advanced" else req.mode,
            alpha=req.alpha,
            namespace=req.namespace,
            tags_any=req.tags_any,
            tags_all=req.tags_all,
        )
        results = _rag.search(q)
        return {"ok": True, "query": req.query, "results": [r.model_dump() for r in results]}
    except Exception as e:
        logger.exception("RAG search failed")
        raise HTTPException(status_code=500, detail=str(e))

# -------- Answer (advanced path kept in rag_plus) --------

class AnswerRequest(BaseModel):
    question: str
    top_k: int = Field(6, ge=1, le=20)
    mode: Literal["semantic", "bm25", "hybrid", "advanced"] = "hybrid"
    system_prompt: Optional[str] = None
    advanced: bool = False
    namespace: Optional[str] = None
    tags_any: Optional[List[str]] = None
    tags_all: Optional[List[str]] = None

class AnswerResponse(BaseModel):
    ok: bool
    answer: str
    context: List[Dict[str, Any]]
    model: str

# NOTE: advanced implementation lives in pipelines/rag_plus.py (already wired previously)
from .pipelines.rag_plus import RAGPlus
_ragplus = RAGPlus()

@router.post("/answer", response_model=AnswerResponse)
def rag_answer(req: AnswerRequest) -> Any:
    try:
        if req.mode == "advanced" or req.advanced:
            # advanced ignores filters for brevity; can be added if needed
            out = _ragplus.run(req.question, top_k=req.top_k, mode="hybrid")
            return {"ok": True, "answer": out["answer"], "context": out["context"], "model": _config.llm_models.chat_model}

        q = RetrievalQuery(
            text=req.question,
            top_k=req.top_k,
            mode=req.mode,
            namespace=req.namespace,
            tags_any=req.tags_any,
            tags_all=req.tags_all,
        )
        hits = _rag.search(q)
        context_blocks = []
        for h in hits:
            context_blocks.append(f"[{h.score:.3f}] {h.content}")
        system = req.system_prompt or ("You are a precise assistant. Answer with citations numbers like [1][2] if helpful.")
        user_prompt = (
            f"{system}\n\nContext:\n"
            + "\n".join(f"[{i+1}] {b}" for i, b in enumerate(context_blocks))
            + f"\n\nQuestion: {req.question}\nAnswer:"
        )
        out = _llm.generate_text(user_prompt, max_length=512, temperature=0.3)
        return {"ok": True, "answer": out, "context": [h.model_dump() for h in hits], "model": _config.llm_models.chat_model}
    except Exception as e:
        logger.exception("RAG answer failed")
        raise HTTPException(status_code=500, detail=str(e))

# -------- Admin ops --------

class ListDocsResponse(BaseModel):
    ok: bool
    docs: List[Dict[str, Any]]

@router.get("/docs", response_model=ListDocsResponse)
def list_docs(namespace: Optional[str] = None) -> Any:
    try:
        docs = _rag.list_documents(namespace)
        return {"ok": True, "docs": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DeleteDocRequest(BaseModel):
    doc_id: str

class DeleteDocResponse(BaseModel):
    ok: bool
    removed_chunks: int

@router.post("/delete_doc", response_model=DeleteDocResponse)
def delete_doc(req: DeleteDocRequest) -> Any:
    try:
        n = _rag.delete_document(req.doc_id)
        return {"ok": True, "removed_chunks": n}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DisableChunkRequest(BaseModel):
    chunk_id: str
    disabled: bool = True

@router.post("/disable_chunk")
def disable_chunk(req: DisableChunkRequest) -> Dict[str, Any]:
    try:
        ok = _rag.set_chunk_disabled(req.chunk_id, req.disabled)
        return {"ok": ok}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ExportPayload(BaseModel):
    ok: bool
    dump: Dict[str, Any]

@router.get("/export", response_model=ExportPayload)
def export_index() -> Any:
    try:
        return {"ok": True, "dump": _rag.export_json()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ImportRequest(BaseModel):
    dump: Dict[str, Any]

@router.post("/import")
def import_index(req: ImportRequest) -> Dict[str, Any]:
    try:
        _rag.import_json(req.dump)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))