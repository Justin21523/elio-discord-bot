"""
RAG Search - Hybrid search combining vector, BM25, and reranking
Unified service integrating all RAG components
"""

import numpy as np
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

from app.models.embedings import embeddings_service
from app.utils.logger import log_info, log_error

# Import RAG components
from .vector_store import VectorStore, Document
from .bm25 import BM25Index
from .reranker import Reranker


class RAGSearchService:
    """
    Complete RAG Search Service with hybrid search capabilities
    Combines semantic (vector), keyword (BM25), and reranking
    """

    def __init__(
        self,
        mongodb_uri: str,
        db_name: str,
        model_manager,
        vector_dim: int = 1024,
        vector_metric: str = "cosine",
        data_path: str = "./data",
        enable_rerank: bool = True,
        rerank_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        bm25_k1: float = 1.5,
        bm25_b: float = 0.75,
    ):
        """
        Initialize RAG Search Service

        Args:
            mongodb_uri: MongoDB connection URI (for future use)
            db_name: Database name (for future use)
            model_manager: ModelManager instance for embeddings
            vector_dim: Embedding dimension
            vector_metric: Distance metric for vector search
            data_path: Base path for storing indexes
            enable_rerank: Whether to enable result reranking
            rerank_model: Cross-encoder model for reranking
            bm25_k1: BM25 k1 parameter
            bm25_b: BM25 b parameter
        """
        self.mongodb_uri = mongodb_uri
        self.db_name = db_name
        self.model_manager = model_manager

        # Initialize components
        self.vector_store = VectorStore(
            dimension=vector_dim,
            metric=vector_metric,
            index_path=f"{data_path}/vectors",
        )

        self.bm25_index = BM25Index(
            index_path=f"{data_path}/bm25", k1=bm25_k1, b=bm25_b
        )

        self.reranker = None
        if enable_rerank:
            self.reranker = Reranker(
                model_name=rerank_model, cache_dir=f"{data_path}/models"
            )

        self.enable_rerank = enable_rerank
        self.initialized = False

        log_info(
            "RAGSearchService initialized",
            mongodb_uri=mongodb_uri,
            db_name=db_name,
            vector_dim=vector_dim,
            enable_rerank=enable_rerank,
        )

    async def initialize(self):
        """Initialize all RAG components"""
        if self.initialized:
            return

        log_info("Initializing RAG components")

        try:
            # Initialize vector store
            await self.vector_store.initialize()

            # Initialize BM25 index
            await self.bm25_index.initialize()

            # Initialize reranker if enabled
            if self.enable_rerank and self.reranker:
                await self.reranker.initialize()

            self.initialized = True
            log_info("RAG components initialized successfully")

        except Exception as e:
            log_error("Failed to initialize RAG components", error=str(e))
            raise

    async def search(
        self,
        query: str,
        top_k: int = 5,
        search_type: str = "hybrid",
        guild_id: Optional[str] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
        mmr_lambda: float = 0.3,
        alpha: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search knowledge base using various strategies

        Args:
            query: Search query
            top_k: Number of results
            search_type: "semantic", "bm25", or "hybrid"
            guild_id: Optional guild filter
            filter_metadata: Metadata filters
            mmr_lambda: MMR diversity parameter (not fully implemented)
            alpha: Hybrid weight (0=BM25 only, 1=semantic only, 0.5=balanced)

        Returns:
            List of documents with scores
        """
        if not self.initialized:
            await self.initialize()

        # Add guild_id to filter metadata if provided
        if guild_id and filter_metadata is None:
            filter_metadata = {"guild_id": guild_id}
        elif guild_id and filter_metadata is not None:
            filter_metadata = dict(filter_metadata)
            filter_metadata["guild_id"] = guild_id

        log_info(
            "RAG search requested",
            query=query[:100],
            type=search_type,
            top_k=top_k,
            guild_id=guild_id,
        )

        try:
            # Route to appropriate search method
            if search_type == "semantic":
                results = await self._semantic_search(query, top_k, filter_metadata)
            elif search_type == "bm25":
                results = await self._bm25_search(query, top_k, filter_metadata)
            elif search_type == "hybrid":
                results = await self._hybrid_search(
                    query, top_k, filter_metadata, alpha
                )
            else:
                log_error("Invalid search type", search_type=search_type)
                return []

            # Rerank if enabled and we have results
            if self.enable_rerank and self.reranker and len(results) > 1:
                results = await self.reranker.rerank_results(query, results, top_k)
                log_info("Results reranked", final_count=len(results))

            log_info("RAG search completed", results_count=len(results))
            return results

        except Exception as e:
            log_error("RAG search failed", error=str(e))
            return []

    async def insert(
        self,
        text: str,
        source: str,
        guild_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        url: Optional[str] = None,
    ) -> str:
        """
        Insert a document into the RAG system

        Args:
            text: Document content/text
            source: Source identifier
            guild_id: Optional guild ID
            metadata: Optional metadata dict
            url: Optional URL

        Returns:
            Document ID (string)
        """
        if not self.initialized:
            await self.initialize()

        doc_id = str(uuid.uuid4())

        # Build metadata
        doc_metadata = metadata or {}
        doc_metadata["source"] = source
        doc_metadata["added_at"] = datetime.utcnow().isoformat()
        if guild_id:
            doc_metadata["guild_id"] = guild_id
        if url:
            doc_metadata["url"] = url

        log_info("Inserting document to RAG", doc_id=doc_id, content_len=len(text))

        try:
            # Generate embedding
            embed_result = await embeddings_service.embed([text])
            if not embed_result or "vectors" not in embed_result:
                raise Exception("Failed to generate embedding")

            embedding = np.array(embed_result["vectors"][0])

            # Add to vector store
            await self.vector_store.add(doc_id, text, embedding, doc_metadata)

            # Add to BM25 index
            await self.bm25_index.add(doc_id, text, doc_metadata)

            log_info("Document inserted successfully", doc_id=doc_id)
            return doc_id

        except Exception as e:
            log_error("Failed to insert document", doc_id=doc_id, error=str(e))
            raise

    async def add_documents(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Batch add multiple documents

        Args:
            documents: List of documents with 'text'/'content', 'source', etc.

        Returns:
            Dict with success count and errors
        """
        if not self.initialized:
            await self.initialize()

        success_count = 0
        errors = []

        log_info("Batch inserting documents", count=len(documents))

        for doc in documents:
            try:
                doc_id = await self.insert(
                    text=doc.get("text", doc.get("content", "")),
                    source=doc.get("source", "unknown"),
                    guild_id=doc.get("guild_id"),
                    metadata=doc.get("metadata"),
                    url=doc.get("url"),
                )

                if doc_id:
                    success_count += 1

            except Exception as e:
                errors.append({"source": doc.get("source", "unknown"), "error": str(e)})

        log_info(
            "Batch document insert completed",
            total=len(documents),
            success=success_count,
            errors=len(errors),
        )

        return {
            "success_count": success_count,
            "errors": errors,
            "total": len(documents),
        }

    async def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document from the RAG system

        Args:
            doc_id: Document ID to delete

        Returns:
            True if successful
        """
        if not self.initialized:
            await self.initialize()

        try:
            # Delete from both stores
            vec_deleted = await self.vector_store.delete(doc_id)
            bm25_deleted = await self.bm25_index.delete(doc_id)

            if vec_deleted or bm25_deleted:
                log_info("Document deleted from RAG", doc_id=doc_id)
                return True
            else:
                log_error("Document not found", doc_id=doc_id)
                return False

        except Exception as e:
            log_error("Failed to delete document", doc_id=doc_id, error=str(e))
            return False

    async def get_stats(self) -> Dict[str, Any]:
        """
        Get RAG system statistics

        Returns:
            Dict with document counts and system status
        """
        if not self.initialized:
            await self.initialize()

        try:
            return {
                "vector_store_documents": self.vector_store.count(),
                "bm25_index_documents": self.bm25_index.count(),
                "reranker_enabled": self.enable_rerank,
                "reranker_initialized": (
                    self.reranker.initialized if self.reranker else False
                ),
                "mongodb_uri": self.mongodb_uri,
                "db_name": self.db_name,
                "status": "operational" if self.initialized else "not_initialized",
            }

        except Exception as e:
            log_error("Failed to get RAG stats", error=str(e))
            return {"error": str(e), "status": "error"}

    async def close(self):
        """Close all components and cleanup"""
        try:
            log_info("Closing RAG service")

            # Close vector store
            if self.vector_store:
                await self.vector_store.close()

            # Close BM25 index
            if self.bm25_index:
                await self.bm25_index.close()

            # Close reranker
            if self.reranker:
                await self.reranker.close()

            self.initialized = False
            log_info("RAG service closed")

        except Exception as e:
            log_error("Error closing RAG service", error=str(e))

    # ========== Internal Search Methods ==========

    async def _semantic_search(
        self, query: str, top_k: int, filter_metadata: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Semantic search using vector embeddings"""
        try:
            # Generate query embedding
            embed_result = await embeddings_service.embed([query])
            if not embed_result or "vectors" not in embed_result:
                log_error("Failed to generate query embedding")
                return []

            query_vector = np.array(embed_result["vectors"][0])

            # Search vector store
            results = await self.vector_store.search(
                query_vector=query_vector, top_k=top_k, filter_metadata=filter_metadata
            )

            log_info("Semantic search completed", results_count=len(results))
            return results

        except Exception as e:
            log_error("Semantic search failed", error=str(e))
            return []

    async def _bm25_search(
        self, query: str, top_k: int, filter_metadata: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """BM25 keyword search"""
        try:
            results = await self.bm25_index.search(
                query=query, top_k=top_k, filter_metadata=filter_metadata
            )

            log_info("BM25 search completed", results_count=len(results))
            return results

        except Exception as e:
            log_error("BM25 search failed", error=str(e))
            return []

    async def _hybrid_search(
        self,
        query: str,
        top_k: int,
        filter_metadata: Optional[Dict[str, Any]],
        alpha: Optional[float],
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining semantic and BM25 using RRF

        Reciprocal Rank Fusion (RRF) formula:
        RRF_score = sum(1 / (k + rank_i)) for each ranker i
        where k=60 is a constant
        """
        # Default alpha: 0.5 = balanced hybrid
        if alpha is None:
            alpha = 0.5

        log_info("Starting hybrid search", alpha=alpha, top_k=top_k)

        # Get results from both methods (request more for better fusion)
        semantic_results = await self._semantic_search(
            query, top_k * 2, filter_metadata
        )
        bm25_results = await self._bm25_search(query, top_k * 2, filter_metadata)

        if not semantic_results and not bm25_results:
            return []

        # Combine using Reciprocal Rank Fusion (RRF)
        combined_scores: Dict[str, Dict[str, Any]] = {}

        # Add semantic scores
        for rank, result in enumerate(semantic_results, 1):
            doc_id = result["doc_id"]
            # RRF score weighted by alpha
            rrf_score = alpha / (60 + rank)

            if doc_id not in combined_scores:
                combined_scores[doc_id] = {"doc": result, "score": 0.0}
            combined_scores[doc_id]["score"] += rrf_score

        # Add BM25 scores
        for rank, result in enumerate(bm25_results, 1):
            doc_id = result["doc_id"]
            # RRF score weighted by (1-alpha)
            rrf_score = (1 - alpha) / (60 + rank)

            if doc_id not in combined_scores:
                combined_scores[doc_id] = {"doc": result, "score": 0.0}
            combined_scores[doc_id]["score"] += rrf_score

        # Sort by combined score
        sorted_results = sorted(
            combined_scores.values(), key=lambda x: x["score"], reverse=True
        )[:top_k]

        # Format results
        results = []
        for item in sorted_results:
            doc = item["doc"].copy()
            doc["score"] = item["score"]
            doc["search_type"] = "hybrid"
            results.append(doc)

        log_info(
            "Hybrid search completed",
            semantic_count=len(semantic_results),
            bm25_count=len(bm25_results),
            final_count=len(results),
        )

        return results
