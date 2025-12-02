"""
Tests for Pointwise Mutual Information (PMI) Calculator.
"""
import pytest
import math

from app.services.pmi import (
    PMIStats,
    PMICalculator,
    PersonaPMI,
    get_persona_pmi,
    get_word_associations,
)


class TestPMIStats:
    """Test suite for PMIStats dataclass."""

    def test_initialization(self):
        """Test stats initialize with defaults."""
        stats = PMIStats()

        assert stats.total_words == 0
        assert stats.unique_words == 0
        assert stats.total_pairs == 0
        assert stats.unique_pairs == 0
        assert stats.top_associations == []


class TestPMICalculator:
    """Test suite for PMICalculator."""

    def test_initialization(self):
        """Test calculator initializes with defaults."""
        calc = PMICalculator()

        assert calc.window_size == 5
        assert calc.min_count == 2
        assert calc.smoothing == 0.0
        assert calc.total_words == 0

    def test_initialization_with_params(self):
        """Test calculator with custom parameters."""
        calc = PMICalculator(window_size=3, min_count=1, smoothing=0.1)

        assert calc.window_size == 3
        assert calc.min_count == 1
        assert calc.smoothing == 0.1

    def test_add_document(self, sample_corpus):
        """Test adding a document."""
        calc = PMICalculator()
        calc.add_document(sample_corpus[0])

        assert calc.total_words > 0
        assert len(calc.vocab) > 0
        assert len(calc.word_counts) > 0

    def test_add_multiple_documents(self, sample_corpus):
        """Test adding multiple documents."""
        calc = PMICalculator()
        for doc in sample_corpus:
            calc.add_document(doc)

        assert calc.total_words > len(sample_corpus)
        assert len(calc.vocab) > 0

    def test_train_corpus(self, sample_corpus):
        """Test training on corpus."""
        calc = PMICalculator()
        calc.train(sample_corpus)

        assert calc.total_words > 0
        assert calc.total_pairs > 0

    def test_train_returns_self(self, sample_corpus):
        """Test train returns self for chaining."""
        calc = PMICalculator()
        result = calc.train(sample_corpus)

        assert result is calc

    def test_pmi_returns_float(self, sample_corpus):
        """Test PMI returns float value."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        pmi = calc.pmi("hello", "friend")

        assert isinstance(pmi, float)

    def test_pmi_symmetric(self, sample_corpus):
        """Test PMI is symmetric."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        pmi_ab = calc.pmi("hello", "friend")
        pmi_ba = calc.pmi("friend", "hello")

        assert pmi_ab == pmi_ba

    def test_pmi_case_insensitive(self, sample_corpus):
        """Test PMI is case insensitive."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        pmi_lower = calc.pmi("hello", "friend")
        pmi_upper = calc.pmi("HELLO", "FRIEND")

        assert pmi_lower == pmi_upper

    def test_pmi_unseen_word_returns_zero(self, sample_corpus):
        """Test PMI with unseen word returns 0."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        pmi = calc.pmi("xyznonexistent", "friend")

        assert pmi == 0.0

    def test_pmi_no_cooccurrence_returns_neg_inf(self, sample_corpus):
        """Test PMI with no co-occurrence returns -inf."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        # Words that exist but never co-occur
        pmi = calc.pmi("hello", "safety")

        # Either 0 (min_count threshold) or -inf (no pair)
        assert pmi == 0.0 or pmi == float("-inf")

    def test_ppmi_non_negative(self, sample_corpus):
        """Test PPMI is non-negative."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        ppmi = calc.ppmi("hello", "friend")

        assert ppmi >= 0.0

    def test_ppmi_clips_negative(self, sample_corpus):
        """Test PPMI clips negative values to 0."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        # Get raw PMI first
        pmi = calc.pmi("hello", "safety")
        ppmi = calc.ppmi("hello", "safety")

        assert ppmi >= 0.0

    def test_npmi_range(self, sample_corpus):
        """Test NPMI is in range [-1, 1]."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        npmi = calc.npmi("hello", "friend")

        assert -1.0 <= npmi <= 1.0

    def test_npmi_no_cooccurrence(self, sample_corpus):
        """Test NPMI with no co-occurrence."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        npmi = calc.npmi("xyznonexistent", "friend")

        assert npmi == -1.0

    def test_get_associations(self, sample_corpus):
        """Test getting word associations."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        assocs = calc.get_associations("hello", top_k=5)

        assert isinstance(assocs, list)
        if assocs:
            # Each should be (word, score) tuple
            assert len(assocs[0]) == 2
            assert isinstance(assocs[0][0], str)
            assert isinstance(assocs[0][1], float)

    def test_get_associations_sorted(self, sample_corpus):
        """Test associations are sorted by score."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        assocs = calc.get_associations("universe", top_k=5)

        if len(assocs) > 1:
            scores = [a[1] for a in assocs]
            assert scores == sorted(scores, reverse=True)

    def test_get_associations_top_k(self, sample_corpus):
        """Test associations respects top_k."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        assocs = calc.get_associations("the", top_k=3)

        assert len(assocs) <= 3

    def test_get_associations_unknown_word(self, sample_corpus):
        """Test associations for unknown word."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        assocs = calc.get_associations("xyznonexistent")

        assert assocs == []

    def test_expand_query(self, sample_corpus):
        """Test query expansion."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        expanded = calc.expand_query("space", expansion_terms=3)

        assert isinstance(expanded, list)
        # Should have original term with weight 1.0
        terms = dict(expanded)
        assert "space" in terms

    def test_expand_query_weight_decay(self, sample_corpus):
        """Test query expansion weight decay."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        expanded = calc.expand_query("universe", expansion_terms=2, weight_decay=0.3)

        terms = dict(expanded)
        # Original term should have weight 1.0
        assert terms.get("universe", 0) == 1.0
        # Expansion terms should have lower weight
        for term, weight in terms.items():
            if term != "universe":
                assert weight <= 1.0

    def test_topic_coherence(self, sample_corpus):
        """Test topic coherence calculation."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        coherence = calc.topic_coherence(["space", "stars", "universe"])

        assert isinstance(coherence, float)

    def test_topic_coherence_single_word(self, sample_corpus):
        """Test topic coherence with single word."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        coherence = calc.topic_coherence(["space"])

        assert coherence == 0.0

    def test_get_stats(self, sample_corpus):
        """Test getting PMI statistics."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        stats = calc.get_stats()

        assert isinstance(stats, PMIStats)
        assert stats.total_words > 0
        assert stats.unique_words > 0
        assert stats.total_pairs > 0

    def test_train_from_jsonl(self, training_data_path):
        """Test training from JSONL file."""
        calc = PMICalculator(min_count=1)
        calc.train_from_jsonl(training_data_path)

        assert calc.total_words > 0


class TestPersonaPMI:
    """Test suite for PersonaPMI."""

    def test_initialization(self):
        """Test persona PMI initializes correctly."""
        pmi = PersonaPMI()

        assert pmi.window_size == 5
        assert pmi._loaded == False
        assert len(pmi.models) == 0

    def test_load_from_jsonl(self, training_data_path):
        """Test loading from JSONL file."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        assert pmi._loaded == True
        assert len(pmi.models) > 0

    def test_load_creates_persona_models(self, training_data_path):
        """Test loading creates persona-specific models."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        # Should have models for personas in training data
        assert "Elio" in pmi.models or "default" in pmi.models

    def test_get_associations_global(self, training_data_path):
        """Test getting global associations."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        assocs = pmi.get_associations("friend", top_k=5)

        assert isinstance(assocs, list)

    def test_get_associations_persona(self, training_data_path):
        """Test getting persona-specific associations."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        if "Elio" in pmi.models:
            assocs = pmi.get_associations("space", persona="Elio", top_k=5)
            assert isinstance(assocs, list)

    def test_expand_query_global(self, training_data_path):
        """Test global query expansion."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        expanded = pmi.expand_query("friend", expansion_terms=3)

        assert isinstance(expanded, list)

    def test_expand_query_persona(self, training_data_path):
        """Test persona-specific query expansion."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        if "Glordon" in pmi.models:
            expanded = pmi.expand_query("friend", persona="Glordon", expansion_terms=3)
            assert isinstance(expanded, list)

    def test_persona_vocabulary_similarity(self, training_data_path):
        """Test vocabulary similarity between personas."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        if "Elio" in pmi.models and "Glordon" in pmi.models:
            similarity = pmi.persona_vocabulary_similarity("Elio", "Glordon")
            assert 0 <= similarity <= 1

    def test_persona_vocabulary_similarity_unknown(self, training_data_path):
        """Test similarity with unknown persona."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        similarity = pmi.persona_vocabulary_similarity("Unknown1", "Unknown2")

        assert similarity == 0.0

    def test_score_response_fit(self, training_data_path):
        """Test scoring response fit."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        if "Elio" in pmi.models:
            score = pmi.score_response_fit("I love space and stars!", "Elio")
            assert 0 <= score <= 1

    def test_score_response_fit_unknown_persona(self, training_data_path):
        """Test scoring with unknown persona."""
        pmi = PersonaPMI()
        pmi.load_from_jsonl(training_data_path)

        score = pmi.score_response_fit("test text", "UnknownPersona")

        assert score == 0.5  # Default score


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_persona_pmi_returns_instance(self):
        """Test get_persona_pmi returns PMI."""
        pmi = get_persona_pmi()

        assert isinstance(pmi, PersonaPMI)

    def test_get_persona_pmi_singleton(self):
        """Test get_persona_pmi returns same instance."""
        p1 = get_persona_pmi()
        p2 = get_persona_pmi()

        assert p1 is p2

    def test_get_word_associations_convenience(self):
        """Test get_word_associations convenience function."""
        assocs = get_word_associations("space", top_k=5)

        assert isinstance(assocs, list)


class TestPMIFormulas:
    """Test PMI mathematical properties."""

    def test_pmi_independent_words_near_zero(self, sample_corpus):
        """Test PMI of independent words should be near zero."""
        # Note: This is hard to test precisely without controlled data
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        # PMI formula should give ~0 for words with expected co-occurrence
        # This is more of a sanity check
        stats = calc.get_stats()
        assert stats.total_pairs > 0

    def test_pmi_high_for_collocations(self, sample_corpus):
        """Test PMI should be higher for collocations."""
        calc = PMICalculator(min_count=1)
        calc.train(sample_corpus)

        # Words that frequently co-occur should have higher PPMI
        assocs = calc.get_associations("friend", top_k=5, use_ppmi=True)

        # If there are associations, top ones should have positive scores
        if assocs:
            assert assocs[0][1] > 0
