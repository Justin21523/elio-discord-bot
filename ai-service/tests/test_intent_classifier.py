"""
Tests for SVM Intent Classifier.
"""
import pytest

from app.services.intent_classifier import (
    IntentPrediction,
    IntentClassifier,
    PersonaIntentClassifier,
    get_intent_classifier,
    classify_intent,
    INTENT_PATTERNS,
)


class TestIntentPrediction:
    """Test suite for IntentPrediction dataclass."""

    def test_initialization(self):
        """Test prediction initializes correctly."""
        prediction = IntentPrediction(
            intent="greeting",
            confidence=0.9,
            probabilities={"greeting": 0.9, "question": 0.1},
        )

        assert prediction.intent == "greeting"
        assert prediction.confidence == 0.9
        assert prediction.probabilities == {"greeting": 0.9, "question": 0.1}


class TestIntentClassifier:
    """Test suite for IntentClassifier."""

    def test_initialization(self):
        """Test classifier initializes with default parameters."""
        classifier = IntentClassifier()

        assert classifier._trained == False
        assert classifier.classes_ == []

    def test_initialization_with_params(self):
        """Test classifier with custom parameters."""
        classifier = IntentClassifier(
            kernel="linear",
            C=2.0,
            ngram_range=(1, 3),
            max_features=3000,
        )

        assert classifier.svm.kernel == "linear"
        assert classifier.svm.C == 2.0

    def test_label_by_patterns_greeting(self):
        """Test pattern-based labeling for greeting."""
        classifier = IntentClassifier()

        label = classifier._label_by_patterns("Hello! How are you?")

        assert label == "greeting"

    def test_label_by_patterns_question(self):
        """Test pattern-based labeling for question."""
        classifier = IntentClassifier()

        label = classifier._label_by_patterns("What is the meaning of life?")

        assert label == "question"

    def test_label_by_patterns_feelings(self):
        """Test pattern-based labeling for feelings."""
        classifier = IntentClassifier()

        label = classifier._label_by_patterns("I feel so sad and worried")

        assert label == "feelings"

    def test_label_by_patterns_general(self):
        """Test pattern-based labeling falls back to general."""
        classifier = IntentClassifier()

        label = classifier._label_by_patterns("xyz qrs abc 123")

        assert label == "general"

    def test_train_with_texts_and_labels(self, sample_texts, sample_labels):
        """Test training with provided labels."""
        classifier = IntentClassifier()
        classifier.train(sample_texts, sample_labels)

        assert classifier._trained == True
        assert len(classifier.classes_) > 0

    def test_train_auto_labels(self, sample_texts):
        """Test training with auto-labeling."""
        classifier = IntentClassifier()
        classifier.train(sample_texts)

        assert classifier._trained == True
        assert len(classifier.classes_) > 0

    def test_train_empty_returns_self(self):
        """Test training with empty data returns self."""
        classifier = IntentClassifier()
        result = classifier.train([])

        assert result is classifier
        assert classifier._trained == False

    def test_train_from_jsonl(self, training_data_path):
        """Test training from JSONL file."""
        classifier = IntentClassifier()
        classifier.train_from_jsonl(training_data_path)

        assert classifier._trained == True

    def test_predict_returns_prediction(self, sample_texts, sample_labels):
        """Test predict returns IntentPrediction."""
        classifier = IntentClassifier()
        classifier.train(sample_texts, sample_labels)

        prediction = classifier.predict("Hello friend!")

        assert isinstance(prediction, IntentPrediction)
        assert prediction.intent in classifier.classes_
        assert 0 <= prediction.confidence <= 1

    def test_predict_untrained_uses_patterns(self):
        """Test predict falls back to patterns when untrained."""
        classifier = IntentClassifier()

        prediction = classifier.predict("Hello! How are you?")

        assert isinstance(prediction, IntentPrediction)
        assert prediction.intent == "greeting"
        assert prediction.confidence == 0.5

    def test_predict_probabilities(self, sample_texts, sample_labels):
        """Test predict returns probabilities."""
        classifier = IntentClassifier()
        classifier.train(sample_texts, sample_labels)

        prediction = classifier.predict("What is this?")

        assert len(prediction.probabilities) == len(classifier.classes_)
        assert abs(sum(prediction.probabilities.values()) - 1.0) < 0.01

    def test_predict_batch(self, sample_texts, sample_labels):
        """Test batch prediction."""
        classifier = IntentClassifier()
        classifier.train(sample_texts, sample_labels)

        predictions = classifier.predict_batch(["Hello", "What?", "Help me"])

        assert len(predictions) == 3
        assert all(isinstance(p, IntentPrediction) for p in predictions)

    def test_evaluate_returns_report(self, sample_texts, sample_labels):
        """Test evaluate returns classification report."""
        classifier = IntentClassifier()
        classifier.train(sample_texts, sample_labels)

        report = classifier.evaluate(sample_texts[:4], sample_labels[:4])

        assert isinstance(report, dict)
        assert "accuracy" in report

    def test_evaluate_untrained(self):
        """Test evaluate on untrained classifier returns empty."""
        classifier = IntentClassifier()

        report = classifier.evaluate(["test"], ["greeting"])

        assert report == {}

    def test_save_and_load(self, sample_texts, sample_labels, tmp_path):
        """Test saving and loading model."""
        classifier = IntentClassifier()
        classifier.train(sample_texts, sample_labels)

        save_path = tmp_path / "intent_model.pkl"
        classifier.save(save_path)

        # Load into new classifier
        new_classifier = IntentClassifier()
        new_classifier.load(save_path)

        assert new_classifier._trained == True
        assert new_classifier.classes_ == classifier.classes_


class TestPersonaIntentClassifier:
    """Test suite for PersonaIntentClassifier."""

    def test_initialization(self):
        """Test persona classifier initializes correctly."""
        classifier = PersonaIntentClassifier()

        assert classifier._loaded == False
        assert len(classifier.persona_intent_weights) > 0

    def test_has_persona_weights(self):
        """Test classifier has persona-specific weights."""
        classifier = PersonaIntentClassifier()

        assert "Elio" in classifier.persona_intent_weights
        assert "Glordon" in classifier.persona_intent_weights
        assert "Olga" in classifier.persona_intent_weights

    def test_load_from_jsonl(self, training_data_path):
        """Test loading from JSONL file."""
        classifier = PersonaIntentClassifier()
        classifier.load_from_jsonl(training_data_path)

        assert classifier._loaded == True

    def test_predict_without_persona(self, training_data_path):
        """Test predict without persona context."""
        classifier = PersonaIntentClassifier()
        classifier.load_from_jsonl(training_data_path)

        prediction = classifier.predict("Hello friend!")

        assert isinstance(prediction, IntentPrediction)

    def test_predict_with_persona(self, training_data_path):
        """Test predict with persona context."""
        classifier = PersonaIntentClassifier()
        classifier.load_from_jsonl(training_data_path)

        prediction = classifier.predict("Tell me about space", persona="Elio")

        assert isinstance(prediction, IntentPrediction)

    def test_persona_adjusts_probabilities(self, training_data_path):
        """Test that persona context adjusts probabilities."""
        classifier = PersonaIntentClassifier()
        classifier.load_from_jsonl(training_data_path)

        # Same text, different personas
        pred_elio = classifier.predict("What is that?", persona="Elio")
        pred_glordon = classifier.predict("What is that?", persona="Glordon")

        # Probabilities should be different due to persona weights
        assert pred_elio.probabilities != pred_glordon.probabilities

    def test_predict_unknown_persona(self, training_data_path):
        """Test predict with unknown persona uses base prediction."""
        classifier = PersonaIntentClassifier()
        classifier.load_from_jsonl(training_data_path)

        # Should work without error
        prediction = classifier.predict("Hello", persona="UnknownPersona")

        assert isinstance(prediction, IntentPrediction)


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_intent_classifier_returns_instance(self):
        """Test get_intent_classifier returns classifier."""
        classifier = get_intent_classifier()

        assert isinstance(classifier, PersonaIntentClassifier)

    def test_get_intent_classifier_singleton(self):
        """Test get_intent_classifier returns same instance."""
        c1 = get_intent_classifier()
        c2 = get_intent_classifier()

        assert c1 is c2

    def test_classify_intent_convenience(self):
        """Test classify_intent convenience function."""
        prediction = classify_intent("Hello there!", persona="Elio")

        assert isinstance(prediction, IntentPrediction)


class TestIntentPatterns:
    """Test INTENT_PATTERNS coverage."""

    def test_all_intents_have_patterns(self):
        """Test all expected intents have patterns."""
        expected_intents = [
            "greeting", "question", "advice", "feelings",
            "lore", "personal", "action"
        ]

        for intent in expected_intents:
            assert intent in INTENT_PATTERNS
            assert len(INTENT_PATTERNS[intent]) > 0

    def test_patterns_are_lowercase(self):
        """Test all patterns are lowercase."""
        for intent, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                assert pattern == pattern.lower()
