"""
Thompson Sampling Multi-Armed Bandit for strategy selection.
Uses Beta distributions to track success rates for each arm.
Supports persistence to MongoDB for state recovery across restarts.
"""
from __future__ import annotations

import random
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np


class ThompsonSamplingBandit:
    """
    Multi-armed bandit using Thompson Sampling with Beta priors.
    Each arm maintains (alpha, beta) parameters for a Beta distribution.

    Usage:
        bandit = ThompsonSamplingBandit(['strategy_a', 'strategy_b', 'strategy_c'])
        arm = bandit.select_arm()
        # ... use arm, get reward ...
        bandit.update(arm, reward)  # reward in [0, 1]
    """

    def __init__(self, arm_names: List[str], prior_alpha: float = 1.0, prior_beta: float = 1.0):
        """
        Initialize bandit with uniform Beta priors.

        Args:
            arm_names: List of arm identifiers (e.g., strategy names)
            prior_alpha: Initial alpha for Beta distribution (default: 1.0 = uniform prior)
            prior_beta: Initial beta for Beta distribution (default: 1.0 = uniform prior)
        """
        self.arm_names = arm_names
        self.arms: Dict[str, Dict[str, float]] = {
            name: {'alpha': prior_alpha, 'beta': prior_beta}
            for name in arm_names
        }
        self._last_selection: Optional[str] = None
        self._selection_count: Dict[str, int] = {name: 0 for name in arm_names}

    def select_arm(self, explore_bonus: float = 0.0) -> str:
        """
        Select an arm using Thompson Sampling.

        Args:
            explore_bonus: Optional bonus to encourage exploration (added to variance)

        Returns:
            Selected arm name
        """
        samples = {}
        for name, params in self.arms.items():
            alpha = params['alpha']
            beta = params['beta']
            # Sample from Beta distribution
            sample = np.random.beta(alpha, beta)
            # Add exploration bonus if specified
            if explore_bonus > 0:
                sample += explore_bonus * np.random.random()
            samples[name] = sample

        # Select arm with highest sample
        selected = max(samples, key=samples.get)
        self._last_selection = selected
        self._selection_count[selected] += 1
        return selected

    def select_arm_with_scores(self, explore_bonus: float = 0.0) -> Tuple[str, Dict[str, float]]:
        """
        Select an arm and return all sampled scores.

        Returns:
            Tuple of (selected_arm, {arm: score})
        """
        samples = {}
        for name, params in self.arms.items():
            alpha = params['alpha']
            beta = params['beta']
            sample = np.random.beta(alpha, beta)
            if explore_bonus > 0:
                sample += explore_bonus * np.random.random()
            samples[name] = float(sample)

        selected = max(samples, key=samples.get)
        self._last_selection = selected
        self._selection_count[selected] += 1
        return selected, samples

    def update(self, arm: str, reward: float):
        """
        Update arm parameters based on observed reward.

        Args:
            arm: Arm name to update
            reward: Reward value in [0, 1]
        """
        if arm not in self.arms:
            return

        # Clamp reward to [0, 1]
        reward = max(0.0, min(1.0, reward))

        # Update Beta parameters
        # Higher reward -> increase alpha (success)
        # Lower reward -> increase beta (failure)
        if reward >= 0.5:
            # Scale by how much above 0.5
            self.arms[arm]['alpha'] += reward
        else:
            # Scale by how much below 0.5
            self.arms[arm]['beta'] += (1.0 - reward)

    def batch_update(self, updates: List[Dict[str, float]]):
        """
        Apply multiple updates at once.

        Args:
            updates: List of {'arm': str, 'reward': float}
        """
        for update in updates:
            arm = update.get('arm') or update.get('strategy')
            reward = update.get('reward', 0.5)
            if arm:
                self.update(arm, reward)

    def get_weight(self, arm: str) -> float:
        """
        Get current estimated weight (mean) for an arm.

        Returns:
            Expected value of Beta distribution: alpha / (alpha + beta)
        """
        if arm not in self.arms:
            return 0.5
        params = self.arms[arm]
        alpha = params['alpha']
        beta = params['beta']
        return alpha / (alpha + beta)

    def get_all_weights(self) -> Dict[str, float]:
        """
        Get weights for all arms.

        Returns:
            Dict mapping arm names to their estimated weights
        """
        return {name: self.get_weight(name) for name in self.arm_names}

    def get_confidence_interval(self, arm: str, confidence: float = 0.95) -> Tuple[float, float]:
        """
        Get confidence interval for arm's success probability.

        Args:
            arm: Arm name
            confidence: Confidence level (e.g., 0.95 for 95%)

        Returns:
            Tuple of (lower_bound, upper_bound)
        """
        if arm not in self.arms:
            return (0.0, 1.0)

        from scipy import stats
        params = self.arms[arm]
        alpha = params['alpha']
        beta = params['beta']

        lower = (1 - confidence) / 2
        upper = 1 - lower

        dist = stats.beta(alpha, beta)
        return (float(dist.ppf(lower)), float(dist.ppf(upper)))

    def get_stats(self) -> Dict[str, object]:
        """
        Get comprehensive statistics for all arms.

        Returns:
            Dict with arm statistics
        """
        stats = {}
        for name in self.arm_names:
            params = self.arms[name]
            alpha = params['alpha']
            beta = params['beta']
            weight = alpha / (alpha + beta)
            variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1))

            stats[name] = {
                'alpha': round(alpha, 4),
                'beta': round(beta, 4),
                'weight': round(weight, 4),
                'variance': round(variance, 6),
                'selections': self._selection_count.get(name, 0),
                'total_observations': round(alpha + beta - 2, 2),  # Subtract priors
            }
        return stats

    def reset(self, arm: Optional[str] = None):
        """
        Reset arm(s) to initial prior.

        Args:
            arm: If specified, reset only this arm. Otherwise reset all.
        """
        if arm:
            if arm in self.arms:
                self.arms[arm] = {'alpha': 1.0, 'beta': 1.0}
                self._selection_count[arm] = 0
        else:
            for name in self.arm_names:
                self.arms[name] = {'alpha': 1.0, 'beta': 1.0}
                self._selection_count[name] = 0

    def add_arm(self, arm_name: str, alpha: float = 1.0, beta: float = 1.0):
        """
        Add a new arm to the bandit.

        Args:
            arm_name: Name for the new arm
            alpha: Initial alpha (default: 1.0)
            beta: Initial beta (default: 1.0)
        """
        if arm_name not in self.arms:
            self.arm_names.append(arm_name)
            self.arms[arm_name] = {'alpha': alpha, 'beta': beta}
            self._selection_count[arm_name] = 0

    def remove_arm(self, arm_name: str):
        """
        Remove an arm from the bandit.

        Args:
            arm_name: Name of arm to remove
        """
        if arm_name in self.arms:
            del self.arms[arm_name]
            self.arm_names.remove(arm_name)
            del self._selection_count[arm_name]

    # --- Persistence ---

    def to_dict(self) -> Dict:
        """
        Serialize bandit state to dictionary.

        Returns:
            Dict with bandit state
        """
        return {
            'arm_names': self.arm_names,
            'arms': self.arms,
            'selection_count': self._selection_count,
            'updated_at': datetime.utcnow().isoformat(),
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'ThompsonSamplingBandit':
        """
        Deserialize bandit from dictionary.

        Args:
            data: Dict with bandit state

        Returns:
            ThompsonSamplingBandit instance
        """
        arm_names = data.get('arm_names', [])
        instance = cls(arm_names)
        instance.arms = data.get('arms', {})
        instance._selection_count = data.get('selection_count', {name: 0 for name in arm_names})
        return instance

    async def save_state(self, collection, bandit_id: str = 'default'):
        """
        Save bandit state to MongoDB collection.

        Args:
            collection: Motor collection (async MongoDB)
            bandit_id: Identifier for this bandit instance
        """
        doc = self.to_dict()
        doc['_id'] = f'bandit_{bandit_id}'

        await collection.update_one(
            {'_id': doc['_id']},
            {'$set': doc},
            upsert=True
        )

    @classmethod
    async def load_state(cls, collection, bandit_id: str = 'default',
                         default_arms: Optional[List[str]] = None) -> 'ThompsonSamplingBandit':
        """
        Load bandit state from MongoDB collection.

        Args:
            collection: Motor collection (async MongoDB)
            bandit_id: Identifier for this bandit instance
            default_arms: Default arm names if no saved state exists

        Returns:
            ThompsonSamplingBandit instance
        """
        doc = await collection.find_one({'_id': f'bandit_{bandit_id}'})

        if doc:
            return cls.from_dict(doc)

        # Create new instance with defaults
        if default_arms:
            return cls(default_arms)

        return cls(['default'])

    def save_state_sync(self, collection, bandit_id: str = 'default'):
        """
        Save bandit state to MongoDB collection (sync version).

        Args:
            collection: PyMongo collection
            bandit_id: Identifier for this bandit instance
        """
        doc = self.to_dict()
        doc['_id'] = f'bandit_{bandit_id}'

        collection.update_one(
            {'_id': doc['_id']},
            {'$set': doc},
            upsert=True
        )

    @classmethod
    def load_state_sync(cls, collection, bandit_id: str = 'default',
                        default_arms: Optional[List[str]] = None) -> 'ThompsonSamplingBandit':
        """
        Load bandit state from MongoDB collection (sync version).

        Args:
            collection: PyMongo collection
            bandit_id: Identifier for this bandit instance
            default_arms: Default arm names if no saved state exists

        Returns:
            ThompsonSamplingBandit instance
        """
        doc = collection.find_one({'_id': f'bandit_{bandit_id}'})

        if doc:
            return cls.from_dict(doc)

        if default_arms:
            return cls(default_arms)

        return cls(['default'])


class ContextualBandit(ThompsonSamplingBandit):
    """
    Contextual bandit that adjusts arm selection based on context features.
    Extends Thompson Sampling with context-aware adjustments.
    """

    def __init__(self, arm_names: List[str], context_features: Optional[List[str]] = None):
        """
        Initialize contextual bandit.

        Args:
            arm_names: List of arm identifiers
            context_features: List of context feature names to track
        """
        super().__init__(arm_names)
        self.context_features = context_features or []
        # Track arm performance per context
        self.context_arms: Dict[str, Dict[str, Dict[str, float]]] = {}

    def select_arm_with_context(self, context: Dict[str, str]) -> str:
        """
        Select arm considering context.

        Args:
            context: Dict of context feature values

        Returns:
            Selected arm name
        """
        # Build context key
        context_key = self._context_key(context)

        # Get context-specific arms or fallback to global
        context_arms = self.context_arms.get(context_key, self.arms)

        # Sample from each arm
        samples = {}
        for name, params in context_arms.items():
            alpha = params.get('alpha', 1.0)
            beta = params.get('beta', 1.0)
            samples[name] = np.random.beta(alpha, beta)

        # If context has no data, blend with global priors
        if context_key not in self.context_arms:
            for name in self.arm_names:
                global_weight = self.get_weight(name)
                samples[name] = 0.5 * samples.get(name, 0.5) + 0.5 * global_weight

        selected = max(samples, key=samples.get)
        self._last_selection = selected
        return selected

    def update_with_context(self, arm: str, reward: float, context: Dict[str, str]):
        """
        Update arm parameters for specific context.

        Args:
            arm: Arm name
            reward: Reward value in [0, 1]
            context: Context features
        """
        # Update global
        super().update(arm, reward)

        # Update context-specific
        context_key = self._context_key(context)
        if context_key not in self.context_arms:
            # Initialize with global priors
            self.context_arms[context_key] = {
                name: {'alpha': 1.0, 'beta': 1.0}
                for name in self.arm_names
            }

        if arm in self.context_arms[context_key]:
            if reward >= 0.5:
                self.context_arms[context_key][arm]['alpha'] += reward
            else:
                self.context_arms[context_key][arm]['beta'] += (1.0 - reward)

    def _context_key(self, context: Dict[str, str]) -> str:
        """Build a hashable key from context dict."""
        parts = []
        for feature in sorted(self.context_features):
            value = context.get(feature, 'unknown')
            parts.append(f"{feature}={value}")
        return '|'.join(parts)

    def to_dict(self) -> Dict:
        """Serialize with context data."""
        base = super().to_dict()
        base['context_features'] = self.context_features
        base['context_arms'] = self.context_arms
        return base

    @classmethod
    def from_dict(cls, data: Dict) -> 'ContextualBandit':
        """Deserialize with context data."""
        arm_names = data.get('arm_names', [])
        context_features = data.get('context_features', [])
        instance = cls(arm_names, context_features)
        instance.arms = data.get('arms', {})
        instance._selection_count = data.get('selection_count', {})
        instance.context_arms = data.get('context_arms', {})
        return instance


# --- Singleton instances for common use cases ---

# Default persona response bandit
PERSONA_BANDIT: Optional[ThompsonSamplingBandit] = None

# Default game AI bandit
GAME_AI_BANDIT: Optional[ThompsonSamplingBandit] = None


def get_persona_bandit() -> ThompsonSamplingBandit:
    """Get or create the persona response bandit."""
    global PERSONA_BANDIT
    if PERSONA_BANDIT is None:
        PERSONA_BANDIT = ThompsonSamplingBandit([
            'tfidf_markov',
            'template_fill',
            'ngram_blend',
            'retrieval_mod',
        ])
    return PERSONA_BANDIT


def get_game_ai_bandit() -> ThompsonSamplingBandit:
    """Get or create the game AI bandit."""
    global GAME_AI_BANDIT
    if GAME_AI_BANDIT is None:
        GAME_AI_BANDIT = ThompsonSamplingBandit([
            'heuristic',
            'mcts',
            'pfa',
            'random',
        ])
    return GAME_AI_BANDIT
