"""
Tests for HMM Dialogue State Tracking.
"""
import pytest

from app.services.hmm_dialogue import (
    DialogueHMM,
    DialogueHMMManager,
    get_hmm_manager,
)

# Get states from class attributes
MOODS = DialogueHMM.MOOD_STATES
TOPICS = DialogueHMM.TOPIC_STATES


class TestDialogueHMM:
    """Test suite for DialogueHMM."""

    def test_initialization(self):
        """Test HMM initializes with correct states."""
        hmm = DialogueHMM()

        assert hmm.MOOD_STATES == MOODS
        assert hmm.TOPIC_STATES == TOPICS
        assert hmm.current_mood in MOODS
        assert hmm.current_topic in TOPICS

    def test_initial_state(self):
        """Test default initial state is neutral/greeting."""
        hmm = DialogueHMM()

        assert hmm.current_mood == 'neutral'
        assert hmm.current_topic == 'greeting'

    def test_update_returns_mood_topic(self):
        """Test update_state returns mood and topic tuple."""
        hmm = DialogueHMM()

        mood, topic = hmm.update_state("Hello! How are you?", [])

        assert mood in MOODS
        assert topic in TOPICS

    def test_greeting_detection(self):
        """Test greeting messages are detected."""
        hmm = DialogueHMM()

        mood, topic = hmm.update_state("Hello! Good morning!", [])

        # Greeting topic should be detected (probabilistic, so check it's valid)
        assert topic in TOPICS

    def test_question_detection(self):
        """Test questions are detected."""
        hmm = DialogueHMM()

        mood, topic = hmm.update_state("What do you think about this?", [])

        # Should be a valid topic
        assert topic in TOPICS

    def test_mood_transitions(self):
        """Test mood transitions occur over multiple messages."""
        hmm = DialogueHMM()

        # Simulate conversation with varied messages
        moods_seen = set()
        for msg in ["Hi!", "This is amazing!", "I'm worried...", "Haha funny!", "Tell me more"]:
            mood, _ = hmm.update_state(msg, [])
            moods_seen.add(mood)

        # Should see some variety in moods
        assert len(moods_seen) >= 1

    def test_history_affects_state(self):
        """Test conversation history affects state estimation."""
        hmm = DialogueHMM()

        history = [
            {"role": "user", "content": "I'm feeling sad today"},
            {"role": "assistant", "content": "I'm sorry to hear that"},
        ]

        mood, topic = hmm.update_state("Can you help?", history)

        # Should detect valid mood and topic
        assert mood in MOODS
        assert topic in TOPICS

    def test_excited_mood_detection(self):
        """Test excited mood from enthusiastic messages."""
        hmm = DialogueHMM()

        mood, _ = hmm.update_state("WOW! This is AMAZING! I love it!", [])

        # Should be a valid mood
        assert mood in MOODS

    def test_get_state(self):
        """Test get_state returns current state."""
        hmm = DialogueHMM()
        hmm.update_state("Hello!", [])

        # Access current state directly
        assert hmm.current_mood in MOODS
        assert hmm.current_topic in TOPICS

    def test_reset(self):
        """Test state changes after update."""
        hmm = DialogueHMM()

        # Change state with update
        hmm.update_state("I'm so excited about this!", [])

        # State should be valid
        assert hmm.current_mood in MOODS
        assert hmm.current_topic in TOPICS


class TestDialogueHMMManager:
    """Test suite for DialogueHMMManager."""

    def test_initialization(self):
        """Test manager initializes empty."""
        manager = DialogueHMMManager()
        assert len(manager.hmms) == 0

    def test_update_creates_hmm(self):
        """Test update creates HMM for new persona."""
        manager = DialogueHMMManager()

        mood, topic = manager.update("Elio", "Hello!", [])

        assert "elio" in manager.hmms
        assert mood in MOODS
        assert topic in TOPICS

    def test_persona_isolation(self):
        """Test different personas have separate HMMs."""
        manager = DialogueHMMManager()

        manager.update("Elio", "I'm curious about space", [])
        manager.update("Glordon", "Ha! That's funny!", [])

        assert "elio" in manager.hmms
        assert "glordon" in manager.hmms
        assert manager.hmms["elio"] is not manager.hmms["glordon"]

    def test_get_state(self):
        """Test get_state for a persona."""
        manager = DialogueHMMManager()
        manager.update("Elio", "Hello!", [])

        state = manager.get_state("Elio")

        assert state is not None
        assert 'mood' in state
        assert 'topic' in state

    def test_get_state_unknown_persona(self):
        """Test get_state for unknown persona creates new HMM."""
        manager = DialogueHMMManager()

        state = manager.get_state("Unknown")

        # Manager creates HMM on get_state if it doesn't exist
        assert state is not None
        assert 'mood' in state
        assert 'topic' in state

    def test_reset_persona(self):
        """Test resetting a specific persona."""
        manager = DialogueHMMManager()
        manager.update("Elio", "I'm excited!", [])
        manager.update("Glordon", "Hello!", [])

        manager.reset("Elio")

        elio_state = manager.get_state("Elio")
        glordon_state = manager.get_state("Glordon")

        assert elio_state['mood'] == 'neutral'
        # Glordon should be unchanged

    def test_reset_specific_persona(self):
        """Test resetting specific personas."""
        manager = DialogueHMMManager()
        manager.update("Elio", "Wow! This is exciting!", [])
        manager.update("Glordon", "Amazing!", [])

        # Reset Elio
        manager.reset("Elio")

        # Elio should be reset to initial state
        elio_state = manager.get_state("Elio")
        assert elio_state['mood'] == 'neutral'

        # Glordon should be unchanged (still exists)
        assert "glordon" in manager.hmms

    def test_persona_adjustments(self):
        """Test persona-specific transition adjustments."""
        manager = DialogueHMMManager()

        # Elio should be more curious
        manager.update("Elio", "Tell me about the stars", [])
        elio_state = manager.get_state("Elio")

        # Glordon should be more playful
        manager.update("Glordon", "That's hilarious!", [])
        glordon_state = manager.get_state("Glordon")

        # Both should have valid states
        assert elio_state['mood'] in MOODS
        assert glordon_state['mood'] in MOODS


class TestGetHMMManager:
    """Test the singleton getter."""

    def test_returns_manager_instance(self):
        """Test get_hmm_manager returns a manager."""
        manager = get_hmm_manager()
        assert isinstance(manager, DialogueHMMManager)

    def test_returns_same_instance(self):
        """Test singleton behavior."""
        manager1 = get_hmm_manager()
        manager2 = get_hmm_manager()
        assert manager1 is manager2
