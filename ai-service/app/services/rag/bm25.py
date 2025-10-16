"""
BM25 Index for keyword-based retrieval
Optimized implementation with persistence and bilingual support
"""

import os
import pickle
from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Okapi
import jieba  # For Chinese tokenization

from app.utils.logger import log_info, log_error


class BM25Index:
    """
    BM25 index for keyword-based search
    Supports both English and Chinese text with persistent storage
    """

    def __init__(
        self, index_path: str = "./data/bm25", k1: float = 1.5, b: float = 0.75
    ):
        """
        Initialize BM25 index

        Args:
            index_path: Directory to store index files
            k1: BM25 k1 parameter (term frequency saturation)
            b: BM25 b parameter (length normalization)
        """
        self.index_path = index_path
        self.k1 = k1
        self.b = b
        self.index: Optional[BM25Okapi] = None
        self.documents: List[Dict[str, Any]] = []
        self.tokenized_corpus: List[List[str]] = []
        self.initialized = False

    async def initialize(self):
        """Initialize BM25 index from disk or create new"""
        log_info("Initializing BM25 index", path=self.index_path)

        # Create directory
        os.makedirs(self.index_path, exist_ok=True)

        # Load existing index
        pkl_path = os.path.join(self.index_path, "bm25_index.pkl")

        if os.path.exists(pkl_path):
            try:
                with open(pkl_path, "rb") as f:
                    data = pickle.load(f)
                    self.documents = data.get("documents", [])
                    self.tokenized_corpus = data.get("tokenized_corpus", [])
                    self.k1 = data.get("k1", self.k1)
                    self.b = data.get("b", self.b)

                if self.tokenized_corpus:
                    self.index = BM25Okapi(
                        self.tokenized_corpus,
                        k1=self.k1,
                        b=self.b,
                    )

                log_info("BM25 index loaded", documents=len(self.documents))

            except Exception as e:
                log_error("Failed to load BM25 index", error=str(e))
                self._create_new_index()
        else:
            self._create_new_index()

        self.initialized = True

    def _create_new_index(self):
        """Create new empty BM25 index"""
        log_info("Creating new BM25 index")
        self.documents = []
        self.tokenized_corpus = []
        self.index = None

    def _tokenize(self, text: str) -> List[str]:
        """
        Tokenize text for BM25 (supports English and Chinese)

        Args:
            text: Input text to tokenize

        Returns:
            List of tokens
        """
        words = []

        # Extract English words (ASCII)
        english_words = [w.lower() for w in text.split() if w.isascii() and w.isalnum()]
        words.extend(english_words)

        # Extract and segment Chinese text
        chinese_text = "".join([c for c in text if not c.isascii()])
        if chinese_text:
            chinese_words = list(jieba.cut(chinese_text))
            words.extend([w for w in chinese_words if len(w) > 1])

        return words

    async def add(self, doc_id: str, content: str, metadata: Dict[str, Any]):
        """
        Add a single document to BM25 index

        Args:
            doc_id: Unique document identifier
            content: Document text content
            metadata: Document metadata
        """
        if not self.initialized:
            await self.initialize()

        tokens = self._tokenize(content)

        doc = {
            "doc_id": doc_id,
            "content": content,
            "metadata": metadata,
        }

        self.documents.append(doc)
        self.tokenized_corpus.append(tokens)

        # Rebuild index
        if self.tokenized_corpus:
            self.index = BM25Okapi(self.tokenized_corpus, k1=self.k1, b=self.b)

        log_info("Document added to BM25", doc_id=doc_id, tokens=len(tokens))

    async def add_documents(self, documents: List[Dict[str, Any]]):
        """
        Batch add multiple documents to BM25 index

        Args:
            documents: List of dicts with 'doc_id', 'content', 'metadata'
        """
        if not self.initialized:
            await self.initialize()

        log_info("Batch adding documents to BM25", count=len(documents))

        for doc in documents:
            doc_id = doc.get("doc_id", doc.get("id"))
            content = doc.get("content", "")
            metadata = doc.get("metadata", {})

            tokens = self._tokenize(content)

            self.documents.append(
                {
                    "doc_id": doc_id,
                    "content": content,
                    "metadata": metadata,
                }
            )
            self.tokenized_corpus.append(tokens)

        # Rebuild index once after all documents added
        if self.tokenized_corpus:
            self.index = BM25Okapi(self.tokenized_corpus, k1=self.k1, b=self.b)

        log_info("BM25 index rebuilt", total_docs=len(self.documents))
        await self.save()

    async def search(
        self,
        query: str,
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search using BM25 algorithm

        Args:
            query: Search query text
            top_k: Number of results to return
            filter_metadata: Optional metadata filters

        Returns:
            List of matching documents with scores
        """
        if not self.initialized or not self.index:
            return []

        # Tokenize query
        query_tokens = self._tokenize(query)

        if not query_tokens:
            return []

        # Get BM25 scores
        scores = self.index.get_scores(query_tokens)

        # Get top-k indices (get extra for filtering)
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[
            : top_k * 2
        ]

        # Build results with filtering
        results = []
        for idx in top_indices:
            if idx >= len(self.documents):
                continue

            doc = self.documents[idx]
            score = float(scores[idx])

            # Apply metadata filters if provided
            if filter_metadata:
                match = all(
                    doc.get("metadata", {}).get(key) == value
                    for key, value in filter_metadata.items()
                )
                if not match:
                    continue

            results.append(
                {
                    "doc_id": doc.get("doc_id"),
                    "chunk": doc.get("content", ""),
                    "source": doc.get("metadata", {}).get("source", "unknown"),
                    "url": doc.get("metadata", {}).get("url"),
                    "guild_id": doc.get("metadata", {}).get("guild_id"),
                    "score": score,
                    "metadata": doc.get("metadata", {}),
                }
            )

            if len(results) >= top_k:
                break

        return results

    async def delete(self, doc_id: str) -> bool:
        """
        Delete a document from BM25 index

        Args:
            doc_id: Document ID to delete

        Returns:
            True if document was found and deleted
        """
        # Find and remove document
        original_count = len(self.documents)
        self.documents = [d for d in self.documents if d.get("doc_id") != doc_id]

        if len(self.documents) == original_count:
            return False

        # Rebuild tokenized corpus and index
        self.tokenized_corpus = []
        for doc in self.documents:
            tokens = self._tokenize(doc.get("content", ""))
            self.tokenized_corpus.append(tokens)

        if self.tokenized_corpus:
            self.index = BM25Okapi(
                self.tokenized_corpus,
                k1=self.k1,
                b=self.b,
            )
        else:
            self.index = None

        log_info("Document deleted from BM25", doc_id=doc_id)
        await self.save()
        return True

    def count(self) -> int:
        """Get total document count"""
        return len(self.documents)

    async def save(self):
        """Persist BM25 index to disk"""
        try:
            pkl_path = os.path.join(self.index_path, "bm25_index.pkl")

            with open(pkl_path, "wb") as f:
                pickle.dump(
                    {
                        "documents": self.documents,
                        "tokenized_corpus": self.tokenized_corpus,
                        "k1": self.k1,
                        "b": self.b,
                    },
                    f,
                )

            log_info("BM25 index saved", documents=len(self.documents))

        except Exception as e:
            log_error("Failed to save BM25 index", error=str(e))

    async def close(self):
        """Close and save BM25 index"""
        if self.initialized:
            await self.save()
            log_info("BM25 index closed")
