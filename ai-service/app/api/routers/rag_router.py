"""
RAG Router - Retrieval-Augmented Generation endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field
import numpy as np
from pymongo import MongoClient

from app.models.manager import ModelManager
from app.services.rag.search import RAGSearchService
from app.utils.logger import setup_logger, log_info, log_error
from app.dependencies import get_model_manager, get_rag_service
from app.config import Settings

settings = Settings()
logger = setup_logger(__name__)
router = APIRouter()

# MongoDB client for direct RAG queries
_mongo_client = None

def get_mongo_client():
    """Get or create MongoDB client"""
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(settings.MONGODB_URI)
    return _mongo_client


class RAGSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    guild_id: Optional[str] = None
    top_k: int = Field(6, ge=1, le=20)
    mmr_lambda: float = Field(0.3, ge=0.0, le=1.0)
    generate_answer: bool = True


class RAGSearchResponse(BaseModel):
    ok: bool = True
    data: dict


class RAGInsertRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    guild_id: Optional[str] = None
    metadata: Optional[dict] = None
    url: Optional[str] = None


async def search_mongodb_rag(
    query: str,
    guild_id: Optional[str],
    top_k: int,
    model_manager: ModelManager
) -> list:
    """
    Direct MongoDB RAG search using embeddings
    Bypasses FAISS index and queries MongoDB directly
    """
    try:
        # Generate query embedding
        llm = await model_manager.get_llm()
        from app.models.embedings import embeddings_service

        embed_result = await embeddings_service.embed([query])
        if not embed_result or "vectors" not in embed_result:
            log_error("Failed to generate query embedding")
            return []

        query_embedding = np.array(embed_result["vectors"][0])

        # Query MongoDB for RAG documents
        mongo_client = get_mongo_client()
        db = mongo_client[settings.MONGODB_DB]
        collection = db["rag_docs"]

        logger.info(f"[RAG DEBUG] Connected to DB: {settings.MONGODB_DB}, collection: rag_docs")

        # Build filter - guild_id is optional, don't filter if not found in docs
        filter_query = {}
        # Don't filter by guild_id since documents don't have this field yet
        # Future: add guild_id to metadata when inserting documents

        # Get all documents with embeddings
        docs = list(collection.find(filter_query))
        logger.info(f"[RAG DEBUG] Query filter: {filter_query}")
        logger.info(f"[RAG DEBUG] Found {len(docs)} documents in MongoDB")
        log_info(f"[RAG] Found {len(docs)} documents in MongoDB")

        if not docs:
            return []

        # Calculate cosine similarity for each document
        results = []
        for doc in docs:
            if "embedding" not in doc or not doc["embedding"]:
                continue

            doc_embedding = np.array(doc["embedding"])

            # Cosine similarity
            similarity = np.dot(query_embedding, doc_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding)
            )

            results.append({
                "doc_id": str(doc["_id"]),
                "chunk": doc.get("content", ""),
                "source": doc.get("metadata", {}).get("source", "unknown"),
                "score": float(similarity),
                "metadata": doc.get("metadata", {})
            })

        # Sort by similarity score (highest first)
        results.sort(key=lambda x: x["score"], reverse=True)

        # Return top_k results
        top_results = results[:top_k]
        log_info(f"[RAG] Returning {len(top_results)} top results")

        return top_results

    except Exception as e:
        log_error(f"MongoDB RAG search failed: {e}")
        return []


@router.post("/search", response_model=RAGSearchResponse)
async def rag_search(
    request: RAGSearchRequest,
    model_manager: ModelManager = Depends(get_model_manager),
    rag_service: RAGSearchService = Depends(get_rag_service)
):
    """Perform RAG search with optional answer generation"""
    try:
        logger.info(f"[RAG] Searching: {request.query[:50]}...")

        # Try MongoDB direct search first (bypasses empty FAISS index)
        hits = await search_mongodb_rag(
            query=request.query,
            guild_id=request.guild_id,
            top_k=request.top_k,
            model_manager=model_manager
        )

        logger.info(f"[RAG] Found {len(hits)} hits via MongoDB")

        answer = None
        citations = []

        if request.generate_answer:
            llm = await model_manager.get_llm()

            if hits:
                # Answer with context from search results
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
            else:
                # No relevant documents found - generate a general answer
                result = await llm.generate(
                    system="You are a helpful assistant for the Communiverse Discord bot. Answer questions naturally and helpfully, even without specific context.",
                    prompt=f"""Question: {request.query}

Please provide a helpful answer. If you don't have specific information, offer general guidance or suggest how the user might find more information.""",
                    max_tokens=512,
                    temperature=0.7,
                )

                answer = result.get("text", "").strip()

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
    request: RAGInsertRequest,
    rag_service: RAGSearchService = Depends(get_rag_service)
):
    """Insert document into RAG store"""
    try:
        logger.info(f"[RAG] Inserting document (source={request.source})")

        doc_id = await rag_service.insert(
            text=request.text,
            source=request.source,
            guild_id=request.guild_id,
            metadata=request.metadata,
            url=request.url
        )

        return {"ok": True, "data": {"doc_id": doc_id, "source": request.source}}
    except Exception as e:
        logger.error(f"[ERR] RAG insert failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "DB_ERROR", "message": str(e)}}
        )
