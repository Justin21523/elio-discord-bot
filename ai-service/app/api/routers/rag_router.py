"""
RAG Router - Retrieval-Augmented Generation endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.models.manager import ModelManager
from app.services.rag.search import RAGSearchService
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager, get_rag_service

logger = setup_logger(__name__)
router = APIRouter()


class RAGSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    guild_id: Optional[str] = None
    top_k: int = Field(6, ge=1, le=20)
    mmr_lambda: float = Field(0.3, ge=0.0, le=1.0)
    generate_answer: bool = True


class RAGSearchResponse(BaseModel):
    ok: bool = True
    data: dict


@router.post("/search", response_model=RAGSearchResponse)
async def rag_search(
    request: RAGSearchRequest,
    model_manager: ModelManager = Depends(get_model_manager),
    rag_service: RAGSearchService = Depends(get_rag_service)
):
    """Perform RAG search with optional answer generation"""
    try:
        logger.info(f"[RAG] Searching: {request.query[:50]}...")

        # Perform search
        hits = await rag_service.search(
            query=request.query,
            top_k=request.top_k,
            guild_id=request.guild_id,
            mmr_lambda=request.mmr_lambda,
        )

        logger.info(f"[RAG] Found {len(hits)} hits")

        answer = None
        citations = []

        if request.generate_answer and hits:
            llm = await model_manager.get_llm()

            context = "\n\n".join(
                [f"[{i+1}] {hit['chunk'][:500]}" for i, hit in enumerate(hits[:5])]
            )

            result = await llm.generate(
                system="You are a helpful assistant. Answer based on context. Cite sources [1], [2], etc.",
                prompt=f"""Context:
{context}

Question: {request.query}

Answer:""",
                max_tokens=512,
                temperature=0.7,
            )

            answer = result.get("text", "").strip()

            citations = [
                {
                    "doc_id": hit["doc_id"],
                    "title": hit.get("title", hit["source"]),
                    "url": hit.get("url"),
                }
                for hit in hits[:3]
            ]

        return {
            "ok": True,
            "data": {
                "hits": [
                    {
                        "doc_id": hit["doc_id"],
                        "score": hit["score"],
                        "chunk": hit["chunk"][:500],
                        "source": hit["source"],
                        "url": hit.get("url"),
                        "guild_id": hit.get("guild_id"),
                    }
                    for hit in hits
                ],
                "answer": answer,
                "citations": citations,
                "query": request.query,
                "total_hits": len(hits),
            },
        }
    except Exception as e:
        logger.error(f"[ERR] RAG search failed: {e}", exc_info=True)
        raise HTTPException(
            500,
            {
                "ok": False,
                "error": {
                    "code": (
                        "RAG_EMPTY"
                        if "no results" in str(e).lower()
                        else "AI_MODEL_ERROR"
                    ),
                    "message": str(e),
                },
            },
        )


@router.post("/insert")
async def rag_insert(
    text: str = Field(...),
    source: str = Field(...),
    guild_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    url: Optional[str] = None,
    rag_service: RAGSearchService = Depends(get_rag_service)
):
    """Insert document into RAG store"""
    try:
        logger.info(f"[RAG] Inserting document (source={source})")

        doc_id = await rag_service.insert(
            text=text, source=source, guild_id=guild_id, metadata=metadata, url=url
        )

        return {"ok": True, "data": {"doc_id": doc_id, "source": source}}
    except Exception as e:
        logger.error(f"[ERR] RAG insert failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "DB_ERROR", "message": str(e)}}
        )
