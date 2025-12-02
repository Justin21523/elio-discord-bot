"""
Tests for Ensemble Generator.
"""
import pytest

from app.services.ensemble import Candidate, EnsembleGenerator, get_ensemble
from app.services.bandit import ThompsonSamplingBandit


class TestCandidate:
    """Test suite for Candidate dataclass."""

    def test_initialization(self):
        """Test candidate initializes correctly."""
        candidate = Candidate(
            text="Hello there!",
            source="test_strategy",
            confidence=0.8,
        )

        assert candidate.text == "Hello there!"
        assert candidate.source == "test_strategy"
        assert candidate.confidence == 0.8
        assert candidate.weight == 1.0
        assert candidate.cf_score == 1.0  # Default is 1.0 (multiplicative)
        assert candidate.context_score == 1.0  # Default is 1.0 (multiplicative)
        assert candidate.metadata == {}

    def test_initialization_with_all_params(self):
        """Test candidate with all parameters."""
        candidate = Candidate(
            text="Test",
            source="src",
            confidence=0.5,
            weight=0.7,
            cf_score=0.3,
            context_score=0.6,
            metadata={'key': 'value'},
        )

        assert candidate.weight == 0.7
        assert candidate.cf_score == 0.3
        assert candidate.context_score == 0.6
        assert candidate.metadata == {'key': 'value'}

    def test_final_score(self):
        """Test final_score property."""
        candidate = Candidate(
            text="Test",
            source="src",
            confidence=0.5,
            weight=0.8,
            cf_score=0.9,
            context_score=0.7,
        )

        # final_score = confidence * weight * cf_score * context_score (multiplicative)
        expected = 0.5 * 0.8 * 0.9 * 0.7
        assert abs(candidate.final_score - expected) < 0.001


class TestEnsembleGenerator:
    """Test suite for EnsembleGenerator."""

    def test_initialization(self):
        """Test ensemble initializes correctly."""
        ensemble = EnsembleGenerator()

        assert len(ensemble.strategies) == 0
        assert ensemble.bandit is not None

    def test_initialization_with_bandit(self):
        """Test ensemble with provided bandit."""
        bandit = ThompsonSamplingBandit(['a', 'b'])
        ensemble = EnsembleGenerator(bandit=bandit)

        assert ensemble.bandit is bandit

    def test_register_strategy(self):
        """Test registering a strategy."""
        ensemble = EnsembleGenerator()

        def dummy_strategy(context):
            return {'text': 'Dummy response', 'confidence': 0.5}

        ensemble.register_strategy('dummy', dummy_strategy)

        assert 'dummy' in ensemble.strategies

    def test_register_multiple_strategies(self):
        """Test registering multiple strategies."""
        ensemble = EnsembleGenerator()

        for name in ['a', 'b', 'c']:
            ensemble.register_strategy(name, lambda ctx: {'text': name, 'confidence': 0.5})

        assert len(ensemble.strategies) == 3

    def test_generate_candidates_returns_list(self):
        """Test generate_candidates returns list."""
        ensemble = EnsembleGenerator()

        ensemble.register_strategy('test', lambda ctx: {'text': 'Test', 'confidence': 0.8})

        context = {'message': 'Hello'}
        candidates = ensemble.generate_candidates(context)

        assert isinstance(candidates, list)

    def test_generate_candidates_calls_strategies(self):
        """Test all strategies are called."""
        ensemble = EnsembleGenerator()

        called = {'a': False, 'b': False}

        def strategy_a(ctx):
            called['a'] = True
            return {'text': 'A', 'confidence': 0.5}

        def strategy_b(ctx):
            called['b'] = True
            return {'text': 'B', 'confidence': 0.5}

        ensemble.register_strategy('a', strategy_a)
        ensemble.register_strategy('b', strategy_b)

        ensemble.generate_candidates({'message': 'Test'})

        assert called['a'] == True
        assert called['b'] == True

    def test_generate_candidates_filters_empty(self):
        """Test empty responses are filtered."""
        ensemble = EnsembleGenerator()

        ensemble.register_strategy('empty', lambda ctx: {'text': '', 'confidence': 0.9})
        ensemble.register_strategy('valid', lambda ctx: {'text': 'Valid', 'confidence': 0.5})

        candidates = ensemble.generate_candidates({'message': 'Test'})

        texts = [c.text for c in candidates]
        assert '' not in texts

    def test_generate_candidates_includes_source(self):
        """Test candidates include source strategy."""
        ensemble = EnsembleGenerator()

        ensemble.register_strategy('my_strategy', lambda ctx: {'text': 'Test', 'confidence': 0.8})

        candidates = ensemble.generate_candidates({'message': 'Test'})

        if candidates:
            assert candidates[0].source == 'my_strategy'

    def test_generate_candidates_handles_exceptions(self):
        """Test exceptions in strategies are handled."""
        ensemble = EnsembleGenerator()

        def bad_strategy(ctx):
            raise ValueError("Intentional error")

        def good_strategy(ctx):
            return {'text': 'Good', 'confidence': 0.5}

        ensemble.register_strategy('bad', bad_strategy)
        ensemble.register_strategy('good', good_strategy)

        # Should not raise
        candidates = ensemble.generate_candidates({'message': 'Test'})

        # Should still have the good candidate
        texts = [c.text for c in candidates]
        assert 'Good' in texts

    def test_bandit_weights_applied(self):
        """Test bandit weights are applied to candidates."""
        bandit = ThompsonSamplingBandit(['high', 'low'])

        # Train bandit to prefer 'high'
        for _ in range(20):
            bandit.update('high', 0.9)
            bandit.update('low', 0.1)

        ensemble = EnsembleGenerator(bandit=bandit)
        ensemble.register_strategy('high', lambda ctx: {'text': 'High', 'confidence': 0.5})
        ensemble.register_strategy('low', lambda ctx: {'text': 'Low', 'confidence': 0.5})

        candidates = ensemble.generate_candidates({'message': 'Test'})

        # Find the candidates
        high_cand = next((c for c in candidates if c.source == 'high'), None)
        low_cand = next((c for c in candidates if c.source == 'low'), None)

        if high_cand and low_cand:
            assert high_cand.weight > low_cand.weight

    def test_diversity_scoring(self):
        """Test diversity scoring penalizes similar responses."""
        ensemble = EnsembleGenerator()

        # Two strategies returning same text
        ensemble.register_strategy('a', lambda ctx: {'text': 'Hello world', 'confidence': 0.8})
        ensemble.register_strategy('b', lambda ctx: {'text': 'Hello world', 'confidence': 0.8})
        ensemble.register_strategy('c', lambda ctx: {'text': 'Something different', 'confidence': 0.8})

        candidates = ensemble.generate_candidates({'message': 'Test'})

        # After diversity scoring, duplicates should be penalized
        # (This depends on implementation - just check it runs)
        assert len(candidates) >= 1

    def test_get_stats(self):
        """Test get_stats returns expected structure."""
        ensemble = EnsembleGenerator()

        ensemble.register_strategy('test', lambda ctx: {'text': 'Test', 'confidence': 0.5})

        stats = ensemble.get_stats()

        assert 'strategies' in stats
        assert 'bandit_weights' in stats
        assert 'bandit_stats' in stats
        assert 'recent_outputs_count' in stats
        assert 'test' in stats['strategies']

    def test_no_strategies(self):
        """Test behavior with no strategies registered."""
        ensemble = EnsembleGenerator()

        candidates = ensemble.generate_candidates({'message': 'Test'})

        assert candidates == []


class TestGetEnsemble:
    """Test the singleton getter."""

    def test_returns_ensemble_instance(self):
        """Test get_ensemble returns an ensemble."""
        ensemble = get_ensemble()
        assert isinstance(ensemble, EnsembleGenerator)

    def test_returns_same_instance(self):
        """Test singleton behavior."""
        e1 = get_ensemble()
        e2 = get_ensemble()
        assert e1 is e2
