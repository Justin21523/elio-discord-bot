"""
Tests for N-gram Language Model.
"""
import pytest

from app.services.ngram_lm import (
    NgramStats,
    NgramLanguageModel,
    PersonaNgramModel,
    get_persona_ngram,
    ngram_generate,
)


class TestNgramStats:
    """Test suite for NgramStats dataclass."""

    def test_initialization(self):
        """Test stats initialize with defaults."""
        stats = NgramStats()

        assert stats.total_tokens == 0
        assert stats.unique_tokens == 0
        assert stats.ngram_counts == {}
        assert stats.top_ngrams == {}


class TestNgramLanguageModel:
    """Test suite for NgramLanguageModel."""

    def test_initialization(self):
        """Test model initializes with default parameters."""
        model = NgramLanguageModel()

        assert model.max_order == 3
        assert model.smoothing_alpha == 0.4
        assert model.min_count == 1
        assert model.vocab_size == 0

    def test_initialization_with_params(self):
        """Test model with custom parameters."""
        model = NgramLanguageModel(max_order=4, smoothing_alpha=0.3, min_count=2)

        assert model.max_order == 4
        assert model.smoothing_alpha == 0.3
        assert model.min_count == 2

    def test_max_order_capped_at_5(self):
        """Test max order is capped at 5."""
        model = NgramLanguageModel(max_order=10)

        assert model.max_order == 5

    def test_train_single_sentence(self, sample_corpus):
        """Test training on single sentence."""
        model = NgramLanguageModel()
        model.train([sample_corpus[0]])

        assert model.vocab_size > 0
        assert len(model.vocab) > 0

    def test_train_corpus(self, sample_corpus):
        """Test training on corpus."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        assert model.vocab_size > 0
        # Should have ngrams for each order
        for n in range(1, model.max_order + 1):
            assert len(model.ngrams[n]) > 0

    def test_train_builds_vocabulary(self, sample_corpus):
        """Test training builds vocabulary."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        # Check some expected words are in vocab
        assert "hello" in model.vocab
        assert "universe" in model.vocab

    def test_probability_returns_float(self, sample_corpus):
        """Test probability returns float value."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        prob = model.probability("hello", [])

        assert isinstance(prob, float)
        assert 0 <= prob <= 1

    def test_probability_with_context(self, sample_corpus):
        """Test probability with context."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        prob = model.probability("friend", ["hello"])

        assert isinstance(prob, float)
        assert prob >= 0

    def test_log_probability(self, sample_corpus):
        """Test log probability calculation."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        log_prob = model.log_probability("hello", [])

        assert isinstance(log_prob, float)
        assert log_prob <= 0  # Log of probability <= 0

    def test_generate_returns_string(self, sample_corpus):
        """Test generate returns string."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        generated = model.generate(max_len=10)

        assert isinstance(generated, str)

    def test_generate_with_seed(self, sample_corpus):
        """Test generate with seed text."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        generated = model.generate(seed="hello", max_len=10)

        assert isinstance(generated, str)

    def test_generate_respects_max_len(self, sample_corpus):
        """Test generate respects max length."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        generated = model.generate(max_len=5)

        # Should have at most 5 words
        assert len(generated.split()) <= 5

    def test_generate_with_temperature(self, sample_corpus):
        """Test generate with different temperatures."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        # Low temperature should be more deterministic
        gen_low = model.generate(temperature=0.1, max_len=10)
        # High temperature should be more random
        gen_high = model.generate(temperature=2.0, max_len=10)

        assert isinstance(gen_low, str)
        assert isinstance(gen_high, str)

    def test_perplexity_returns_positive_float(self, sample_corpus):
        """Test perplexity returns positive float."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        perp = model.perplexity("hello friend how are you")

        assert isinstance(perp, float)
        assert perp > 0

    def test_perplexity_lower_for_training_data(self, sample_corpus):
        """Test perplexity is lower for training data."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        # Training data should have lower perplexity
        train_perp = model.perplexity(sample_corpus[0])
        # Random text should have higher perplexity
        random_perp = model.perplexity("xyz abc qrs completely random")

        assert train_perp < random_perp

    def test_perplexity_empty_text(self, sample_corpus):
        """Test perplexity of empty text is infinity."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        perp = model.perplexity("")

        assert perp == float("inf")

    def test_get_stats(self, sample_corpus):
        """Test get_stats returns NgramStats."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        stats = model.get_stats()

        assert isinstance(stats, NgramStats)
        assert stats.total_tokens > 0
        assert stats.unique_tokens > 0
        assert len(stats.ngram_counts) > 0

    def test_backoff_smoothing(self, sample_corpus):
        """Test backoff smoothing for unseen ngrams."""
        model = NgramLanguageModel()
        model.train(sample_corpus)

        # Unseen word should still get non-zero probability through backoff
        prob = model.probability("xyzunseenword", ["the"])

        assert prob > 0


class TestPersonaNgramModel:
    """Test suite for PersonaNgramModel."""

    def test_initialization(self):
        """Test persona model initializes correctly."""
        model = PersonaNgramModel()

        assert model.max_order == 3
        assert model._loaded == False
        assert len(model.models) == 0

    def test_load_from_jsonl(self, training_data_path):
        """Test loading from JSONL file."""
        model = PersonaNgramModel()
        model.load_from_jsonl(training_data_path)

        assert model._loaded == True
        assert len(model.models) > 0

    def test_load_creates_persona_models(self, training_data_path):
        """Test loading creates persona-specific models."""
        model = PersonaNgramModel()
        model.load_from_jsonl(training_data_path)

        assert "Elio" in model.models
        assert "Glordon" in model.models
        assert "Olga" in model.models
        assert "default" in model.models

    def test_generate_for_persona(self, training_data_path):
        """Test generating for specific persona."""
        model = PersonaNgramModel()
        model.load_from_jsonl(training_data_path)

        generated = model.generate("Elio", max_len=10)

        assert isinstance(generated, str)

    def test_generate_fallback_to_default(self, training_data_path):
        """Test generate falls back to default for unknown persona."""
        model = PersonaNgramModel()
        model.load_from_jsonl(training_data_path)

        generated = model.generate("UnknownPersona", max_len=10)

        assert isinstance(generated, str)

    def test_generate_with_seed(self, training_data_path):
        """Test generating with seed text."""
        model = PersonaNgramModel()
        model.load_from_jsonl(training_data_path)

        generated = model.generate("Glordon", seed="friend", max_len=10)

        assert isinstance(generated, str)

    def test_probability_returns_score(self, training_data_path):
        """Test probability returns score."""
        model = PersonaNgramModel()
        model.load_from_jsonl(training_data_path)

        score = model.probability("Elio", "The universe is amazing")

        assert isinstance(score, float)
        assert 0 <= score <= 1

    def test_probability_empty_model(self):
        """Test probability on empty model returns 0."""
        model = PersonaNgramModel()

        score = model.probability("Elio", "test")

        assert score == 0.0

    def test_load_nonexistent_path(self, tmp_path):
        """Test loading from nonexistent path."""
        model = PersonaNgramModel()
        nonexistent_path = tmp_path / "nonexistent.jsonl"

        model.load_from_jsonl(nonexistent_path)

        assert model._loaded == False


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_persona_ngram_returns_instance(self):
        """Test get_persona_ngram returns model."""
        model = get_persona_ngram()

        assert isinstance(model, PersonaNgramModel)

    def test_get_persona_ngram_singleton(self):
        """Test get_persona_ngram returns same instance."""
        m1 = get_persona_ngram()
        m2 = get_persona_ngram()

        assert m1 is m2

    def test_ngram_generate_convenience(self):
        """Test ngram_generate convenience function."""
        generated = ngram_generate("Elio", max_len=10)

        assert isinstance(generated, str)
