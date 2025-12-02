"""
BM25 (Okapi BM25) Probabilistic Information Retrieval Model.

BM25 is a ranking function used by search engines to estimate the relevance
of documents to a given search query. It's based on the probabilistic
retrieval framework developed in the 1970s and 1980s.

Key features:
- Term frequency saturation (diminishing returns for repeated terms)
- Document length normalization
- IDF weighting with smoothing
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np


@dataclass
class BM25Document:
    """A document with its ID, text, and metadata."""
    doc_id: str
    text: str
    tokens: List[str] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


class BM25Retriever:
    """
    Okapi BM25 retrieval model implementation.

    BM25 scoring formula:
    score(D, Q) = sum_{i=1}^{n} IDF(q_i) * (f(q_i, D) * (k1 + 1)) / (f(q_i, D) + k1 * (1 - b + b * |D| / avgdl))

    Where:
    - f(q_i, D) = frequency of term q_i in document D
    - |D| = document length
    - avgdl = average document length
    - k1 = term frequency saturation parameter (typically 1.2-2.0)
    - b = document length normalization parameter (typically 0.75)
    """

    def __init__(
        self,
        k1: float = 1.5,
        b: float = 0.75,
        epsilon: float = 0.25,
    ):
        """
        Initialize BM25 retriever.

        Args:
            k1: Term frequency saturation parameter (1.2-2.0 typical)
            b: Document length normalization (0.75 typical)
            epsilon: Floor for IDF (prevents negative IDF)
        """
        self.k1 = k1
        self.b = b
        self.epsilon = epsilon

        self.documents: List[BM25Document] = []
        self.doc_freqs: Dict[str, int] = defaultdict(int)  # term -> doc count
        self.doc_lengths: List[int] = []
        self.avgdl: float = 0.0
        self.N: int = 0  # total documents
        self.idf: Dict[str, float] = {}

    def _tokenize(self, text: str) -> List[str]:
        """Simple whitespace tokenization with lowercasing."""
        return text.lower().split()

    def _compute_idf(self, term: str) -> float:
        """
        Compute IDF with Robertson-Sparck Jones formula.

        IDF = log((N - n(q) + 0.5) / (n(q) + 0.5) + 1)

        Where n(q) is the number of documents containing term q.
        """
        n_q = self.doc_freqs.get(term, 0)
        idf = math.log((self.N - n_q + 0.5) / (n_q + 0.5) + 1)
        return max(idf, self.epsilon)  # Floor at epsilon

    def fit(self, documents: List[Dict]) -> "BM25Retriever":
        """
        Fit the BM25 model on a corpus.

        Args:
            documents: List of dicts with 'id', 'text', and optional 'metadata'
        """
        self.documents = []
        self.doc_freqs = defaultdict(int)
        self.doc_lengths = []

        for doc in documents:
            doc_id = doc.get("id", str(len(self.documents)))
            text = doc.get("text", doc.get("content", ""))
            metadata = doc.get("metadata", {})
            tokens = self._tokenize(text)

            self.documents.append(BM25Document(
                doc_id=doc_id,
                text=text,
                tokens=tokens,
                metadata=metadata,
            ))

            # Count unique terms in document
            unique_terms = set(tokens)
            for term in unique_terms:
                self.doc_freqs[term] += 1

            self.doc_lengths.append(len(tokens))

        self.N = len(self.documents)
        self.avgdl = sum(self.doc_lengths) / self.N if self.N > 0 else 0

        # Pre-compute IDF for all terms
        self.idf = {term: self._compute_idf(term) for term in self.doc_freqs}

        return self

    def _score_document(self, query_tokens: List[str], doc_idx: int) -> float:
        """Compute BM25 score for a single document."""
        doc = self.documents[doc_idx]
        doc_len = self.doc_lengths[doc_idx]

        # Term frequencies in document
        tf = Counter(doc.tokens)

        score = 0.0
        for term in query_tokens:
            if term not in tf:
                continue

            freq = tf[term]
            idf = self.idf.get(term, self.epsilon)

            # BM25 term score
            numerator = freq * (self.k1 + 1)
            denominator = freq + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
            score += idf * (numerator / denominator)

        return score

    def search(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.0,
    ) -> List[Tuple[BM25Document, float]]:
        """
        Search for documents matching the query.

        Args:
            query: Search query string
            top_k: Number of top results to return
            min_score: Minimum score threshold

        Returns:
            List of (document, score) tuples, sorted by score descending
        """
        if self.N == 0:
            return []

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        # Score all documents
        scores = []
        for idx in range(self.N):
            score = self._score_document(query_tokens, idx)
            if score >= min_score:
                scores.append((idx, score))

        # Sort by score descending
        scores.sort(key=lambda x: x[1], reverse=True)

        # Return top-k results
        results = []
        for idx, score in scores[:top_k]:
            results.append((self.documents[idx], score))

        return results

    def get_scores(self, query: str) -> np.ndarray:
        """
        Get BM25 scores for all documents.

        Args:
            query: Search query string

        Returns:
            Array of scores, one per document
        """
        query_tokens = self._tokenize(query)
        scores = np.zeros(self.N)

        for idx in range(self.N):
            scores[idx] = self._score_document(query_tokens, idx)

        return scores

    def search_with_expansion(
        self,
        query: str,
        top_k: int = 5,
        expansion_docs: int = 3,
        expansion_terms: int = 5,
    ) -> List[Tuple[BM25Document, float]]:
        """
        Search with pseudo-relevance feedback (query expansion).

        1. Initial search
        2. Extract top terms from top documents
        3. Expand query and re-search

        Args:
            query: Original query
            top_k: Number of final results
            expansion_docs: Number of docs to use for expansion
            expansion_terms: Number of terms to add to query
        """
        # Initial search
        initial_results = self.search(query, top_k=expansion_docs)
        if not initial_results:
            return []

        # Extract expansion terms
        term_scores: Dict[str, float] = defaultdict(float)
        query_tokens = set(self._tokenize(query))

        for doc, score in initial_results:
            tf = Counter(doc.tokens)
            for term, freq in tf.items():
                if term not in query_tokens:
                    # Weight by BM25 score and term frequency
                    idf = self.idf.get(term, self.epsilon)
                    term_scores[term] += score * freq * idf

        # Get top expansion terms
        expansion = sorted(term_scores.items(), key=lambda x: x[1], reverse=True)
        expansion_terms_list = [t for t, _ in expansion[:expansion_terms]]

        # Expanded query
        expanded_query = query + " " + " ".join(expansion_terms_list)

        # Re-search with expanded query
        return self.search(expanded_query, top_k=top_k)


class PersonaBM25Retriever:
    """
    BM25 retriever specialized for persona responses.

    Maintains separate indices per persona for more relevant matching.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        """Initialize persona-specific BM25 retrievers."""
        self.retrievers: Dict[str, BM25Retriever] = {}
        self.k1 = k1
        self.b = b
        self._loaded = False

    def load_from_jsonl(self, path: Path) -> "PersonaBM25Retriever":
        """
        Load training data and build persona-specific indices.

        Args:
            path: Path to JSONL training file
        """
        persona_docs: Dict[str, List[Dict]] = defaultdict(list)

        if not path.exists():
            return self

        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                obj = json.loads(line)
                messages = obj.get("messages", [])
                metadata = obj.get("metadata", {})

                persona = metadata.get("character", metadata.get("persona", "default"))
                scenario = metadata.get("scenario", "generic")

                # Extract user and assistant messages
                user_msg = next(
                    (m["content"] for m in messages if m.get("role") == "user"),
                    "",
                )
                reply_msg = next(
                    (m["content"] for m in messages if m.get("role") == "assistant"),
                    "",
                )

                if user_msg and reply_msg:
                    persona_docs[persona].append({
                        "id": f"{persona}_{len(persona_docs[persona])}",
                        "text": user_msg,  # Index by user message
                        "metadata": {
                            "reply": reply_msg,
                            "scenario": scenario,
                            "persona": persona,
                        },
                    })

        # Build retriever for each persona
        for persona, docs in persona_docs.items():
            retriever = BM25Retriever(k1=self.k1, b=self.b)
            retriever.fit(docs)
            self.retrievers[persona] = retriever

        # Build a "default" retriever with all documents
        all_docs = []
        for docs in persona_docs.values():
            all_docs.extend(docs)
        if all_docs:
            default_retriever = BM25Retriever(k1=self.k1, b=self.b)
            default_retriever.fit(all_docs)
            self.retrievers["default"] = default_retriever

        self._loaded = True
        return self

    def search(
        self,
        persona: str,
        query: str,
        top_k: int = 5,
    ) -> List[Tuple[str, float, Dict]]:
        """
        Search for relevant responses for a persona.

        Args:
            persona: Persona name
            query: User message
            top_k: Number of results

        Returns:
            List of (reply_text, score, metadata) tuples
        """
        # Try persona-specific retriever, fall back to default
        retriever = self.retrievers.get(persona, self.retrievers.get("default"))
        if not retriever:
            return []

        results = retriever.search(query, top_k=top_k)

        return [
            (doc.metadata.get("reply", ""), score, doc.metadata)
            for doc, score in results
        ]


# Singleton instance
_PERSONA_BM25: Optional[PersonaBM25Retriever] = None


def get_persona_bm25() -> PersonaBM25Retriever:
    """Get or create singleton PersonaBM25Retriever."""
    global _PERSONA_BM25
    if _PERSONA_BM25 is None:
        _PERSONA_BM25 = PersonaBM25Retriever()
        # Try to load from default training data path
        repo_root = Path(__file__).resolve().parents[3]
        training_path = repo_root / "data" / "training" / "final-complete-training-data.jsonl"
        if training_path.exists():
            _PERSONA_BM25.load_from_jsonl(training_path)
    return _PERSONA_BM25


def bm25_search(
    persona: str,
    query: str,
    top_k: int = 5,
) -> List[Tuple[str, float, Dict]]:
    """
    Convenience function for BM25 search.

    Args:
        persona: Persona name
        query: Search query
        top_k: Number of results

    Returns:
        List of (reply_text, score, metadata) tuples
    """
    return get_persona_bm25().search(persona, query, top_k)
