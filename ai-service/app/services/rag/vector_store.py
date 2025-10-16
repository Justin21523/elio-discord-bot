"""
Vector Store for RAG - FAISS-based implementation
Efficient similarity search with persistent storage
"""

import os
import pickle
import numpy as np
from typing import List, Dict, Any, Optional
import faiss

from app.utils.logger import log_info, log_error


class Document:
    """Document with vector embedding and metadata"""

    def __init__(
        self,
        doc_id: str,
        content: str,
        metadata: Dict[str, Any],
        embedding: Optional[np.ndarray] = None,
    ):
        self.doc_id = doc_id
        self.content = content
        self.metadata = metadata
        self.embedding = embedding


class VectorStore:
    """
    Vector store using FAISS for efficient similarity search
    Supports cosine similarity and Euclidean distance
    """

    def __init__(
        self,
        dimension: int = 1024,
        metric: str = "cosine",
        index_path: str = "./data/vectors",
    ):
        """
        Initialize vector store

        Args:
            dimension: Embedding vector dimension
            metric: Distance metric ('cosine', 'euclidean', or 'dot')
            index_path: Directory to store index files
        """
        self.dimension = dimension
        self.metric = metric
        self.index_path = index_path
        self.index: Optional[faiss.Index] = None
        self.documents: List[Document] = []
        self.initialized = False

    async def initialize(self):
        """Initialize vector store from disk or create new"""
        log_info(
            "Initializing vector store",
            dimension=self.dimension,
            metric=self.metric,
            path=self.index_path,
        )

        # Create directory
        os.makedirs(self.index_path, exist_ok=True)

        # Paths
        index_file = os.path.join(self.index_path, "index.faiss")
        docs_file = os.path.join(self.index_path, "documents.pkl")

        # Load existing index if available
        if os.path.exists(index_file) and os.path.exists(docs_file):
            try:
                self.index = faiss.read_index(index_file)

                with open(docs_file, "rb") as f:
                    self.documents = pickle.load(f)

                log_info(
                    "Vector store loaded",
                    documents=len(self.documents),
                    index_size=self.index.ntotal,  # type: ignore
                )

            except Exception as e:
                log_error("Failed to load vector store", error=str(e))
                self._create_new_index()
        else:
            self._create_new_index()

        self.initialized = True

    def _create_new_index(self):
        """Create new FAISS index based on metric"""
        log_info("Creating new vector index", metric=self.metric)

        if self.metric == "cosine":
            # Inner product with normalized vectors = cosine similarity
            self.index = faiss.IndexFlatIP(self.dimension)
        elif self.metric == "euclidean":
            self.index = faiss.IndexFlatL2(self.dimension)
        else:  # dot product
            self.index = faiss.IndexFlatIP(self.dimension)

        self.documents = []

    async def add(
        self, doc_id: str, content: str, embedding: np.ndarray, metadata: Dict[str, Any]
    ):
        """
        Add a single document to vector store

        Args:
            doc_id: Unique document identifier
            content: Document text content
            embedding: Vector embedding
            metadata: Document metadata
        """
        if not self.initialized:
            await self.initialize()

        # Normalize if using cosine similarity
        vector = embedding.copy()
        if self.metric == "cosine":
            norm = np.linalg.norm(vector)
            if norm > 0:
                vector = vector / norm

        # Add to FAISS index
        vector_array = np.array([vector]).astype("float32")
        self.index.add(vector_array)  # type: ignore

        # Store document
        doc = Document(
            doc_id=doc_id, content=content, metadata=metadata, embedding=vector
        )
        self.documents.append(doc)

        log_info("Document added to vector store", doc_id=doc_id)

    async def add_documents(self, documents: List[Document]):
        """
        Batch add multiple documents to vector store

        Args:
            documents: List of Document objects with embeddings
        """
        if not self.initialized:
            await self.initialize()

        log_info("Batch adding documents to vector store", count=len(documents))

        # Prepare vectors
        vectors = []
        valid_docs = []

        for doc in documents:
            if doc.embedding is None:
                log_error("Document missing embedding", doc_id=doc.doc_id)
                continue

            vector = doc.embedding.copy()

            # Normalize if using cosine similarity
            if self.metric == "cosine":
                norm = np.linalg.norm(vector)
                if norm > 0:
                    vector = vector / norm

            vectors.append(vector)
            valid_docs.append(doc)

        if vectors:
            # Add all vectors at once
            vectors_array = np.array(vectors).astype("float32")
            self.index.add(vectors_array)  # type: ignore

            # Store documents
            self.documents.extend(valid_docs)

            log_info(
                "Documents added", count=len(vectors), total_docs=len(self.documents)
            )

            # Save to disk
            await self.save()

    async def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents using vector similarity

        Args:
            query_vector: Query embedding vector
            top_k: Number of results to return
            filter_metadata: Optional metadata filters

        Returns:
            List of matching documents with similarity scores
        """
        if not self.initialized or self.index.ntotal == 0:  # type: ignore
            return []

        # Normalize query if using cosine similarity
        query = query_vector.copy()
        if self.metric == "cosine":
            norm = np.linalg.norm(query)
            if norm > 0:
                query = query / norm

        # Search FAISS index (get extra results for filtering)
        query_array = np.array([query]).astype("float32")
        search_k = min(top_k * 2, self.index.ntotal)  # type: ignore
        scores, indices = self.index.search(query_array, search_k)  # type: ignore

        # Build results with filtering
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.documents):
                continue

            doc = self.documents[idx]

            # Apply metadata filters if provided
            if filter_metadata:
                match = all(
                    doc.metadata.get(key) == value
                    for key, value in filter_metadata.items()
                )
                if not match:
                    continue

            results.append(
                {
                    "doc_id": doc.doc_id,
                    "chunk": doc.content,
                    "source": doc.metadata.get("source", "unknown"),
                    "url": doc.metadata.get("url"),
                    "guild_id": doc.metadata.get("guild_id"),
                    "score": float(score),
                    "metadata": doc.metadata,
                }
            )

            if len(results) >= top_k:
                break

        return results

    async def delete(self, doc_id: str) -> bool:
        """
        Delete a document from vector store
        Note: FAISS doesn't support efficient deletion, requires rebuild

        Args:
            doc_id: Document ID to delete

        Returns:
            True if document was found and deleted
        """
        # Find document index
        doc_idx = None
        for i, doc in enumerate(self.documents):
            if doc.doc_id == doc_id:
                doc_idx = i
                break

        if doc_idx is None:
            return False

        # Remove document
        self.documents.pop(doc_idx)

        # Rebuild FAISS index (necessary for deletion)
        self._create_new_index()

        if self.documents:
            vectors = []
            for doc in self.documents:
                if doc.embedding is not None:
                    vectors.append(doc.embedding)

            if vectors:
                vectors_array = np.array(vectors).astype("float32")
                self.index.add(vectors_array)  # type: ignore

        log_info("Document deleted from vector store", doc_id=doc_id)
        await self.save()
        return True

    def count(self) -> int:
        """Get total document count"""
        return len(self.documents)

    async def save(self):
        """Persist vector store to disk"""
        try:
            index_file = os.path.join(self.index_path, "index.faiss")
            docs_file = os.path.join(self.index_path, "documents.pkl")

            # Save FAISS index
            faiss.write_index(self.index, index_file)

            # Save documents
            with open(docs_file, "wb") as f:
                pickle.dump(self.documents, f)

            log_info("Vector store saved", documents=len(self.documents))

        except Exception as e:
            log_error("Failed to save vector store", error=str(e))

    async def close(self):
        """Close and save vector store"""
        if self.initialized:
            await self.save()
            log_info("Vector store closed")
