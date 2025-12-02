"""
Tests for Decision Tree / Random Forest Response Selector.
"""
import pytest
import numpy as np

from app.services.response_selector import (
    ResponseCandidate,
    SelectionResult,
    ResponseSelector,
    EnsembleResponseSelector,
    get_response_selector,
    select_response,
)


class TestResponseCandidate:
    """Test suite for ResponseCandidate dataclass."""

    def test_initialization(self):
        """Test candidate initializes correctly."""
        candidate = ResponseCandidate(
            text="Hello there!",
            source="test_strategy",
        )

        assert candidate.text == "Hello there!"
        assert candidate.source == "test_strategy"
        assert candidate.features == {}
        assert candidate.metadata == {}

    def test_initialization_with_features(self):
        """Test candidate with features."""
        candidate = ResponseCandidate(
            text="Test",
            source="src",
            features={"similarity_score": 0.8, "confidence": 0.7},
            metadata={"key": "value"},
        )

        assert candidate.features["similarity_score"] == 0.8
        assert candidate.metadata["key"] == "value"


class TestSelectionResult:
    """Test suite for SelectionResult dataclass."""

    def test_initialization(self):
        """Test result initializes correctly."""
        result = SelectionResult(
            selected_index=1,
            confidence=0.85,
            feature_importance={"similarity_score": 0.3},
        )

        assert result.selected_index == 1
        assert result.confidence == 0.85
        assert result.feature_importance["similarity_score"] == 0.3


class TestResponseSelector:
    """Test suite for ResponseSelector."""

    def test_initialization_random_forest(self):
        """Test selector initializes with Random Forest."""
        selector = ResponseSelector(use_forest=True)

        assert selector.use_forest == True
        assert selector._trained == False
        assert "RandomForest" in type(selector.model).__name__

    def test_initialization_decision_tree(self):
        """Test selector initializes with Decision Tree."""
        selector = ResponseSelector(use_forest=False)

        assert selector.use_forest == False
        assert "DecisionTree" in type(selector.model).__name__

    def test_initialization_gradient_boost(self):
        """Test selector initializes with Gradient Boosting."""
        selector = ResponseSelector(use_gradient_boost=True)

        assert selector.use_gradient_boost == True
        assert "GradientBoosting" in type(selector.model).__name__

    def test_extract_features_returns_array(self, response_candidates, selection_context):
        """Test feature extraction returns numpy array."""
        selector = ResponseSelector()
        candidate = ResponseCandidate(
            text=response_candidates[0]["text"],
            source=response_candidates[0]["source"],
            features=response_candidates[0]["features"],
        )

        features = selector._extract_features(candidate, selection_context)

        assert isinstance(features, np.ndarray)
        assert len(features) == len(ResponseSelector.FEATURE_NAMES)

    def test_extract_features_values(self, response_candidates, selection_context):
        """Test feature values are extracted correctly."""
        selector = ResponseSelector()
        candidate = ResponseCandidate(
            text=response_candidates[0]["text"],
            source=response_candidates[0]["source"],
            features=response_candidates[0]["features"],
        )

        features = selector._extract_features(candidate, selection_context)

        # Check similarity_score is from features
        assert features[0] == response_candidates[0]["features"]["similarity_score"]

    def test_select_empty_candidates(self, selection_context):
        """Test select with no candidates."""
        selector = ResponseSelector()

        result = selector.select([], selection_context)

        assert result.selected_index == 0
        assert result.confidence == 0.0

    def test_select_single_candidate(self, response_candidates, selection_context):
        """Test select with single candidate."""
        selector = ResponseSelector()
        candidate = ResponseCandidate(
            text=response_candidates[0]["text"],
            source=response_candidates[0]["source"],
            features=response_candidates[0]["features"],
        )

        result = selector.select([candidate], selection_context)

        assert result.selected_index == 0
        assert result.confidence == 1.0

    def test_select_multiple_candidates_untrained(self, response_candidates, selection_context):
        """Test select multiple candidates with untrained model."""
        selector = ResponseSelector()
        candidates = [
            ResponseCandidate(
                text=c["text"],
                source=c["source"],
                features=c["features"],
            )
            for c in response_candidates
        ]

        result = selector.select(candidates, selection_context)

        assert isinstance(result, SelectionResult)
        assert 0 <= result.selected_index < len(candidates)
        assert 0 <= result.confidence <= 1
        assert len(result.feature_importance) > 0

    def test_train_and_select(self, response_candidates, selection_context):
        """Test training and selection."""
        selector = ResponseSelector()

        # Create training samples
        candidates = [
            ResponseCandidate(
                text=c["text"],
                source=c["source"],
                features=c["features"],
            )
            for c in response_candidates
        ]

        # Training sample: (candidates, selected_index, context)
        samples = [(candidates, 0, selection_context)]
        selector.train(samples)

        assert selector._trained == True

        # Test selection
        result = selector.select(candidates, selection_context)
        assert isinstance(result, SelectionResult)

    def test_update_strategy_weight(self):
        """Test strategy weight update."""
        selector = ResponseSelector()
        initial_weight = selector.strategy_weights.get("tfidf_markov", 1.0)

        selector.update_strategy_weight("tfidf_markov", 0.5)

        # Weight should have moved toward 0.5
        new_weight = selector.strategy_weights["tfidf_markov"]
        assert new_weight != initial_weight

    def test_update_unknown_strategy(self):
        """Test updating unknown strategy does nothing."""
        selector = ResponseSelector()

        selector.update_strategy_weight("unknown_strategy", 0.9)

        assert "unknown_strategy" not in selector.strategy_weights

    def test_get_feature_importance_untrained(self):
        """Test feature importance on untrained model."""
        selector = ResponseSelector()

        importance = selector.get_feature_importance()

        assert importance == {}

    def test_save_and_load(self, response_candidates, selection_context, tmp_path):
        """Test saving and loading model."""
        selector = ResponseSelector()

        candidates = [
            ResponseCandidate(
                text=c["text"],
                source=c["source"],
                features=c["features"],
            )
            for c in response_candidates
        ]

        samples = [(candidates, 0, selection_context)]
        selector.train(samples)

        save_path = tmp_path / "selector_model.pkl"
        selector.save(save_path)

        # Load into new selector
        new_selector = ResponseSelector()
        new_selector.load(save_path)

        assert new_selector._trained == True


class TestEnsembleResponseSelector:
    """Test suite for EnsembleResponseSelector."""

    def test_initialization(self):
        """Test ensemble initializes with multiple selectors."""
        ensemble = EnsembleResponseSelector()

        assert len(ensemble.selectors) == 3
        assert "decision_tree" in ensemble.selectors
        assert "random_forest" in ensemble.selectors
        assert "gradient_boost" in ensemble.selectors

    def test_has_weights(self):
        """Test ensemble has weights for selectors."""
        ensemble = EnsembleResponseSelector()

        assert len(ensemble.weights) == 3
        assert sum(ensemble.weights.values()) == 1.0

    def test_select_empty_candidates(self, selection_context):
        """Test ensemble select with no candidates."""
        ensemble = EnsembleResponseSelector()

        result = ensemble.select([], selection_context)

        assert result.selected_index == 0
        assert result.confidence == 0.0

    def test_select_multiple_candidates(self, response_candidates, selection_context):
        """Test ensemble selection with multiple candidates."""
        ensemble = EnsembleResponseSelector()
        candidates = [
            ResponseCandidate(
                text=c["text"],
                source=c["source"],
                features=c["features"],
            )
            for c in response_candidates
        ]

        result = ensemble.select(candidates, selection_context)

        assert isinstance(result, SelectionResult)
        assert 0 <= result.selected_index < len(candidates)
        assert 0 <= result.confidence <= 1

    def test_train_all_selectors(self, response_candidates, selection_context):
        """Test training trains all ensemble selectors."""
        ensemble = EnsembleResponseSelector()

        candidates = [
            ResponseCandidate(
                text=c["text"],
                source=c["source"],
                features=c["features"],
            )
            for c in response_candidates
        ]

        samples = [(candidates, 0, selection_context)]
        ensemble.train(samples)

        # All selectors should be trained
        for selector in ensemble.selectors.values():
            assert selector._trained == True


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_response_selector_returns_instance(self):
        """Test get_response_selector returns selector."""
        selector = get_response_selector()

        assert isinstance(selector, ResponseSelector)

    def test_get_response_selector_singleton(self):
        """Test get_response_selector returns same instance."""
        s1 = get_response_selector()
        s2 = get_response_selector()

        assert s1 is s2

    def test_select_response_convenience(self, response_candidates, selection_context):
        """Test select_response convenience function."""
        idx, confidence = select_response(response_candidates, selection_context)

        assert isinstance(idx, int)
        assert 0 <= idx < len(response_candidates)
        assert isinstance(confidence, float)
        assert 0 <= confidence <= 1


class TestFeatureNames:
    """Test FEATURE_NAMES configuration."""

    def test_feature_names_defined(self):
        """Test all feature names are defined."""
        expected_features = [
            "similarity_score",
            "intent_alignment",
            "mood_alignment",
            "length_score",
            "diversity_score",
            "persona_score",
            "confidence",
            "source_weight",
        ]

        for feature in expected_features:
            assert feature in ResponseSelector.FEATURE_NAMES


class TestStrategyWeights:
    """Test strategy weight configuration."""

    def test_default_strategy_weights(self):
        """Test default strategy weights are set."""
        selector = ResponseSelector()

        assert "tfidf_markov" in selector.strategy_weights
        assert "template_fill" in selector.strategy_weights
        assert "ngram_blend" in selector.strategy_weights

    def test_strategy_weights_range(self):
        """Test strategy weights are in valid range."""
        selector = ResponseSelector()

        for weight in selector.strategy_weights.values():
            assert 0 <= weight <= 1
