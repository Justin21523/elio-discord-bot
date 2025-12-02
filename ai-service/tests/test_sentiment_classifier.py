"""
Tests for Naive Bayes Sentiment/Mood Classifier.
"""
import pytest

from app.services.sentiment_classifier import (
    MoodPrediction,
    SentimentClassifier,
    PersonaMoodClassifier,
    get_mood_classifier,
    classify_mood,
    MOOD_PATTERNS,
    SENTIMENT_MOOD_MAP,
)


class TestMoodPrediction:
    """Test suite for MoodPrediction dataclass."""

    def test_initialization(self):
        """Test prediction initializes correctly."""
        prediction = MoodPrediction(
            mood="excited",
            confidence=0.85,
            probabilities={"excited": 0.85, "neutral": 0.15},
            sentiment="positive",
        )

        assert prediction.mood == "excited"
        assert prediction.confidence == 0.85
        assert prediction.sentiment == "positive"
        assert len(prediction.probabilities) == 2


class TestSentimentClassifier:
    """Test suite for SentimentClassifier."""

    def test_initialization(self):
        """Test classifier initializes with default parameters."""
        classifier = SentimentClassifier()

        assert classifier._trained == False
        assert classifier.classes_ == []

    def test_initialization_with_tfidf(self):
        """Test classifier with TF-IDF vectorizer."""
        classifier = SentimentClassifier(use_tfidf=True)

        assert "TfidfVectorizer" in type(classifier.vectorizer).__name__

    def test_initialization_with_complement_nb(self):
        """Test classifier with Complement Naive Bayes."""
        classifier = SentimentClassifier(use_complement=True)

        assert "ComplementNB" in type(classifier.classifier).__name__

    def test_initialization_with_multinomial_nb(self):
        """Test classifier with Multinomial Naive Bayes."""
        classifier = SentimentClassifier(use_complement=False)

        assert "MultinomialNB" in type(classifier.classifier).__name__

    def test_label_by_patterns_curious(self):
        """Test pattern-based labeling for curious mood."""
        classifier = SentimentClassifier()

        label = classifier._label_by_patterns("What is that? I wonder...")

        assert label == "curious"

    def test_label_by_patterns_warm(self):
        """Test pattern-based labeling for warm mood."""
        classifier = SentimentClassifier()

        label = classifier._label_by_patterns("Thank you so much, you're so kind!")

        assert label == "warm"

    def test_label_by_patterns_playful(self):
        """Test pattern-based labeling for playful mood."""
        classifier = SentimentClassifier()

        label = classifier._label_by_patterns("Haha that's so funny! LOL")

        assert label == "playful"

    def test_label_by_patterns_concerned(self):
        """Test pattern-based labeling for concerned mood."""
        classifier = SentimentClassifier()

        label = classifier._label_by_patterns("I'm worried about the problem")

        assert label == "concerned"

    def test_label_by_patterns_excited(self):
        """Test pattern-based labeling for excited mood."""
        classifier = SentimentClassifier()

        label = classifier._label_by_patterns("Wow! That's amazing! So cool!")

        assert label == "excited"

    def test_label_by_patterns_neutral(self):
        """Test pattern-based labeling falls back to neutral."""
        classifier = SentimentClassifier()

        label = classifier._label_by_patterns("xyz random text here")

        assert label == "neutral"

    def test_get_sentiment_positive(self):
        """Test mood to sentiment mapping for positive."""
        classifier = SentimentClassifier()

        assert classifier._get_sentiment("warm") == "positive"
        assert classifier._get_sentiment("excited") == "positive"
        assert classifier._get_sentiment("playful") == "positive"

    def test_get_sentiment_negative(self):
        """Test mood to sentiment mapping for negative."""
        classifier = SentimentClassifier()

        assert classifier._get_sentiment("concerned") == "negative"

    def test_get_sentiment_question(self):
        """Test mood to sentiment mapping for question."""
        classifier = SentimentClassifier()

        assert classifier._get_sentiment("curious") == "question"

    def test_train_with_texts_and_labels(self, mood_texts, mood_labels):
        """Test training with provided labels."""
        classifier = SentimentClassifier()
        classifier.train(mood_texts, mood_labels)

        assert classifier._trained == True
        assert len(classifier.classes_) > 0

    def test_train_auto_labels(self, mood_texts):
        """Test training with auto-labeling."""
        classifier = SentimentClassifier()
        classifier.train(mood_texts)

        assert classifier._trained == True

    def test_train_empty_returns_self(self):
        """Test training with empty data returns self."""
        classifier = SentimentClassifier()
        result = classifier.train([])

        assert result is classifier
        assert classifier._trained == False

    def test_train_from_jsonl(self, training_data_path):
        """Test training from JSONL file."""
        classifier = SentimentClassifier()
        classifier.train_from_jsonl(training_data_path)

        assert classifier._trained == True

    def test_predict_returns_prediction(self, mood_texts, mood_labels):
        """Test predict returns MoodPrediction."""
        classifier = SentimentClassifier()
        classifier.train(mood_texts, mood_labels)

        prediction = classifier.predict("This is amazing!")

        assert isinstance(prediction, MoodPrediction)
        assert prediction.mood in classifier.classes_
        assert 0 <= prediction.confidence <= 1
        assert prediction.sentiment in ["positive", "negative", "neutral", "question"]

    def test_predict_untrained_uses_patterns(self):
        """Test predict falls back to patterns when untrained."""
        classifier = SentimentClassifier()

        prediction = classifier.predict("What is this? I wonder...")

        assert isinstance(prediction, MoodPrediction)
        assert prediction.mood == "curious"
        assert prediction.confidence == 0.5

    def test_predict_batch(self, mood_texts, mood_labels):
        """Test batch prediction."""
        classifier = SentimentClassifier()
        classifier.train(mood_texts, mood_labels)

        predictions = classifier.predict_batch(["Wow!", "I'm sad", "Okay"])

        assert len(predictions) == 3
        assert all(isinstance(p, MoodPrediction) for p in predictions)

    def test_evaluate_returns_metrics(self, mood_texts, mood_labels):
        """Test evaluate returns metrics dict."""
        classifier = SentimentClassifier()
        # Use full data for training
        classifier.train(mood_texts, mood_labels)

        # Evaluate needs enough samples per class for cv, use larger sample
        if len(mood_texts) >= 6:
            metrics = classifier.evaluate(mood_texts, mood_labels, cv=2)
            assert isinstance(metrics, dict)
            assert "accuracy_mean" in metrics
        else:
            # Skip if not enough data
            pass

    def test_get_feature_log_prob(self, mood_texts, mood_labels):
        """Test getting feature log probabilities."""
        classifier = SentimentClassifier()
        classifier.train(mood_texts, mood_labels)

        feature_probs = classifier.get_feature_log_prob()

        assert isinstance(feature_probs, dict)
        if classifier.classes_:
            # Should have entries for each class
            assert len(feature_probs) == len(classifier.classes_)

    def test_save_and_load(self, mood_texts, mood_labels, tmp_path):
        """Test saving and loading model."""
        classifier = SentimentClassifier()
        classifier.train(mood_texts, mood_labels)

        save_path = tmp_path / "sentiment_model.pkl"
        classifier.save(save_path)

        # Load into new classifier
        new_classifier = SentimentClassifier()
        new_classifier.load(save_path)

        assert new_classifier._trained == True
        assert new_classifier.classes_ == classifier.classes_


class TestPersonaMoodClassifier:
    """Test suite for PersonaMoodClassifier."""

    def test_initialization(self):
        """Test persona classifier initializes correctly."""
        classifier = PersonaMoodClassifier()

        assert classifier._loaded == False
        assert len(classifier.persona_priors) > 0

    def test_has_persona_priors(self):
        """Test classifier has persona-specific priors."""
        classifier = PersonaMoodClassifier()

        assert "Elio" in classifier.persona_priors
        assert "Glordon" in classifier.persona_priors
        assert "Olga" in classifier.persona_priors

    def test_persona_priors_sum_to_one(self):
        """Test persona priors approximately sum to 1."""
        classifier = PersonaMoodClassifier()

        for persona, priors in classifier.persona_priors.items():
            total = sum(priors.values())
            assert abs(total - 1.0) < 0.01

    def test_load_from_jsonl(self, training_data_path):
        """Test loading from JSONL file."""
        classifier = PersonaMoodClassifier()
        classifier.load_from_jsonl(training_data_path)

        assert classifier._loaded == True

    def test_predict_without_persona(self, training_data_path):
        """Test predict without persona context."""
        classifier = PersonaMoodClassifier()
        classifier.load_from_jsonl(training_data_path)

        prediction = classifier.predict("This is great!")

        assert isinstance(prediction, MoodPrediction)

    def test_predict_with_persona(self, training_data_path):
        """Test predict with persona context."""
        classifier = PersonaMoodClassifier()
        classifier.load_from_jsonl(training_data_path)

        prediction = classifier.predict("This is interesting", persona="Elio")

        assert isinstance(prediction, MoodPrediction)

    def test_persona_adjusts_probabilities(self, training_data_path):
        """Test that persona context adjusts probabilities."""
        classifier = PersonaMoodClassifier()
        classifier.load_from_jsonl(training_data_path)

        # Same text, different personas
        pred_elio = classifier.predict("How interesting!", persona="Elio")
        pred_olga = classifier.predict("How interesting!", persona="Olga")

        # Elio should lean more curious, Olga more neutral
        # Probabilities should differ
        assert pred_elio.probabilities != pred_olga.probabilities

    def test_predict_unknown_persona(self, training_data_path):
        """Test predict with unknown persona uses base prediction."""
        classifier = PersonaMoodClassifier()
        classifier.load_from_jsonl(training_data_path)

        prediction = classifier.predict("Hello", persona="UnknownPersona")

        assert isinstance(prediction, MoodPrediction)


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_mood_classifier_returns_instance(self):
        """Test get_mood_classifier returns classifier."""
        classifier = get_mood_classifier()

        assert isinstance(classifier, PersonaMoodClassifier)

    def test_get_mood_classifier_singleton(self):
        """Test get_mood_classifier returns same instance."""
        c1 = get_mood_classifier()
        c2 = get_mood_classifier()

        assert c1 is c2

    def test_classify_mood_convenience(self):
        """Test classify_mood convenience function."""
        prediction = classify_mood("Wow that's amazing!", persona="Elio")

        assert isinstance(prediction, MoodPrediction)


class TestMoodPatterns:
    """Test MOOD_PATTERNS coverage."""

    def test_all_moods_have_patterns(self):
        """Test all expected moods have patterns."""
        expected_moods = [
            "curious", "warm", "playful", "concerned", "excited", "neutral"
        ]

        for mood in expected_moods:
            assert mood in MOOD_PATTERNS
            assert len(MOOD_PATTERNS[mood]) > 0


class TestSentimentMoodMap:
    """Test SENTIMENT_MOOD_MAP coverage."""

    def test_all_sentiments_mapped(self):
        """Test all sentiments have mood mappings."""
        expected_sentiments = ["positive", "negative", "question", "neutral"]

        for sentiment in expected_sentiments:
            assert sentiment in SENTIMENT_MOOD_MAP
            assert len(SENTIMENT_MOOD_MAP[sentiment]) > 0
