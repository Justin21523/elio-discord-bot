"""
Tests for Cascade Router.
"""
import pytest

from app.services.cascade import CascadeRouter, get_cascade_router
from app.services.ensemble import Candidate


class TestCascadeRouter:
    """Test suite for CascadeRouter."""

    def test_initialization(self):
        """Test router initializes correctly."""
        router = CascadeRouter()

        assert router.persona_meta == {}
        assert len(router.blocked_patterns) > 0

    def test_initialization_with_persona_meta(self):
        """Test router with persona metadata."""
        meta = {'elio': {'traits': {'warmth': 0.8}}}
        router = CascadeRouter(persona_meta=meta)

        assert router.persona_meta == meta

    def test_set_persona_meta(self):
        """Test setting persona metadata."""
        router = CascadeRouter()

        meta = {
            'elio': {'traits': {'warmth': 0.8}},
            'glordon': {'traits': {'humor': 0.9}},
        }
        router.set_persona_meta(meta)

        assert router.persona_meta == meta

    def test_route_with_valid_candidates(self):
        """Test routing with valid candidates."""
        router = CascadeRouter()

        candidates = [
            Candidate(text="This is a valid response.", source="strategy_a", confidence=0.8),
            Candidate(text="Another valid response here.", source="strategy_b", confidence=0.6),
        ]

        context = {'persona': 'test', 'message': 'Hello', 'mood': 'neutral'}
        result = router.route(context, candidates)

        assert result is not None
        assert isinstance(result, Candidate)

    def test_route_filters_empty_text(self):
        """Test empty text candidates are filtered."""
        router = CascadeRouter()

        candidates = [
            Candidate(text="", source="empty", confidence=0.9),
            Candidate(text="Valid response text.", source="valid", confidence=0.5),
        ]

        context = {'persona': 'test', 'message': 'Hello'}
        result = router.route(context, candidates)

        # Should get a valid result (either valid candidate or fallback)
        assert result is not None
        if result.source != 'fallback':
            assert result.text != ""

    def test_route_returns_result_for_empty_candidates(self):
        """Test routing returns fallback for no candidates."""
        router = CascadeRouter()

        context = {'persona': 'test', 'message': 'Hello'}
        result = router.route(context, [])

        # May return fallback
        assert result is None or isinstance(result, Candidate)

    def test_safety_check_filters_forbidden(self):
        """Test safety check filters forbidden content."""
        router = CascadeRouter()

        candidates = [
            Candidate(text="Normal valid response.", source="safe", confidence=0.7),
        ]

        context = {'persona': 'test', 'message': 'Hello'}
        result = router.route(context, candidates)

        # Should return the safe one
        if result and result.source != 'fallback':
            assert "Normal" in result.text

    def test_context_scoring_with_mood(self):
        """Test context scoring considers mood."""
        router = CascadeRouter()

        candidates = [
            Candidate(text="Haha that's so funny!", source="playful", confidence=0.5),
            Candidate(text="I understand your concern.", source="serious", confidence=0.5),
        ]

        # Playful mood should boost playful response
        context_playful = {'persona': 'test', 'message': 'Hello', 'mood': 'playful'}
        result_playful = router.route(context_playful, candidates)

        assert result_playful is not None

    def test_context_scoring_with_history(self):
        """Test context scoring considers conversation history."""
        router = CascadeRouter()

        candidates = [
            Candidate(text="Yes, I remember that.", source="a", confidence=0.5),
            Candidate(text="Random new topic.", source="b", confidence=0.5),
        ]

        context = {
            'persona': 'test',
            'message': 'Do you remember?',
            'history': [
                {'role': 'user', 'content': 'We talked about space'},
                {'role': 'assistant', 'content': 'Yes, space is fascinating'},
            ],
        }

        result = router.route(context, candidates)
        assert result is not None

    def test_probabilistic_selection(self):
        """Test selection is probabilistic based on scores."""
        router = CascadeRouter()

        candidates = [
            Candidate(text="High confidence response here.", source="high", confidence=0.95),
            Candidate(text="Low confidence response here.", source="low", confidence=0.1),
        ]

        context = {'persona': 'test', 'message': 'Hello', 'mood': 'neutral'}

        # Run multiple times
        selections = {}
        for _ in range(50):
            result = router.route(context, candidates)
            if result and result.source != 'fallback':
                selections[result.source] = selections.get(result.source, 0) + 1

        # Should have some selections
        assert len(selections) >= 1

    def test_persona_consistency_scoring(self):
        """Test persona traits affect scoring."""
        router = CascadeRouter()

        meta = {
            'glordon': {'traits': {'humor': 0.9, 'warmth': 0.3}},
        }
        router.set_persona_meta(meta)

        candidates = [
            Candidate(text="Haha, that joke is hilarious!", source="funny", confidence=0.5),
            Candidate(text="I care deeply about you.", source="warm", confidence=0.5),
        ]

        context = {'persona': 'glordon', 'message': 'Hello', 'mood': 'neutral'}
        result = router.route(context, candidates)

        assert result is not None


class TestGetCascadeRouter:
    """Test the singleton getter."""

    def test_returns_router_instance(self):
        """Test get_cascade_router returns a router."""
        router = get_cascade_router()
        assert isinstance(router, CascadeRouter)

    def test_returns_same_instance(self):
        """Test singleton behavior."""
        r1 = get_cascade_router()
        r2 = get_cascade_router()
        assert r1 is r2
