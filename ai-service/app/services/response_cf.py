"""
Response-level Collaborative Filtering for personalized persona responses.
Uses implicit feedback to learn user preferences for response styles.
"""
from __future__ import annotations

import math
import random
from typing import Dict, List, Optional, Tuple, Any
from collections import defaultdict


class ResponseStyleCF:
    """
    Collaborative Filtering for response styles.

    Tracks user preferences for different response characteristics:
    - Length (short, medium, long)
    - Tone (casual, formal, playful, warm)
    - Structure (question, statement, exclamation)
    - Topic engagement (lore, humor, advice, empathy)

    Uses matrix factorization-like approach but with explicit feature dimensions.
    """

    # Response style dimensions
    STYLE_DIMENSIONS = {
        'length': ['short', 'medium', 'long'],
        'tone': ['casual', 'formal', 'playful', 'warm', 'enthusiastic'],
        'structure': ['question', 'statement', 'exclamation', 'mixed'],
        'topic': ['lore', 'humor', 'advice', 'empathy', 'action', 'observation'],
    }

    def __init__(
        self,
        learning_rate: float = 0.1,
        decay: float = 0.95,
        prior_strength: float = 1.0,
    ):
        """
        Initialize response CF.

        Args:
            learning_rate: How fast to update preferences
            decay: Decay factor for old preferences
            prior_strength: Strength of prior (uniform) preferences
        """
        self.learning_rate = learning_rate
        self.decay = decay
        self.prior_strength = prior_strength

        # User preference matrices
        # user_id -> dimension -> style -> (positive_count, total_count)
        self.user_prefs: Dict[str, Dict[str, Dict[str, Tuple[float, float]]]] = defaultdict(
            lambda: defaultdict(dict)
        )

        # Global style popularity (for cold start)
        # dimension -> style -> (positive_count, total_count)
        self.global_prefs: Dict[str, Dict[str, Tuple[float, float]]] = defaultdict(dict)

        # User similarity cache
        self._similarity_cache: Dict[Tuple[str, str], float] = {}
        self._cache_dirty = True

        # Initialize global prefs with uniform prior
        self._init_global_prefs()

    def _init_global_prefs(self):
        """Initialize global preferences with uniform prior."""
        for dim, styles in self.STYLE_DIMENSIONS.items():
            for style in styles:
                self.global_prefs[dim][style] = (self.prior_strength, self.prior_strength * 2)

    def get_user_preferences(
        self,
        user_id: str,
        use_similar_users: bool = True,
        n_similar: int = 5,
    ) -> Dict[str, Dict[str, float]]:
        """
        Get preference scores for a user.

        Args:
            user_id: User ID
            use_similar_users: Whether to blend with similar users
            n_similar: Number of similar users to consider

        Returns:
            Dict of dimension -> style -> preference score (0-1)
        """
        prefs = {}

        for dim, styles in self.STYLE_DIMENSIONS.items():
            prefs[dim] = {}
            for style in styles:
                score = self._compute_preference(user_id, dim, style, use_similar_users, n_similar)
                prefs[dim][style] = score

        return prefs

    def _compute_preference(
        self,
        user_id: str,
        dimension: str,
        style: str,
        use_similar: bool,
        n_similar: int,
    ) -> float:
        """Compute preference score for a user-style pair."""
        # Get user's own preference
        user_pref = self._get_user_style_score(user_id, dimension, style)

        if not use_similar:
            return user_pref

        # Blend with similar users
        similar_users = self._get_similar_users(user_id, n_similar)

        if not similar_users:
            return user_pref

        # Weighted average
        total_weight = 1.0  # User's own weight
        weighted_sum = user_pref

        for other_user, similarity in similar_users:
            other_pref = self._get_user_style_score(other_user, dimension, style)
            weight = similarity * 0.5  # Dampen similar user influence
            weighted_sum += other_pref * weight
            total_weight += weight

        return weighted_sum / total_weight

    def _get_user_style_score(
        self,
        user_id: str,
        dimension: str,
        style: str,
    ) -> float:
        """Get raw preference score for user-style."""
        user_data = self.user_prefs.get(user_id, {})
        dim_data = user_data.get(dimension, {})
        style_data = dim_data.get(style)

        if style_data is None:
            # Fall back to global
            global_data = self.global_prefs.get(dimension, {}).get(style, (1, 2))
            positive, total = global_data
        else:
            positive, total = style_data

        # Beta distribution mean
        return positive / max(1, total)

    def _get_similar_users(
        self,
        user_id: str,
        n: int,
    ) -> List[Tuple[str, float]]:
        """Get most similar users."""
        if self._cache_dirty:
            self._rebuild_similarity_cache()

        similarities = []
        for other_id in self.user_prefs.keys():
            if other_id == user_id:
                continue

            cache_key = (min(user_id, other_id), max(user_id, other_id))
            sim = self._similarity_cache.get(cache_key, 0)

            if sim > 0.1:  # Threshold
                similarities.append((other_id, sim))

        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:n]

    def _rebuild_similarity_cache(self):
        """Rebuild user similarity cache."""
        self._similarity_cache.clear()
        users = list(self.user_prefs.keys())

        for i, user_a in enumerate(users):
            for user_b in users[i + 1:]:
                sim = self._compute_similarity(user_a, user_b)
                cache_key = (min(user_a, user_b), max(user_a, user_b))
                self._similarity_cache[cache_key] = sim

        self._cache_dirty = False

    def _compute_similarity(self, user_a: str, user_b: str) -> float:
        """Compute cosine similarity between two users."""
        vec_a = self._user_to_vector(user_a)
        vec_b = self._user_to_vector(user_b)

        if not vec_a or not vec_b:
            return 0.0

        # Cosine similarity
        dot = sum(vec_a.get(k, 0) * vec_b.get(k, 0) for k in set(vec_a) | set(vec_b))
        norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
        norm_b = math.sqrt(sum(v * v for v in vec_b.values()))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot / (norm_a * norm_b)

    def _user_to_vector(self, user_id: str) -> Dict[str, float]:
        """Convert user preferences to vector."""
        vec = {}
        user_data = self.user_prefs.get(user_id, {})

        for dim, dim_data in user_data.items():
            for style, (pos, total) in dim_data.items():
                key = f"{dim}:{style}"
                vec[key] = pos / max(1, total)

        return vec

    def update(
        self,
        user_id: str,
        response_styles: Dict[str, str],
        engagement: float,
    ):
        """
        Update preferences based on engagement feedback.

        Args:
            user_id: User ID
            response_styles: Dict of dimension -> style for the response
            engagement: Engagement score (0-1, higher = more positive)
        """
        for dim, style in response_styles.items():
            if dim not in self.STYLE_DIMENSIONS:
                continue
            if style not in self.STYLE_DIMENSIONS[dim]:
                continue

            # Initialize if needed
            if style not in self.user_prefs[user_id][dim]:
                self.user_prefs[user_id][dim][style] = (self.prior_strength, self.prior_strength * 2)

            # Update counts
            pos, total = self.user_prefs[user_id][dim][style]

            # Decay old observations
            pos *= self.decay
            total *= self.decay

            # Add new observation
            total += 1
            if engagement >= 0.5:
                pos += engagement
            else:
                pos += engagement * 0.5  # Partial credit for low engagement

            self.user_prefs[user_id][dim][style] = (pos, total)

            # Update global
            g_pos, g_total = self.global_prefs[dim].get(style, (1, 2))
            g_total += 0.1  # Slower global update
            if engagement >= 0.5:
                g_pos += 0.1 * engagement
            self.global_prefs[dim][style] = (g_pos, g_total)

        self._cache_dirty = True

    def sample_preferred_style(
        self,
        user_id: str,
        dimension: str,
        temperature: float = 1.0,
    ) -> str:
        """
        Sample a style from user preferences.

        Args:
            user_id: User ID
            dimension: Style dimension to sample from
            temperature: Sampling temperature (higher = more random)

        Returns:
            Selected style name
        """
        if dimension not in self.STYLE_DIMENSIONS:
            return random.choice(list(self.STYLE_DIMENSIONS.values())[0])

        styles = self.STYLE_DIMENSIONS[dimension]
        prefs = self.get_user_preferences(user_id, use_similar_users=True)
        dim_prefs = prefs.get(dimension, {})

        # Softmax with temperature
        scores = [dim_prefs.get(s, 0.5) for s in styles]
        max_score = max(scores)
        exp_scores = [math.exp((s - max_score) / temperature) for s in scores]
        total = sum(exp_scores)
        probs = [e / total for e in exp_scores]

        # Sample
        r = random.random()
        cumulative = 0.0
        for style, prob in zip(styles, probs):
            cumulative += prob
            if r <= cumulative:
                return style

        return styles[-1]

    def get_style_recommendations(
        self,
        user_id: str,
        top_k: int = 3,
    ) -> Dict[str, List[str]]:
        """
        Get top recommended styles for each dimension.

        Args:
            user_id: User ID
            top_k: Number of styles per dimension

        Returns:
            Dict of dimension -> list of recommended styles
        """
        prefs = self.get_user_preferences(user_id)
        recommendations = {}

        for dim, dim_prefs in prefs.items():
            sorted_styles = sorted(dim_prefs.items(), key=lambda x: x[1], reverse=True)
            recommendations[dim] = [s for s, _ in sorted_styles[:top_k]]

        return recommendations

    def classify_response_style(self, response: str) -> Dict[str, str]:
        """
        Classify the style of a response.

        Args:
            response: The response text

        Returns:
            Dict of dimension -> detected style
        """
        styles = {}

        # Length classification
        word_count = len(response.split())
        if word_count < 10:
            styles['length'] = 'short'
        elif word_count < 30:
            styles['length'] = 'medium'
        else:
            styles['length'] = 'long'

        # Structure classification
        if response.endswith('?'):
            styles['structure'] = 'question'
        elif response.endswith('!'):
            styles['structure'] = 'exclamation'
        elif '?' in response or '!' in response:
            styles['structure'] = 'mixed'
        else:
            styles['structure'] = 'statement'

        # Tone classification (simple heuristics)
        lower = response.lower()
        if any(w in lower for w in ['haha', 'lol', 'hehe', 'funny', 'joke']):
            styles['tone'] = 'playful'
        elif any(w in lower for w in ['love', 'care', 'heart', 'sweet', 'dear']):
            styles['tone'] = 'warm'
        elif any(w in lower for w in ['wow', 'amazing', 'awesome', 'excited']):
            styles['tone'] = 'enthusiastic'
        elif any(w in lower for w in ['please', 'kindly', 'regarding', 'therefore']):
            styles['tone'] = 'formal'
        else:
            styles['tone'] = 'casual'

        # Topic classification (simple heuristics)
        if any(w in lower for w in ['story', 'legend', 'ancient', 'history', 'realm']):
            styles['topic'] = 'lore'
        elif any(w in lower for w in ['haha', 'joke', 'funny', 'laugh']):
            styles['topic'] = 'humor'
        elif any(w in lower for w in ['should', 'try', 'suggest', 'recommend', 'advice']):
            styles['topic'] = 'advice'
        elif any(w in lower for w in ['feel', 'understand', 'sorry', 'hope', 'wish']):
            styles['topic'] = 'empathy'
        elif any(w in lower for w in ['do', 'go', 'make', 'create', 'build']):
            styles['topic'] = 'action'
        else:
            styles['topic'] = 'observation'

        return styles

    def get_stats(self) -> Dict:
        """Get CF statistics."""
        return {
            'num_users': len(self.user_prefs),
            'dimensions': list(self.STYLE_DIMENSIONS.keys()),
            'cache_size': len(self._similarity_cache),
            'cache_dirty': self._cache_dirty,
        }

    def to_dict(self) -> Dict:
        """Serialize to dictionary."""
        return {
            'user_prefs': {
                uid: {
                    dim: {style: list(data) for style, data in dim_data.items()}
                    for dim, dim_data in user_data.items()
                }
                for uid, user_data in self.user_prefs.items()
            },
            'global_prefs': {
                dim: {style: list(data) for style, data in dim_data.items()}
                for dim, dim_data in self.global_prefs.items()
            },
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'ResponseStyleCF':
        """Deserialize from dictionary."""
        cf = cls()

        for uid, user_data in data.get('user_prefs', {}).items():
            for dim, dim_data in user_data.items():
                for style, counts in dim_data.items():
                    cf.user_prefs[uid][dim][style] = tuple(counts)

        for dim, dim_data in data.get('global_prefs', {}).items():
            for style, counts in dim_data.items():
                cf.global_prefs[dim][style] = tuple(counts)

        cf._cache_dirty = True
        return cf


# Global instance
_response_cf: Optional[ResponseStyleCF] = None


def get_response_cf() -> ResponseStyleCF:
    """Get global ResponseStyleCF instance."""
    global _response_cf
    if _response_cf is None:
        _response_cf = ResponseStyleCF()
    return _response_cf


def personalize_response(
    user_id: str,
    candidates: List[Dict[str, Any]],
    weight: float = 0.3,
) -> List[Dict[str, Any]]:
    """
    Re-rank response candidates based on user preferences.

    Args:
        user_id: User ID
        candidates: List of candidate responses with 'text' and 'score' fields
        weight: How much to weight CF scores vs original scores

    Returns:
        Re-ranked candidates with updated scores
    """
    cf = get_response_cf()
    prefs = cf.get_user_preferences(user_id)

    for candidate in candidates:
        text = candidate.get('text', '')
        styles = cf.classify_response_style(text)

        # Compute CF score
        cf_score = 0.0
        for dim, style in styles.items():
            dim_prefs = prefs.get(dim, {})
            cf_score += dim_prefs.get(style, 0.5)
        cf_score /= len(styles) if styles else 1

        # Store style classification
        candidate['style_classification'] = styles
        candidate['cf_score'] = cf_score

        # Blend with original score
        original_score = candidate.get('score', 0.5)
        candidate['score'] = (1 - weight) * original_score + weight * cf_score

    # Sort by new score
    candidates.sort(key=lambda x: x.get('score', 0), reverse=True)

    return candidates
