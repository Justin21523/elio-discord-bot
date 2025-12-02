"""
Ensemble generator for persona responses.
Combines multiple generation strategies with weighted voting.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Callable

from .bandit import ThompsonSamplingBandit, get_persona_bandit


@dataclass
class Candidate:
    """A generated response candidate."""
    text: str
    source: str  # Strategy name
    confidence: float  # Generation confidence [0, 1]
    weight: float = 1.0  # Bandit weight
    cf_score: float = 1.0  # Collaborative filtering score
    context_score: float = 1.0  # Context appropriateness score
    metadata: Dict = field(default_factory=dict)

    @property
    def final_score(self) -> float:
        """Compute final weighted score."""
        return (
            self.confidence *
            self.weight *
            self.cf_score *
            self.context_score
        )


class EnsembleGenerator:
    """
    Combines multiple generation strategies with weighted ensemble voting.

    Strategies:
    - tfidf_markov: TF-IDF similarity + Markov generation (current)
    - template_fill: Template-based with slot filling
    - ngram_blend: N-gram language model blending
    - retrieval_mod: Retrieval + modification
    """

    def __init__(
        self,
        bandit: Optional[ThompsonSamplingBandit] = None,
        strategies: Optional[Dict[str, Callable]] = None,
    ):
        """
        Initialize ensemble generator.

        Args:
            bandit: Thompson Sampling bandit for strategy selection
            strategies: Dict mapping strategy names to generator functions
        """
        self.bandit = bandit or get_persona_bandit()
        self.strategies = strategies or {}
        self._recent_outputs: List[str] = []  # For diversity tracking
        self._max_recent = 10

    def register_strategy(self, name: str, generator: Callable):
        """
        Register a generation strategy.

        Args:
            name: Strategy identifier
            generator: Function(context) -> Candidate
        """
        self.strategies[name] = generator

        # Add to bandit if not present
        if name not in self.bandit.arm_names:
            self.bandit.add_arm(name)

    def generate_candidates(self, context: Dict) -> List[Candidate]:
        """
        Generate candidates from all strategies.

        Args:
            context: Generation context with persona, message, history, etc.

        Returns:
            List of Candidate objects
        """
        candidates = []

        for name, generator in self.strategies.items():
            try:
                # Get bandit weight for this strategy
                weight = self.bandit.get_weight(name)

                # Generate candidate
                result = generator(context)

                if result and result.get('text'):
                    candidate = Candidate(
                        text=result['text'],
                        source=name,
                        confidence=result.get('confidence', 0.5),
                        weight=weight,
                        metadata=result.get('metadata', {}),
                    )
                    candidates.append(candidate)

            except Exception as e:
                # Log error but continue with other strategies
                import logging
                logging.warning(f"Strategy {name} failed: {e}")

        return candidates

    def score_candidates(
        self,
        candidates: List[Candidate],
        cf_scores: Optional[List[float]] = None,
        context_scores: Optional[List[float]] = None,
    ) -> List[Candidate]:
        """
        Apply CF and context scores to candidates.

        Args:
            candidates: List of candidates
            cf_scores: Optional CF scores per candidate
            context_scores: Optional context appropriateness scores

        Returns:
            Scored candidates
        """
        for i, candidate in enumerate(candidates):
            if cf_scores and i < len(cf_scores):
                candidate.cf_score = cf_scores[i]

            if context_scores and i < len(context_scores):
                candidate.context_score = context_scores[i]

            # Add diversity bonus to avoid repetition
            diversity_bonus = self._compute_diversity(candidate.text)
            candidate.context_score *= (1.0 + 0.2 * diversity_bonus)

        return candidates

    def select_candidate(
        self,
        candidates: List[Candidate],
        method: str = 'weighted_random',
    ) -> Optional[Candidate]:
        """
        Select final candidate from scored options.

        Args:
            candidates: Scored candidates
            method: Selection method ('best', 'weighted_random', 'thompson')

        Returns:
            Selected candidate or None
        """
        if not candidates:
            return None

        if method == 'best':
            return max(candidates, key=lambda c: c.final_score)

        elif method == 'weighted_random':
            # Softmax-style weighted random selection
            weights = [max(0.05, c.final_score) for c in candidates]
            total = sum(weights)
            probs = [w / total for w in weights]

            r = random.random()
            cumulative = 0.0
            for candidate, prob in zip(candidates, probs):
                cumulative += prob
                if r <= cumulative:
                    self._track_output(candidate.text)
                    return candidate

            return candidates[-1]

        elif method == 'thompson':
            # Use bandit sampling for exploration
            selected_arm, _ = self.bandit.select_arm_with_scores()

            # Find candidate from selected arm
            for candidate in candidates:
                if candidate.source == selected_arm:
                    self._track_output(candidate.text)
                    return candidate

            # Fallback to weighted random
            return self.select_candidate(candidates, 'weighted_random')

        else:
            return candidates[0] if candidates else None

    def generate(
        self,
        context: Dict,
        cf_scores: Optional[List[float]] = None,
        method: str = 'weighted_random',
    ) -> Optional[Candidate]:
        """
        Full generation pipeline: generate -> score -> select.

        Args:
            context: Generation context
            cf_scores: Optional CF scores
            method: Selection method

        Returns:
            Selected candidate or None
        """
        # Generate from all strategies
        candidates = self.generate_candidates(context)

        if not candidates:
            return None

        # Score candidates
        candidates = self.score_candidates(candidates, cf_scores)

        # Select final
        return self.select_candidate(candidates, method)

    def _compute_diversity(self, text: str) -> float:
        """
        Compute diversity score based on recent outputs.
        Higher score = more diverse from recent outputs.

        Args:
            text: Candidate text

        Returns:
            Diversity score [0, 1]
        """
        if not self._recent_outputs:
            return 1.0

        text_lower = text.lower()
        text_words = set(text_lower.split())

        # Check overlap with recent outputs
        max_overlap = 0.0
        for recent in self._recent_outputs:
            recent_words = set(recent.lower().split())
            if not text_words or not recent_words:
                continue
            overlap = len(text_words & recent_words) / len(text_words | recent_words)
            max_overlap = max(max_overlap, overlap)

        # Diversity = 1 - max_overlap
        return 1.0 - max_overlap

    def _track_output(self, text: str):
        """Track output for diversity scoring."""
        self._recent_outputs.append(text)
        if len(self._recent_outputs) > self._max_recent:
            self._recent_outputs.pop(0)

    def record_feedback(self, source: str, reward: float):
        """
        Record feedback for a strategy.

        Args:
            source: Strategy name
            reward: Reward value [0, 1]
        """
        self.bandit.update(source, reward)

    def get_stats(self) -> Dict:
        """Get ensemble statistics."""
        return {
            'strategies': list(self.strategies.keys()),
            'bandit_weights': self.bandit.get_all_weights(),
            'bandit_stats': self.bandit.get_stats(),
            'recent_outputs_count': len(self._recent_outputs),
        }


class StrategyRegistry:
    """Registry for generation strategies with lazy loading."""

    _instance = None
    _strategies: Dict[str, Callable] = {}

    @classmethod
    def get_instance(cls) -> 'StrategyRegistry':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, name: str, generator: Callable):
        """Register a strategy."""
        self._strategies[name] = generator

    def get(self, name: str) -> Optional[Callable]:
        """Get a strategy by name."""
        return self._strategies.get(name)

    def all(self) -> Dict[str, Callable]:
        """Get all registered strategies."""
        return self._strategies.copy()


# Singleton ensemble generator
_ENSEMBLE: Optional[EnsembleGenerator] = None


def get_ensemble() -> EnsembleGenerator:
    """Get or create the singleton ensemble generator."""
    global _ENSEMBLE
    if _ENSEMBLE is None:
        _ENSEMBLE = EnsembleGenerator()
    return _ENSEMBLE


def register_default_strategies(ensemble: EnsembleGenerator):
    """
    Register default generation strategies.
    Call this after all strategy modules are loaded.
    """
    # These will be implemented in respective modules
    # and registered here for the ensemble to use

    # Placeholder strategy registrations
    # Real implementations will be added in later phases

    def tfidf_markov_strategy(context: Dict) -> Dict:
        """TF-IDF + Markov (current implementation)."""
        # This will delegate to PersonaLogicEngine.reply()
        return {'text': '', 'confidence': 0.0}

    def template_fill_strategy(context: Dict) -> Dict:
        """Template-based generation."""
        # This will delegate to TemplateFiller
        return {'text': '', 'confidence': 0.0}

    def ngram_blend_strategy(context: Dict) -> Dict:
        """N-gram blending."""
        # This will delegate to enhanced Markov
        return {'text': '', 'confidence': 0.0}

    def retrieval_mod_strategy(context: Dict) -> Dict:
        """Retrieval + modification."""
        # This will delegate to RetrievalHybrid
        return {'text': '', 'confidence': 0.0}

    ensemble.register_strategy('tfidf_markov', tfidf_markov_strategy)
    ensemble.register_strategy('template_fill', template_fill_strategy)
    ensemble.register_strategy('ngram_blend', ngram_blend_strategy)
    ensemble.register_strategy('retrieval_mod', retrieval_mod_strategy)
