"""
Cascade router for response selection.
Combines rule-based filtering with probabilistic selection.
"""
from __future__ import annotations

import random
import re
from typing import Dict, List, Optional, Tuple

from .ensemble import Candidate


class CascadeRouter:
    """
    Three-layer cascade for response selection:
    1. Safety Rules (hard constraints) - Must pass
    2. Context Scoring (soft constraints) - Weighted scoring
    3. Probabilistic Selection - Human-like variability

    This ensures responses are safe, contextually appropriate,
    and naturally varied.
    """

    # Content filter patterns (block these)
    BLOCKED_PATTERNS = [
        r'\b(fuck|shit|damn|hell)\b',  # Profanity (adjust as needed)
        # Add more patterns as needed
    ]

    # Persona consistency keywords (per persona)
    PERSONA_KEYWORDS = {
        'elio': ['space', 'cosmic', 'stars', 'alien', 'lonely', 'curious', 'amazing'],
        'glordon': ['haha', 'funny', 'friend', 'play', 'joke'],
        'olga': ['discipline', 'proper', 'important', 'listen', 'understand'],
    }

    def __init__(self, persona_meta: Optional[Dict[str, Dict]] = None):
        """
        Initialize cascade router.

        Args:
            persona_meta: Persona metadata from personas.json
        """
        self.persona_meta = persona_meta or {}
        self.blocked_patterns = [re.compile(p, re.IGNORECASE) for p in self.BLOCKED_PATTERNS]

    def route(
        self,
        context: Dict,
        candidates: List[Candidate],
        cf_scores: Optional[List[float]] = None,
    ) -> Optional[Candidate]:
        """
        Route through cascade to select final response.

        Args:
            context: Generation context (persona, message, mood, etc.)
            candidates: List of candidates to choose from
            cf_scores: Optional CF scores per candidate

        Returns:
            Selected candidate or fallback
        """
        if not candidates:
            return self._create_fallback(context)

        # Apply CF scores if provided
        if cf_scores:
            for i, candidate in enumerate(candidates):
                if i < len(cf_scores):
                    candidate.cf_score = cf_scores[i]

        # Layer 1: Safety filtering (hard rules)
        safe_candidates = self._apply_safety_rules(candidates, context)

        if not safe_candidates:
            return self._create_fallback(context)

        # Layer 2: Context scoring (soft rules)
        scored_candidates = self._score_context_fit(safe_candidates, context)

        # Layer 3: Probabilistic selection
        return self._probabilistic_select(scored_candidates)

    def _apply_safety_rules(
        self,
        candidates: List[Candidate],
        context: Dict,
    ) -> List[Candidate]:
        """
        Filter candidates through safety rules.
        These are hard constraints that must pass.

        Args:
            candidates: Input candidates
            context: Generation context

        Returns:
            Filtered safe candidates
        """
        safe = []

        for candidate in candidates:
            text = candidate.text or ''

            # Rule 1: Non-empty text
            if not text.strip():
                continue

            # Rule 2: Content filter
            if not self._passes_content_filter(text):
                continue

            # Rule 3: Length bounds (reasonable response length)
            word_count = len(text.split())
            if word_count < 2 or word_count > 150:
                continue

            # Rule 4: Persona consistency (soft check - lower confidence if fails)
            if not self._passes_persona_consistency(candidate, context):
                candidate.confidence *= 0.7

            # Rule 5: No broken formatting
            if text.count('{') != text.count('}'):
                continue  # Unfilled template slots
            if text.count('*') % 2 != 0:
                continue  # Broken emote markers

            safe.append(candidate)

        return safe

    def _passes_content_filter(self, text: str) -> bool:
        """Check if text passes content filter."""
        for pattern in self.blocked_patterns:
            if pattern.search(text):
                return False
        return True

    def _passes_persona_consistency(
        self,
        candidate: Candidate,
        context: Dict,
    ) -> bool:
        """
        Check if response is consistent with persona.
        This is a soft check - we don't block but lower confidence.

        Args:
            candidate: Candidate to check
            context: Context with persona info

        Returns:
            True if consistent, False otherwise
        """
        persona = context.get('persona', '').lower()
        text = candidate.text.lower()

        # Check for persona-specific keywords
        keywords = self.PERSONA_KEYWORDS.get(persona, [])
        if not keywords:
            return True  # No constraints for unknown personas

        # At least some consistency is good
        matches = sum(1 for kw in keywords if kw in text)
        return matches > 0 or len(text.split()) < 20  # Short responses get a pass

    def _score_context_fit(
        self,
        candidates: List[Candidate],
        context: Dict,
    ) -> List[Candidate]:
        """
        Score candidates for context appropriateness.

        Args:
            candidates: Safe candidates
            context: Generation context

        Returns:
            Candidates with updated context_score
        """
        for candidate in candidates:
            score = 1.0

            # Scenario matching
            scenario = context.get('scenario')
            if scenario:
                score *= self._scenario_match_score(candidate, scenario)

            # Mood alignment
            mood = context.get('mood')
            if mood:
                score *= self._mood_alignment_score(candidate, mood)

            # History coherence
            history = context.get('history', [])
            if history:
                score *= self._history_coherence_score(candidate, history)

            # Persona style match
            persona = context.get('persona')
            if persona:
                score *= self._persona_style_score(candidate, persona)

            candidate.context_score = max(0.1, score)

        return candidates

    def _scenario_match_score(self, candidate: Candidate, scenario: str) -> float:
        """Score based on scenario appropriateness."""
        text = candidate.text.lower()
        scenario_lower = scenario.lower()

        # Simple keyword matching
        if scenario_lower == 'greeting':
            greet_words = ['hi', 'hello', 'hey', 'welcome', 'nice to']
            if any(w in text for w in greet_words):
                return 1.3
        elif scenario_lower == 'advice':
            advice_words = ['think', 'suggest', 'maybe', 'try', 'could']
            if any(w in text for w in advice_words):
                return 1.2
        elif scenario_lower == 'feelings':
            feel_words = ['feel', 'understand', 'care', 'support']
            if any(w in text for w in feel_words):
                return 1.2

        return 1.0

    def _mood_alignment_score(self, candidate: Candidate, mood: str) -> float:
        """Score based on mood alignment."""
        text = candidate.text.lower()

        mood_indicators = {
            'excited': ['!', 'wow', 'amazing', 'awesome', 'incredible'],
            'curious': ['?', 'wonder', 'how', 'why', 'what'],
            'warm': ['smile', 'glad', 'happy', 'care', 'appreciate'],
            'playful': ['haha', 'lol', 'funny', 'joke', 'play'],
            'concerned': ['worried', 'careful', 'make sure', 'okay'],
        }

        indicators = mood_indicators.get(mood, [])
        if not indicators:
            return 1.0

        matches = sum(1 for ind in indicators if ind in text)
        if matches > 0:
            return 1.0 + (0.1 * min(matches, 3))  # Up to 1.3x boost

        return 0.9  # Slight penalty for mood mismatch

    def _history_coherence_score(
        self,
        candidate: Candidate,
        history: List[Dict],
    ) -> float:
        """Score based on coherence with conversation history."""
        if not history:
            return 1.0

        # Check for repetition with recent bot responses
        recent_bot_texts = [
            h.get('content', '').lower()
            for h in history[-3:]
            if h.get('role') == 'assistant'
        ]

        text = candidate.text.lower()
        text_words = set(text.split())

        for recent in recent_bot_texts:
            recent_words = set(recent.split())
            if not text_words or not recent_words:
                continue

            overlap = len(text_words & recent_words) / len(text_words | recent_words)
            if overlap > 0.5:
                return 0.5  # Penalize high similarity

        return 1.0

    def _persona_style_score(self, candidate: Candidate, persona: str) -> float:
        """Score based on persona style match."""
        meta = self.persona_meta.get(persona, {})
        if not meta:
            return 1.0

        text = candidate.text.lower()
        score = 1.0

        # Check for persona-specific speaking style keywords
        speaking_style = (meta.get('speaking_style') or '').lower()
        if speaking_style:
            style_words = speaking_style.split()[:5]  # First 5 words
            for word in style_words:
                if len(word) > 3 and word in text:
                    score *= 1.1

        return min(1.5, score)

    def _probabilistic_select(
        self,
        candidates: List[Candidate],
    ) -> Candidate:
        """
        Probabilistically select final candidate.
        Not always picking the best - adds human-like variability.

        Args:
            candidates: Scored candidates

        Returns:
            Selected candidate
        """
        if not candidates:
            raise ValueError("No candidates to select from")

        # Compute final scores
        weights = []
        for candidate in candidates:
            w = candidate.final_score
            w = max(0.05, w)  # Floor to avoid zero probability
            weights.append(w)

        # Normalize to probabilities
        total = sum(weights)
        probs = [w / total for w in weights]

        # Random selection based on weights
        r = random.random()
        cumulative = 0.0
        for candidate, prob in zip(candidates, probs):
            cumulative += prob
            if r <= cumulative:
                return candidate

        return candidates[-1]

    def _create_fallback(self, context: Dict) -> Candidate:
        """
        Create fallback response when nothing passes safety.

        Args:
            context: Generation context

        Returns:
            Safe fallback candidate
        """
        persona = context.get('persona', 'default')
        meta = self.persona_meta.get(persona, {})

        # Use persona openers if available
        openers = meta.get('openers', [])
        if openers:
            text = random.choice(openers)
        else:
            # Generic fallbacks
            fallbacks = [
                "I'm here to help!",
                "That's interesting.",
                "Tell me more!",
                "I appreciate you sharing that.",
            ]
            text = random.choice(fallbacks)

        return Candidate(
            text=text,
            source='fallback',
            confidence=0.1,
            weight=1.0,
            metadata={'reason': 'safety_fallback'},
        )

    def add_blocked_pattern(self, pattern: str):
        """Add a pattern to the block list."""
        self.blocked_patterns.append(re.compile(pattern, re.IGNORECASE))

    def set_persona_meta(self, persona_meta: Dict[str, Dict]):
        """Update persona metadata."""
        self.persona_meta = persona_meta


# Singleton instance
_ROUTER: Optional[CascadeRouter] = None


def get_cascade_router() -> CascadeRouter:
    """Get or create singleton cascade router."""
    global _ROUTER
    if _ROUTER is None:
        _ROUTER = CascadeRouter()
    return _ROUTER
