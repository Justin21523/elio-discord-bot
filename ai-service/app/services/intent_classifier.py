"""
SVM (Support Vector Machine) Intent Classifier.

Uses SVM with TF-IDF features for classifying user message intent.
Intents help the bot understand what kind of response is expected:
- greeting: Hello, hi, hey
- question: What, how, why, when, where
- advice: Help me, I need, suggest
- feelings: I feel, I'm sad, happy
- lore: About the movie, characters
- general: Other messages
"""
from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report


# Intent definitions with keyword patterns
INTENT_PATTERNS = {
    "greeting": [
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "howdy", "greetings", "yo", "sup", "what's up", "how are you"
    ],
    "question": [
        "what", "how", "why", "when", "where", "who", "which", "can you",
        "could you", "would you", "do you", "are you", "is it", "?"
    ],
    "advice": [
        "help me", "i need", "suggest", "recommend", "advice", "should i",
        "what should", "how do i", "can you help", "tips", "guide"
    ],
    "feelings": [
        "i feel", "i'm sad", "i'm happy", "feeling", "emotion", "upset",
        "excited", "worried", "anxious", "scared", "love", "hate", "miss"
    ],
    "lore": [
        "elio", "glordon", "olga", "communiverse", "ambassador", "alien",
        "space", "pixar", "movie", "film", "story", "character"
    ],
    "personal": [
        "you", "your", "yourself", "tell me about you", "what do you",
        "do you like", "favorite", "think", "believe", "opinion"
    ],
    "action": [
        "play", "start", "stop", "begin", "let's", "show", "give",
        "tell", "make", "create", "do"
    ],
}


@dataclass
class IntentPrediction:
    """Result of intent classification."""
    intent: str
    confidence: float
    probabilities: Dict[str, float]


class IntentClassifier:
    """
    SVM-based intent classifier with TF-IDF features.

    Uses RBF kernel SVM with probability estimates for
    multi-class intent classification.
    """

    def __init__(
        self,
        kernel: str = "rbf",
        C: float = 1.0,
        gamma: str = "scale",
        ngram_range: Tuple[int, int] = (1, 2),
        max_features: int = 5000,
    ):
        """
        Initialize classifier.

        Args:
            kernel: SVM kernel type ('rbf', 'linear', 'poly')
            C: Regularization parameter
            gamma: Kernel coefficient
            ngram_range: N-gram range for TF-IDF
            max_features: Maximum vocabulary size
        """
        self.vectorizer = TfidfVectorizer(
            ngram_range=ngram_range,
            max_features=max_features,
            stop_words="english",
            lowercase=True,
        )
        self.svm = SVC(
            kernel=kernel,
            C=C,
            gamma=gamma,
            probability=True,
            class_weight="balanced",
        )
        self.classes_: List[str] = []
        self._trained = False

    def _label_by_patterns(self, text: str) -> str:
        """Label text by keyword patterns (for unsupervised labeling)."""
        text_lower = text.lower()
        scores = {}

        for intent, patterns in INTENT_PATTERNS.items():
            score = sum(1 for p in patterns if p in text_lower)
            # Weight longer patterns more
            score += sum(
                2 for p in patterns
                if len(p) > 5 and p in text_lower
            )
            scores[intent] = score

        if max(scores.values()) == 0:
            return "general"

        return max(scores, key=scores.get)

    def train(
        self,
        texts: List[str],
        labels: Optional[List[str]] = None,
    ) -> "IntentClassifier":
        """
        Train the classifier.

        Args:
            texts: List of text samples
            labels: Optional list of intent labels (auto-labeled if not provided)
        """
        if not texts:
            return self

        # Auto-label if labels not provided
        if labels is None:
            labels = [self._label_by_patterns(t) for t in texts]

        # Fit vectorizer and transform
        X = self.vectorizer.fit_transform(texts)

        # Train SVM
        self.svm.fit(X, labels)
        self.classes_ = list(self.svm.classes_)
        self._trained = True

        return self

    def train_from_jsonl(self, path: Path) -> "IntentClassifier":
        """
        Train from JSONL training file.

        Args:
            path: Path to training data
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

                if user_msg:
                    texts.append(user_msg)
                    # Use scenario as hint for labeling
                    scenario = metadata.get("scenario", "")
                    if scenario in INTENT_PATTERNS:
                        labels.append(scenario)
                    else:
                        labels.append(self._label_by_patterns(user_msg))

        return self.train(texts, labels)

    def predict(self, text: str) -> IntentPrediction:
        """
        Predict intent for text.

        Args:
            text: Input text

        Returns:
            IntentPrediction with intent, confidence, and probabilities
        """
        if not self._trained:
            # Fall back to pattern matching
            intent = self._label_by_patterns(text)
            return IntentPrediction(
                intent=intent,
                confidence=0.5,
                probabilities={intent: 0.5, "general": 0.5},
            )

        X = self.vectorizer.transform([text])
        proba = self.svm.predict_proba(X)[0]

        probabilities = dict(zip(self.classes_, proba))
        intent = self.classes_[proba.argmax()]
        confidence = float(proba.max())

        return IntentPrediction(
            intent=intent,
            confidence=confidence,
            probabilities=probabilities,
        )

    def predict_batch(self, texts: List[str]) -> List[IntentPrediction]:
        """Predict intents for multiple texts."""
        return [self.predict(t) for t in texts]

    def evaluate(
        self,
        texts: List[str],
        labels: List[str],
    ) -> Dict:
        """
        Evaluate classifier performance.

        Args:
            texts: Test texts
            labels: True labels

        Returns:
            Classification report as dict
        """
        if not self._trained:
            return {}

        X = self.vectorizer.transform(texts)
        predictions = self.svm.predict(X)

        report = classification_report(
            labels, predictions,
            output_dict=True,
            zero_division=0,
        )

        return report

    def save(self, path: Path):
        """Save model to file."""
        with path.open("wb") as f:
            pickle.dump({
                "vectorizer": self.vectorizer,
                "svm": self.svm,
                "classes": self.classes_,
            }, f)

    def load(self, path: Path) -> "IntentClassifier":
        """Load model from file."""
        with path.open("rb") as f:
            data = pickle.load(f)
            self.vectorizer = data["vectorizer"]
            self.svm = data["svm"]
            self.classes_ = data["classes"]
            self._trained = True
        return self


class PersonaIntentClassifier:
    """
    Intent classifier with persona-aware context.

    Different personas may interpret the same intent differently.
    """

    def __init__(self):
        """Initialize persona intent classifier."""
        self.classifier = IntentClassifier()
        self._loaded = False

        # Persona-specific intent mappings
        self.persona_intent_weights = {
            "Elio": {
                "lore": 1.5,  # Elio loves talking about space/aliens
                "question": 1.2,  # Curious about questions
                "feelings": 1.1,
            },
            "Glordon": {
                "feelings": 1.3,  # Glordon is empathetic
                "greeting": 1.2,
                "personal": 1.2,
            },
            "Olga": {
                "advice": 1.3,  # Olga gives advice
                "action": 1.2,
                "question": 1.1,
            },
        }

    def load_from_jsonl(self, path: Path) -> "PersonaIntentClassifier":
        """Load and train from JSONL file."""
        self.classifier.train_from_jsonl(path)
        self._loaded = True
        return self

    def predict(
        self,
        text: str,
        persona: Optional[str] = None,
    ) -> IntentPrediction:
        """
        Predict intent with optional persona context.

        Args:
            text: Input text
            persona: Optional persona name for weighted prediction

        Returns:
            IntentPrediction
        """
        prediction = self.classifier.predict(text)

        if persona and persona in self.persona_intent_weights:
            # Adjust probabilities based on persona
            weights = self.persona_intent_weights[persona]
            adjusted_probs = {}

            for intent, prob in prediction.probabilities.items():
                weight = weights.get(intent, 1.0)
                adjusted_probs[intent] = prob * weight

            # Normalize
            total = sum(adjusted_probs.values())
            if total > 0:
                adjusted_probs = {k: v / total for k, v in adjusted_probs.items()}

            # Update prediction
            best_intent = max(adjusted_probs, key=adjusted_probs.get)
            return IntentPrediction(
                intent=best_intent,
                confidence=adjusted_probs[best_intent],
                probabilities=adjusted_probs,
            )

        return prediction


# Singleton instance
_INTENT_CLASSIFIER: Optional[PersonaIntentClassifier] = None


def get_intent_classifier() -> PersonaIntentClassifier:
    """Get or create singleton PersonaIntentClassifier."""
    global _INTENT_CLASSIFIER
    if _INTENT_CLASSIFIER is None:
        _INTENT_CLASSIFIER = PersonaIntentClassifier()
        # Try to load from default training data path
        repo_root = Path(__file__).resolve().parents[3]
        training_path = repo_root / "data" / "training" / "final-complete-training-data.jsonl"
        if training_path.exists():
            _INTENT_CLASSIFIER.load_from_jsonl(training_path)
    return _INTENT_CLASSIFIER


def classify_intent(
    text: str,
    persona: Optional[str] = None,
) -> IntentPrediction:
    """
    Convenience function for intent classification.

    Args:
        text: Input text
        persona: Optional persona for context

    Returns:
        IntentPrediction
    """
    return get_intent_classifier().predict(text, persona)
