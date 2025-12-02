"""
Decision Tree and Random Forest Response Selector.

Uses tree-based ensemble methods for selecting the best response
from multiple candidates. Features include:
- Text similarity scores
- Intent classification scores
- Mood alignment scores
- Historical engagement data
"""
from __future__ import annotations

import json
import pickle
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler


@dataclass
class ResponseCandidate:
    """A candidate response with features."""
    text: str
    source: str  # Strategy that generated this
    features: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SelectionResult:
    """Result of response selection."""
    selected_index: int
    confidence: float
    feature_importance: Dict[str, float]


class ResponseSelector:
    """
    Tree-based response selector using Random Forest or Decision Tree.

    Features used for selection:
    - similarity_score: TF-IDF/BM25 similarity to query
    - intent_alignment: How well response matches detected intent
    - mood_alignment: How well response matches current mood
    - length_score: Response length appropriateness
    - diversity_score: How different from recent responses
    - persona_score: How well it matches persona style
    """

    FEATURE_NAMES = [
        "similarity_score",
        "intent_alignment",
        "mood_alignment",
        "length_score",
        "diversity_score",
        "persona_score",
        "confidence",
        "source_weight",
    ]

    def __init__(
        self,
        use_forest: bool = True,
        n_estimators: int = 100,
        max_depth: int = 10,
        use_gradient_boost: bool = False,
    ):
        """
        Initialize selector.

        Args:
            use_forest: Use Random Forest (True) or Decision Tree (False)
            n_estimators: Number of trees in forest
            max_depth: Maximum tree depth
            use_gradient_boost: Use Gradient Boosting instead of Random Forest
        """
        self.use_forest = use_forest
        self.use_gradient_boost = use_gradient_boost

        if use_gradient_boost:
            self.model = GradientBoostingClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                learning_rate=0.1,
            )
        elif use_forest:
            self.model = RandomForestClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                class_weight="balanced",
                n_jobs=-1,
            )
        else:
            self.model = DecisionTreeClassifier(
                max_depth=max_depth,
                class_weight="balanced",
            )

        self.scaler = StandardScaler()
        self._trained = False

        # Strategy weights (updated by bandit learning)
        self.strategy_weights = {
            "tfidf_markov": 1.0,
            "template_fill": 0.9,
            "ngram_blend": 0.8,
            "retrieval_mod": 0.85,
            "bm25_retrieve": 0.9,
        }

    def _extract_features(
        self,
        candidate: ResponseCandidate,
        context: Dict[str, Any],
    ) -> np.ndarray:
        """
        Extract feature vector from candidate.

        Args:
            candidate: Response candidate
            context: Context with query, intent, mood, etc.

        Returns:
            Feature vector
        """
        features = []

        # Get provided features or compute defaults
        feats = candidate.features

        # Similarity score
        features.append(feats.get("similarity_score", 0.5))

        # Intent alignment
        intent = context.get("intent", "general")
        response_intent = feats.get("response_intent", intent)
        intent_match = 1.0 if intent == response_intent else 0.5
        features.append(feats.get("intent_alignment", intent_match))

        # Mood alignment
        mood = context.get("mood", "neutral")
        response_mood = feats.get("response_mood", mood)
        mood_match = 1.0 if mood == response_mood else 0.5
        features.append(feats.get("mood_alignment", mood_match))

        # Length score (prefer moderate length)
        text_len = len(candidate.text.split())
        if 5 <= text_len <= 30:
            length_score = 1.0
        elif 3 <= text_len <= 50:
            length_score = 0.7
        else:
            length_score = 0.4
        features.append(feats.get("length_score", length_score))

        # Diversity score
        features.append(feats.get("diversity_score", 0.5))

        # Persona score
        features.append(feats.get("persona_score", 0.5))

        # Confidence from source strategy
        features.append(feats.get("confidence", 0.5))

        # Strategy weight
        source_weight = self.strategy_weights.get(candidate.source, 0.7)
        features.append(source_weight)

        return np.array(features, dtype=np.float32)

    def train(
        self,
        samples: List[Tuple[List[ResponseCandidate], int, Dict]],
    ) -> "ResponseSelector":
        """
        Train the selector on labeled samples.

        Args:
            samples: List of (candidates, selected_index, context) tuples
        """
        if not samples:
            return self

        X = []
        y = []

        for candidates, selected_idx, context in samples:
            for idx, candidate in enumerate(candidates):
                features = self._extract_features(candidate, context)
                X.append(features)
                y.append(1 if idx == selected_idx else 0)

        X = np.array(X)
        y = np.array(y)

        # Scale features
        X = self.scaler.fit_transform(X)

        # Train model
        self.model.fit(X, y)
        self._trained = True

        return self

    def select(
        self,
        candidates: List[ResponseCandidate],
        context: Dict[str, Any],
    ) -> SelectionResult:
        """
        Select best response from candidates.

        Args:
            candidates: List of response candidates
            context: Context with query, intent, mood, etc.

        Returns:
            SelectionResult with selected index and confidence
        """
        if not candidates:
            return SelectionResult(
                selected_index=0,
                confidence=0.0,
                feature_importance={},
            )

        if len(candidates) == 1:
            return SelectionResult(
                selected_index=0,
                confidence=1.0,
                feature_importance={},
            )

        # Extract features for all candidates
        X = np.array([
            self._extract_features(c, context)
            for c in candidates
        ])

        if self._trained:
            # Use trained model
            X_scaled = self.scaler.transform(X)
            proba = self.model.predict_proba(X_scaled)

            # Get probability of being selected (class 1)
            if proba.shape[1] == 2:
                scores = proba[:, 1]
            else:
                scores = proba[:, 0]

            selected_idx = int(scores.argmax())
            confidence = float(scores[selected_idx])

            # Get feature importance
            if hasattr(self.model, "feature_importances_"):
                importance = dict(zip(
                    self.FEATURE_NAMES,
                    self.model.feature_importances_.tolist(),
                ))
            else:
                importance = {}

        else:
            # Use heuristic scoring without trained model
            scores = []
            for features in X:
                # Weighted sum of features
                weights = [0.25, 0.15, 0.1, 0.1, 0.1, 0.15, 0.1, 0.05]
                score = sum(f * w for f, w in zip(features, weights))
                scores.append(score)

            scores = np.array(scores)
            selected_idx = int(scores.argmax())

            # Normalize to confidence
            min_score = scores.min()
            max_score = scores.max()
            if max_score > min_score:
                confidence = float(
                    (scores[selected_idx] - min_score) / (max_score - min_score)
                )
            else:
                confidence = 0.5

            importance = dict(zip(
                self.FEATURE_NAMES,
                [0.25, 0.15, 0.1, 0.1, 0.1, 0.15, 0.1, 0.05],
            ))

        return SelectionResult(
            selected_index=selected_idx,
            confidence=confidence,
            feature_importance=importance,
        )

    def update_strategy_weight(self, strategy: str, reward: float):
        """
        Update strategy weight based on feedback.

        Args:
            strategy: Strategy name
            reward: Reward value (0-1)
        """
        if strategy in self.strategy_weights:
            # Exponential moving average update
            alpha = 0.1
            current = self.strategy_weights[strategy]
            self.strategy_weights[strategy] = current + alpha * (reward - current)

    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance from trained model."""
        if not self._trained:
            return {}

        if hasattr(self.model, "feature_importances_"):
            return dict(zip(
                self.FEATURE_NAMES,
                self.model.feature_importances_.tolist(),
            ))

        return {}

    def save(self, path: Path):
        """Save model to file."""
        with path.open("wb") as f:
            pickle.dump({
                "model": self.model,
                "scaler": self.scaler,
                "strategy_weights": self.strategy_weights,
                "trained": self._trained,
            }, f)

    def load(self, path: Path) -> "ResponseSelector":
        """Load model from file."""
        with path.open("rb") as f:
            data = pickle.load(f)
            self.model = data["model"]
            self.scaler = data["scaler"]
            self.strategy_weights = data.get("strategy_weights", self.strategy_weights)
            self._trained = data.get("trained", True)
        return self


class EnsembleResponseSelector:
    """
    Ensemble of multiple selectors for robust selection.

    Combines:
    - Decision Tree (fast, interpretable)
    - Random Forest (robust, balanced)
    - Gradient Boosting (accurate, slower)
    """

    def __init__(self):
        """Initialize ensemble selector."""
        self.selectors = {
            "decision_tree": ResponseSelector(use_forest=False, max_depth=8),
            "random_forest": ResponseSelector(use_forest=True, n_estimators=50),
            "gradient_boost": ResponseSelector(use_gradient_boost=True, n_estimators=30),
        }

        # Selector weights (can be updated based on performance)
        self.weights = {
            "decision_tree": 0.2,
            "random_forest": 0.5,
            "gradient_boost": 0.3,
        }

    def train(
        self,
        samples: List[Tuple[List[ResponseCandidate], int, Dict]],
    ) -> "EnsembleResponseSelector":
        """Train all selectors."""
        for selector in self.selectors.values():
            selector.train(samples)
        return self

    def select(
        self,
        candidates: List[ResponseCandidate],
        context: Dict[str, Any],
    ) -> SelectionResult:
        """
        Select using weighted ensemble voting.

        Args:
            candidates: Response candidates
            context: Context

        Returns:
            Ensemble selection result
        """
        if not candidates:
            return SelectionResult(0, 0.0, {})

        # Get votes from each selector
        votes: Dict[int, float] = {}
        for name, selector in self.selectors.items():
            result = selector.select(candidates, context)
            weight = self.weights[name]
            votes[result.selected_index] = votes.get(result.selected_index, 0) + weight * result.confidence

        # Select highest weighted vote
        selected_idx = max(votes, key=votes.get)
        confidence = votes[selected_idx] / sum(self.weights.values())

        # Aggregate feature importance
        all_importance = {}
        for name, selector in self.selectors.items():
            importance = selector.get_feature_importance()
            for feat, imp in importance.items():
                all_importance[feat] = all_importance.get(feat, 0) + imp * self.weights[name]

        # Normalize
        total_weight = sum(self.weights.values())
        all_importance = {k: v / total_weight for k, v in all_importance.items()}

        return SelectionResult(
            selected_index=selected_idx,
            confidence=confidence,
            feature_importance=all_importance,
        )


# Singleton instance
_RESPONSE_SELECTOR: Optional[ResponseSelector] = None


def get_response_selector() -> ResponseSelector:
    """Get or create singleton ResponseSelector."""
    global _RESPONSE_SELECTOR
    if _RESPONSE_SELECTOR is None:
        _RESPONSE_SELECTOR = ResponseSelector(use_forest=True)
    return _RESPONSE_SELECTOR


def select_response(
    candidates: List[Dict],
    context: Dict[str, Any],
) -> Tuple[int, float]:
    """
    Convenience function for response selection.

    Args:
        candidates: List of candidate dicts with 'text', 'source', 'features'
        context: Context with 'query', 'intent', 'mood', etc.

    Returns:
        (selected_index, confidence) tuple
    """
    # Convert dicts to ResponseCandidate objects
    candidate_objs = [
        ResponseCandidate(
            text=c.get("text", ""),
            source=c.get("source", "unknown"),
            features=c.get("features", {}),
            metadata=c.get("metadata", {}),
        )
        for c in candidates
    ]

    result = get_response_selector().select(candidate_objs, context)
    return result.selected_index, result.confidence
