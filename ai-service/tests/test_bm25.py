"""
Tests for BM25 Retriever.
"""
import pytest

from app.services.bm25 import (
    BM25Document,
    BM25Retriever,
    PersonaBM25Retriever,
    get_persona_bm25,
    bm25_search,
)


class TestBM25Document:
    """Test suite for BM25Document dataclass."""

    def test_initialization(self):
        """Test document initializes correctly."""
        doc = BM25Document(doc_id="test_1", text="Hello world")

        assert doc.doc_id == "test_1"
        assert doc.text == "Hello world"
        assert doc.tokens == []
        assert doc.metadata == {}

    def test_initialization_with_all_params(self):
        """Test document with all parameters."""
        doc = BM25Document(
            doc_id="test_2",
            text="Test text",
            tokens=["test", "text"],
            metadata={"key": "value"},
        )

        assert doc.tokens == ["test", "text"]
        assert doc.metadata == {"key": "value"}


class TestBM25Retriever:
    """Test suite for BM25Retriever."""

    def test_initialization(self):
        """Test retriever initializes with default parameters."""
        retriever = BM25Retriever()

        assert retriever.k1 == 1.5
        assert retriever.b == 0.75
        assert retriever.epsilon == 0.25
        assert retriever.N == 0

    def test_initialization_with_params(self):
        """Test retriever with custom parameters."""
        retriever = BM25Retriever(k1=2.0, b=0.5, epsilon=0.1)

        assert retriever.k1 == 2.0
        assert retriever.b == 0.5
        assert retriever.epsilon == 0.1

    def test_fit_single_document(self, sample_documents):
        """Test fitting with a single document."""
        retriever = BM25Retriever()
        retriever.fit([sample_documents[0]])

        assert retriever.N == 1
        assert len(retriever.documents) == 1
        assert retriever.avgdl > 0

    def test_fit_multiple_documents(self, sample_documents):
        """Test fitting with multiple documents."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        assert retriever.N == len(sample_documents)
        assert len(retriever.documents) == len(sample_documents)

    def test_fit_builds_idf(self, sample_documents):
        """Test that fit builds IDF dictionary."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        assert len(retriever.idf) > 0
        # Common words should have lower IDF
        assert "the" in retriever.idf

    def test_search_returns_results(self, sample_documents):
        """Test search returns relevant results."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        results = retriever.search("space exploration")

        assert len(results) > 0
        assert all(isinstance(r, tuple) for r in results)
        assert all(isinstance(r[0], BM25Document) for r in results)
        assert all(isinstance(r[1], float) for r in results)

    def test_search_top_k_limit(self, sample_documents):
        """Test search respects top_k parameter."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        results = retriever.search("universe", top_k=2)

        assert len(results) <= 2

    def test_search_min_score_filter(self, sample_documents):
        """Test search respects min_score threshold."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        results = retriever.search("xyz123nonexistent", min_score=1.0)

        assert len(results) == 0

    def test_search_empty_query(self, sample_documents):
        """Test search with empty query returns empty results."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        results = retriever.search("")

        assert results == []

    def test_search_unfitted_returns_empty(self):
        """Test search on unfitted retriever returns empty."""
        retriever = BM25Retriever()

        results = retriever.search("test query")

        assert results == []

    def test_search_results_sorted_by_score(self, sample_documents):
        """Test search results are sorted by descending score."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        results = retriever.search("universe stars", top_k=5)

        scores = [r[1] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_get_scores_returns_array(self, sample_documents):
        """Test get_scores returns numpy array."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        scores = retriever.get_scores("space")

        assert len(scores) == retriever.N
        assert all(s >= 0 for s in scores)

    def test_search_with_expansion(self, sample_documents):
        """Test pseudo-relevance feedback search."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        results = retriever.search_with_expansion(
            "space",
            top_k=3,
            expansion_docs=2,
            expansion_terms=3,
        )

        assert isinstance(results, list)
        # Should return results
        assert len(results) <= 3

    def test_relevance_ranking(self, sample_documents):
        """Test that relevant documents rank higher."""
        retriever = BM25Retriever()
        retriever.fit(sample_documents)

        # Search for space-related query
        results = retriever.search("space exploration stars")

        if results:
            # Top result should contain space-related content
            top_doc = results[0][0]
            assert "space" in top_doc.text.lower() or "stars" in top_doc.text.lower()


class TestPersonaBM25Retriever:
    """Test suite for PersonaBM25Retriever."""

    def test_initialization(self):
        """Test persona retriever initializes correctly."""
        retriever = PersonaBM25Retriever()

        assert retriever.k1 == 1.5
        assert retriever.b == 0.75
        assert retriever._loaded == False
        assert len(retriever.retrievers) == 0

    def test_load_from_jsonl(self, training_data_path):
        """Test loading from JSONL file."""
        retriever = PersonaBM25Retriever()
        retriever.load_from_jsonl(training_data_path)

        assert retriever._loaded == True
        assert len(retriever.retrievers) > 0
        assert "default" in retriever.retrievers

    def test_load_creates_persona_indices(self, training_data_path):
        """Test that loading creates persona-specific indices."""
        retriever = PersonaBM25Retriever()
        retriever.load_from_jsonl(training_data_path)

        # Should have Elio, Glordon, Olga from sample data
        assert "Elio" in retriever.retrievers
        assert "Glordon" in retriever.retrievers
        assert "Olga" in retriever.retrievers

    def test_search_specific_persona(self, training_data_path):
        """Test search for specific persona."""
        retriever = PersonaBM25Retriever()
        retriever.load_from_jsonl(training_data_path)

        results = retriever.search("Elio", "What about space?", top_k=3)

        assert isinstance(results, list)
        if results:
            # Should return (reply, score, metadata) tuples
            assert len(results[0]) == 3
            assert isinstance(results[0][0], str)  # reply text
            assert isinstance(results[0][1], float)  # score
            assert isinstance(results[0][2], dict)  # metadata

    def test_search_fallback_to_default(self, training_data_path):
        """Test search falls back to default for unknown persona."""
        retriever = PersonaBM25Retriever()
        retriever.load_from_jsonl(training_data_path)

        results = retriever.search("UnknownPersona", "Hello", top_k=3)

        # Should still return results from default index
        assert isinstance(results, list)

    def test_search_empty_retriever(self):
        """Test search on empty retriever returns empty."""
        retriever = PersonaBM25Retriever()

        results = retriever.search("Elio", "test", top_k=3)

        assert results == []

    def test_load_nonexistent_path(self, tmp_path):
        """Test loading from nonexistent path."""
        retriever = PersonaBM25Retriever()
        nonexistent_path = tmp_path / "nonexistent.jsonl"

        retriever.load_from_jsonl(nonexistent_path)

        assert retriever._loaded == False


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_persona_bm25_returns_instance(self):
        """Test get_persona_bm25 returns retriever."""
        retriever = get_persona_bm25()

        assert isinstance(retriever, PersonaBM25Retriever)

    def test_get_persona_bm25_singleton(self):
        """Test get_persona_bm25 returns same instance."""
        r1 = get_persona_bm25()
        r2 = get_persona_bm25()

        assert r1 is r2

    def test_bm25_search_convenience(self):
        """Test bm25_search convenience function."""
        results = bm25_search("Elio", "space", top_k=3)

        assert isinstance(results, list)
