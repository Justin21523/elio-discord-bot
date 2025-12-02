"""
Naive Bayes Sentiment/Mood Classifier.

Uses Multinomial Naive Bayes for classifying text sentiment/mood.
Moods are mapped to the HMM dialogue states:
- neutral, curious, warm, playful, concerned, excited
"""
from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from sklearn.naive_bayes import MultinomialNB, ComplementNB
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.model_selection import cross_val_score


# Mood keyword patterns for labeling
MOOD_PATTERNS = {
    "curious": [
        "what", "how", "why", "when", "where", "who", "which",
        "wonder", "curious", "interesting", "tell me", "explain",
        "?", "know", "learn", "understand", "discover"
    ],
    "warm": [
        "thank", "thanks", "appreciate", "grateful", "love",
        "care", "kind", "sweet", "nice", "wonderful", "amazing",
        "beautiful", "lovely", "friend", "happy", "joy"
    ],
    "playful": [
        "haha", "lol", "funny", "joke", "play", "game", "fun",
        "silly", "laugh", "hehe", "teasing", "kidding", "just kidding"
    ],
    "concerned": [
        "worried", "concern", "afraid", "scared", "anxious",
        "nervous", "careful", "warning", "danger", "problem",
        "issue", "trouble", "wrong", "bad", "sad", "upset"
    ],
    "excited": [
        "wow", "amazing", "awesome", "incredible", "fantastic",
        "excited", "can't wait", "love it", "so cool", "best",
        "!", "yes", "great", "yay", "omg", "whoa"
    ],
    "neutral": [
        "okay", "ok", "sure", "alright", "fine", "i see",
        "understood", "got it", "makes sense"
    ],
}

# Sentiment to mood mapping
SENTIMENT_MOOD_MAP = {
    "positive": ["warm", "excited", "playful"],
    "negative": ["concerned"],
    "question": ["curious"],
    "neutral": ["neutral"],
}


@dataclass
class MoodPrediction:
    """Result of mood classification."""
    mood: str
    confidence: float
    probabilities: Dict[str, float]
    sentiment: str  # positive, negative, neutral


class SentimentClassifier:
    """
    Naive Bayes classifier for sentiment/mood detection.

    Uses Multinomial NB with Count or TF-IDF features.
    """

    def __init__(
        self,
        use_tfidf: bool = False,
        use_complement: bool = True,
        ngram_range: Tuple[int, int] = (1, 2),
        max_features: int = 3000,
    ):
        """
        Initialize classifier.

        Args:
            use_tfidf: Use TF-IDF instead of raw counts
            use_complement: Use Complement NB (better for imbalanced data)
            ngram_range: N-gram range for vectorizer
            max_features: Maximum vocabulary size
        """
        if use_tfidf:
            self.vectorizer = TfidfVectorizer(
                ngram_range=ngram_range,
                max_features=max_features,
                lowercase=True,
            )
        else:
            self.vectorizer = CountVectorizer(
                ngram_range=ngram_range,
                max_features=max_features,
                lowercase=True,
            )

        if use_complement:
            self.classifier = ComplementNB(alpha=0.1)
        else:
            self.classifier = MultinomialNB(alpha=0.1)

        self.classes_: List[str] = []
        self._trained = False

    def _label_by_patterns(self, text: str) -> str:
        """Label text by keyword patterns."""
        text_lower = text.lower()
        scores = {}

        for mood, patterns in MOOD_PATTERNS.items():
            score = sum(1 for p in patterns if p in text_lower)
            # Weight certain patterns more
            if "?" in text_lower and mood == "curious":
                score += 2
            if "!" in text_lower and mood == "excited":
                score += 1
            scores[mood] = score

        if max(scores.values()) == 0:
            return "neutral"

        return max(scores, key=scores.get)

    def _get_sentiment(self, mood: str) -> str:
        """Map mood to sentiment."""
        for sentiment, moods in SENTIMENT_MOOD_MAP.items():
            if mood in moods:
                return sentiment
        return "neutral"

    def train(
        self,
        texts: List[str],
        labels: Optional[List[str]] = None,
    ) -> "SentimentClassifier":
        """
        Train the classifier.

        Args:
            texts: Text samples
            labels: Optional mood labels (auto-labeled if not provided)
        """
        if not texts:
            return self

        # Auto-label if labels not provided
        if labels is None:
            labels = [self._label_by_patterns(t) for t in texts]

        # Fit vectorizer and transform
        X = self.vectorizer.fit_transform(texts)

        # Train classifier
        self.classifier.fit(X, labels)
        self.classes_ = list(self.classifier.classes_)
        self._trained = True

        return self

    def train_from_jsonl(self, path: Path) -> "SentimentClassifier":
        """
        Train from JSONL file.

        Uses both user messages and assistant responses to learn mood patterns.
        """
        texts = []
        labels = []

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

                # Get user message
                user_msg = next(
                    (m["content"] for m in messages if m.get("role") == "user"),
                    "",
                )

                # Get assistant response (often contains mood indicators)
                assistant_msg = next(
                    (m["content"] for m in messages if m.get("role") == "assistant"),
                    "",
                )

                # Use both for training
                for msg in [user_msg, assistant_msg]:
                    if msg:
                        texts.append(msg)
                        labels.append(self._label_by_patterns(msg))

        return self.train(texts, labels)

    def predict(self, text: str) -> MoodPrediction:
        """
        Predict mood for text.

        Args:
            text: Input text

        Returns:
            MoodPrediction with mood, confidence, probabilities, sentiment
        """
        if not self._trained:
            # Fall back to pattern matching
            mood = self._label_by_patterns(text)
            return MoodPrediction(
                mood=mood,
                confidence=0.5,
                probabilities={mood: 0.5},
                sentiment=self._get_sentiment(mood),
            )

        X = self.vectorizer.transform([text])
        proba = self.classifier.predict_proba(X)[0]

        probabilities = dict(zip(self.classes_, proba))
        mood = self.classes_[proba.argmax()]
        confidence = float(proba.max())

        return MoodPrediction(
            mood=mood,
            confidence=confidence,
            probabilities=probabilities,
            sentiment=self._get_sentiment(mood),
        )

    def predict_batch(self, texts: List[str]) -> List[MoodPrediction]:
        """Predict mood for multiple texts."""
        return [self.predict(t) for t in texts]

    def evaluate(
        self,
        texts: List[str],
        labels: List[str],
        cv: int = 5,
    ) -> Dict:
        """
        Evaluate classifier with cross-validation.

        Args:
            texts: Test texts
            labels: True labels
            cv: Number of cross-validation folds

        Returns:
            Evaluation metrics
        """
        if not texts:
            return {}

        X = self.vectorizer.fit_transform(texts)
        scores = cross_val_score(self.classifier, X, labels, cv=cv)

        return {
            "accuracy_mean": float(scores.mean()),
            "accuracy_std": float(scores.std()),
            "fold_scores": scores.tolist(),
        }

    def get_feature_log_prob(self) -> Dict[str, Dict[str, float]]:
        """
        Get feature log probabilities per class.

        Useful for understanding what words indicate each mood.
        """
        if not self._trained:
            return {}

        feature_names = self.vectorizer.get_feature_names_out()
        result = {}

        for idx, mood in enumerate(self.classes_):
            log_probs = self.classifier.feature_log_prob_[idx]
            # Get top features for this mood
            top_indices = log_probs.argsort()[-20:][::-1]
            result[mood] = {
                feature_names[i]: float(log_probs[i])
                for i in top_indices
            }

        return result

    def save(self, path: Path):
        """Save model to file."""
        with path.open("wb") as f:
            pickle.dump({
                "vectorizer": self.vectorizer,
                "classifier": self.classifier,
                "classes": self.classes_,
            }, f)

    def load(self, path: Path) -> "SentimentClassifier":
        """Load model from file."""
        with path.open("rb") as f:
            data = pickle.load(f)
            self.vectorizer = data["vectorizer"]
            self.classifier = data["classifier"]
            self.classes_ = data["classes"]
            self._trained = True
        return self


class PersonaMoodClassifier:
    """
    Mood classifier with persona-specific adjustments.

    Different personas have different baseline moods:
    - Elio: More curious and excited
    - Glordon: More playful and warm
    - Olga: More neutral and concerned (protective)
    """

    def __init__(self):
        """Initialize persona mood classifier."""
        self.classifier = SentimentClassifier(use_complement=True)
        self._loaded = False

        # Persona mood priors
        self.persona_priors = {
            "Elio": {
                "curious": 0.25,
                "excited": 0.2,
                "warm": 0.15,
                "playful": 0.15,
                "neutral": 0.15,
                "concerned": 0.1,
            },
            "Glordon": {
                "playful": 0.25,
                "warm": 0.25,
                "curious": 0.15,
                "neutral": 0.15,
                "excited": 0.1,
                "concerned": 0.1,
            },
            "Olga": {
                "neutral": 0.25,
                "concerned": 0.2,
                "warm": 0.2,
                "curious": 0.15,
                "playful": 0.1,
                "excited": 0.1,
            },
        }

    def load_from_jsonl(self, path: Path) -> "PersonaMoodClassifier":
        """Load and train from JSONL file."""
        self.classifier.train_from_jsonl(path)
        self._loaded = True
        return self

    def predict(
        self,
        text: str,
        persona: Optional[str] = None,
    ) -> MoodPrediction:
        """
        Predict mood with optional persona context.

        Args:
            text: Input text
            persona: Optional persona for prior adjustment

        Returns:
            MoodPrediction
        """
        prediction = self.classifier.predict(text)

        if persona and persona in self.persona_priors:
            # Blend with persona priors
            priors = self.persona_priors[persona]
            adjusted_probs = {}

            for mood in prediction.probabilities:
                prior = priors.get(mood, 0.1)
                # Bayesian blend: P(mood|text, persona) ∝ P(mood|text) * P(mood|persona)
                adjusted_probs[mood] = prediction.probabilities[mood] * prior

            # Normalize
            total = sum(adjusted_probs.values())
            if total > 0:
                adjusted_probs = {k: v / total for k, v in adjusted_probs.items()}

            # Update prediction
            best_mood = max(adjusted_probs, key=adjusted_probs.get)
            return MoodPrediction(
                mood=best_mood,
                confidence=adjusted_probs[best_mood],
                probabilities=adjusted_probs,
                sentiment=prediction.sentiment,
            )

        return prediction


# Singleton instance
_MOOD_CLASSIFIER: Optional[PersonaMoodClassifier] = None


def get_mood_classifier() -> PersonaMoodClassifier:
    """Get or create singleton PersonaMoodClassifier."""
    global _MOOD_CLASSIFIER
    if _MOOD_CLASSIFIER is None:
        _MOOD_CLASSIFIER = PersonaMoodClassifier()
        # Try to load from default training data path
        repo_root = Path(__file__).resolve().parents[3]
        training_path = repo_root / "data" / "training" / "final-complete-training-data.jsonl"
        if training_path.exists():
            _MOOD_CLASSIFIER.load_from_jsonl(training_path)
    return _MOOD_CLASSIFIER


def classify_mood(
    text: str,
    persona: Optional[str] = None,
) -> MoodPrediction:
    """
    Convenience function for mood classification.

    Args:
        text: Input text
        persona: Optional persona for context

    Returns:
        MoodPrediction
    """
    return get_mood_classifier().predict(text, persona)
