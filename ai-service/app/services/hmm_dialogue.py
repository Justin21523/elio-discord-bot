"""
Hidden Markov Model for dialogue state tracking.
Tracks mood and topic across conversation turns.
"""
from __future__ import annotations

import json
import random
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class DialogueHMM:
    """
    Two-layer HMM for dialogue state tracking.

    Layer 1: Mood (emotional state)
    Layer 2: Topic (conversation topic)

    States transition probabilistically based on observed user messages.
    """

    # Mood states
    MOOD_STATES = ['neutral', 'curious', 'warm', 'playful', 'concerned', 'excited']

    # Topic states
    TOPIC_STATES = ['greeting', 'personal', 'advice', 'lore', 'feelings', 'general']

    def __init__(self, persona_name: str = 'default'):
        """
        Initialize dialogue HMM.

        Args:
            persona_name: Persona name for personalized transitions
        """
        self.persona = persona_name

        # Current states
        self.current_mood = 'neutral'
        self.current_topic = 'greeting'

        # Transition matrices
        self.mood_transitions = self._init_mood_transitions(persona_name)
        self.topic_transitions = self._init_topic_transitions()

        # Observation likelihood (keywords -> state probabilities)
        self.mood_keywords = self._init_mood_keywords()
        self.topic_keywords = self._init_topic_keywords()

        # History for context
        self.history: List[Dict] = []
        self.max_history = 10

    def _init_mood_transitions(self, persona: str) -> Dict[str, Dict[str, float]]:
        """
        Initialize mood transition matrix.
        Uses Add-k smoothing for small sample handling.

        Args:
            persona: Persona name for customization

        Returns:
            Transition matrix {from_state: {to_state: probability}}
        """
        # Base transitions (neutral prior)
        base = {
            'neutral': {'neutral': 0.15, 'curious': 0.25, 'warm': 0.25, 'playful': 0.15, 'concerned': 0.1, 'excited': 0.1},
            'curious': {'neutral': 0.1, 'curious': 0.35, 'warm': 0.2, 'playful': 0.15, 'concerned': 0.1, 'excited': 0.1},
            'warm': {'neutral': 0.1, 'curious': 0.2, 'warm': 0.35, 'playful': 0.15, 'concerned': 0.1, 'excited': 0.1},
            'playful': {'neutral': 0.1, 'curious': 0.15, 'warm': 0.2, 'playful': 0.35, 'concerned': 0.05, 'excited': 0.15},
            'concerned': {'neutral': 0.15, 'curious': 0.1, 'warm': 0.3, 'playful': 0.05, 'concerned': 0.3, 'excited': 0.1},
            'excited': {'neutral': 0.1, 'curious': 0.2, 'warm': 0.2, 'playful': 0.2, 'concerned': 0.05, 'excited': 0.25},
        }

        # Persona-specific adjustments
        persona_lower = persona.lower()

        if 'elio' in persona_lower:
            # Elio is more curious and excitable
            base['neutral']['curious'] += 0.1
            base['neutral']['excited'] += 0.05
            base['curious']['excited'] += 0.1
            base['warm']['curious'] += 0.05

        elif 'glordon' in persona_lower:
            # Glordon is more playful
            base['neutral']['playful'] += 0.1
            base['playful']['playful'] += 0.1
            base['curious']['playful'] += 0.1

        elif 'olga' in persona_lower:
            # Olga is more neutral/concerned
            base['neutral']['neutral'] += 0.1
            base['warm']['neutral'] += 0.1
            base['playful']['neutral'] += 0.1

        # Normalize probabilities
        for from_state in base:
            total = sum(base[from_state].values())
            for to_state in base[from_state]:
                base[from_state][to_state] /= total

        return base

    def _init_topic_transitions(self) -> Dict[str, Dict[str, float]]:
        """Initialize topic transition matrix."""
        return {
            'greeting': {'greeting': 0.1, 'personal': 0.25, 'advice': 0.15, 'lore': 0.2, 'feelings': 0.15, 'general': 0.15},
            'personal': {'greeting': 0.05, 'personal': 0.35, 'advice': 0.2, 'lore': 0.1, 'feelings': 0.2, 'general': 0.1},
            'advice': {'greeting': 0.05, 'personal': 0.2, 'advice': 0.35, 'lore': 0.1, 'feelings': 0.15, 'general': 0.15},
            'lore': {'greeting': 0.05, 'personal': 0.1, 'advice': 0.1, 'lore': 0.4, 'feelings': 0.1, 'general': 0.25},
            'feelings': {'greeting': 0.05, 'personal': 0.3, 'advice': 0.2, 'lore': 0.05, 'feelings': 0.3, 'general': 0.1},
            'general': {'greeting': 0.1, 'personal': 0.2, 'advice': 0.15, 'lore': 0.15, 'feelings': 0.15, 'general': 0.25},
        }

    def _init_mood_keywords(self) -> Dict[str, List[str]]:
        """Initialize mood detection keywords."""
        return {
            'curious': ['what', 'how', 'why', 'when', 'where', 'who', 'wonder', 'curious', '?', 'explain', 'tell me'],
            'warm': ['thank', 'appreciate', 'love', 'glad', 'happy', 'nice', 'kind', 'friend', 'care', 'miss'],
            'playful': ['lol', 'haha', 'funny', 'joke', 'play', 'game', 'fun', '😂', '😄', 'kidding'],
            'concerned': ['worried', 'problem', 'issue', 'help', 'wrong', 'sad', 'afraid', 'scared', 'anxious', 'stress'],
            'excited': ['wow', 'amazing', 'awesome', 'cool', 'incredible', '!', 'omg', 'exciting', 'love', 'best'],
        }

    def _init_topic_keywords(self) -> Dict[str, List[str]]:
        """Initialize topic detection keywords."""
        return {
            'greeting': ['hi', 'hello', 'hey', 'morning', 'evening', 'night', "what's up", 'sup', 'greetings'],
            'personal': ['you', 'your', 'yourself', 'life', 'day', 'doing', 'been', 'family', 'work'],
            'advice': ['should', 'advice', 'help', 'what do', 'recommend', 'suggest', 'think', 'opinion'],
            'lore': ['communiverse', 'space', 'alien', 'elio', 'glordon', 'olga', 'story', 'world', 'universe'],
            'feelings': ['feel', 'emotion', 'sad', 'happy', 'angry', 'love', 'hate', 'like', 'dislike', 'mood'],
            'general': [],  # Fallback
        }

    def update_state(
        self,
        user_message: str,
        history: Optional[List[Dict]] = None,
    ) -> Tuple[str, str]:
        """
        Update HMM state based on user message.

        Args:
            user_message: Latest user message
            history: Optional conversation history

        Returns:
            Tuple of (new_mood, new_topic)
        """
        if history:
            self.history = history[-self.max_history:]

        # Extract observation features
        message_lower = user_message.lower()

        # Compute observation likelihoods for mood
        mood_likelihoods = self._compute_mood_likelihoods(message_lower)

        # Compute observation likelihoods for topic
        topic_likelihoods = self._compute_topic_likelihoods(message_lower)

        # Forward step: combine prior (current state) with observation and transition
        new_mood = self._sample_next_state(
            self.current_mood,
            self.mood_transitions,
            mood_likelihoods,
        )

        new_topic = self._sample_next_state(
            self.current_topic,
            self.topic_transitions,
            topic_likelihoods,
        )

        # Update current states
        self.current_mood = new_mood
        self.current_topic = new_topic

        # Track in history
        self.history.append({
            'message': user_message[:100],  # Truncate
            'mood': new_mood,
            'topic': new_topic,
        })

        return new_mood, new_topic

    def _compute_mood_likelihoods(self, message: str) -> Dict[str, float]:
        """
        Compute likelihood of each mood given message.

        Args:
            message: Lowercase user message

        Returns:
            Dict of mood -> likelihood
        """
        likelihoods = {mood: 0.1 for mood in self.MOOD_STATES}  # Base likelihood

        for mood, keywords in self.mood_keywords.items():
            for keyword in keywords:
                if keyword in message:
                    likelihoods[mood] += 0.2

        # Normalize
        total = sum(likelihoods.values())
        return {mood: p / total for mood, p in likelihoods.items()}

    def _compute_topic_likelihoods(self, message: str) -> Dict[str, float]:
        """
        Compute likelihood of each topic given message.

        Args:
            message: Lowercase user message

        Returns:
            Dict of topic -> likelihood
        """
        likelihoods = {topic: 0.1 for topic in self.TOPIC_STATES}

        for topic, keywords in self.topic_keywords.items():
            for keyword in keywords:
                if keyword in message:
                    likelihoods[topic] += 0.2

        # General is fallback
        if max(likelihoods.values()) < 0.2:
            likelihoods['general'] += 0.3

        # Normalize
        total = sum(likelihoods.values())
        return {topic: p / total for topic, p in likelihoods.items()}

    def _sample_next_state(
        self,
        current: str,
        transitions: Dict[str, Dict[str, float]],
        likelihoods: Dict[str, float],
    ) -> str:
        """
        Sample next state using transition and observation probabilities.

        Args:
            current: Current state
            transitions: Transition matrix
            likelihoods: Observation likelihoods

        Returns:
            Sampled next state
        """
        # Get transition probabilities from current state
        trans_probs = transitions.get(current, {})

        # Combine with observation likelihoods (product + normalize)
        combined = {}
        for state in likelihoods:
            trans = trans_probs.get(state, 0.1)
            obs = likelihoods.get(state, 0.1)
            combined[state] = trans * obs

        # Normalize
        total = sum(combined.values())
        if total <= 0:
            return current

        probs = {state: p / total for state, p in combined.items()}

        # Sample
        r = random.random()
        cumulative = 0.0
        for state, prob in probs.items():
            cumulative += prob
            if r <= cumulative:
                return state

        return current

    def get_state(self) -> Dict[str, str]:
        """Get current state."""
        return {
            'mood': self.current_mood,
            'topic': self.current_topic,
        }

    def reset(self):
        """Reset to initial state."""
        self.current_mood = 'neutral'
        self.current_topic = 'greeting'
        self.history = []

    def get_mood_filler(self) -> str:
        """
        Get a mood-appropriate filler/emote.

        Returns:
            Filler string (e.g., "*smiles*")
        """
        fillers = {
            'neutral': ['', '*nods*', '*thinks*'],
            'curious': ['*leans in*', '*eyes widen*', '*tilts head*'],
            'warm': ['*smiles softly*', '*nods warmly*', '*gentle expression*'],
            'playful': ['*chuckles*', '*grins*', '*winks*'],
            'concerned': ['*furrows brow*', '*looks worried*', '*pauses*'],
            'excited': ['*eyes light up*', '*bounces*', '*beams*'],
        }

        options = fillers.get(self.current_mood, [''])
        return random.choice(options)

    def to_dict(self) -> Dict:
        """Serialize state to dict."""
        return {
            'persona': self.persona,
            'current_mood': self.current_mood,
            'current_topic': self.current_topic,
            'history': self.history[-5:],  # Keep last 5
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'DialogueHMM':
        """Deserialize from dict."""
        instance = cls(data.get('persona', 'default'))
        instance.current_mood = data.get('current_mood', 'neutral')
        instance.current_topic = data.get('current_topic', 'greeting')
        instance.history = data.get('history', [])
        return instance


class DialogueHMMManager:
    """
    Manages multiple DialogueHMM instances per persona.
    Handles persistence and cleanup.
    """

    def __init__(self):
        self.hmms: Dict[str, DialogueHMM] = {}
        self.max_inactive_hmms = 100

    def get_hmm(self, persona: str) -> DialogueHMM:
        """
        Get or create HMM for persona.

        Args:
            persona: Persona name

        Returns:
            DialogueHMM instance
        """
        key = persona.lower()
        if key not in self.hmms:
            self.hmms[key] = DialogueHMM(persona)

            # Cleanup if too many
            if len(self.hmms) > self.max_inactive_hmms:
                self._cleanup_oldest()

        return self.hmms[key]

    def update(
        self,
        persona: str,
        user_message: str,
        history: Optional[List[Dict]] = None,
    ) -> Tuple[str, str]:
        """
        Update HMM state for persona.

        Args:
            persona: Persona name
            user_message: User message
            history: Optional conversation history

        Returns:
            Tuple of (mood, topic)
        """
        hmm = self.get_hmm(persona)
        return hmm.update_state(user_message, history)

    def get_state(self, persona: str) -> Dict[str, str]:
        """Get current state for persona."""
        hmm = self.get_hmm(persona)
        return hmm.get_state()

    def reset(self, persona: str):
        """Reset HMM for persona."""
        key = persona.lower()
        if key in self.hmms:
            self.hmms[key].reset()

    def _cleanup_oldest(self):
        """Remove oldest HMMs to free memory."""
        # Simple strategy: remove half
        to_remove = list(self.hmms.keys())[: len(self.hmms) // 2]
        for key in to_remove:
            del self.hmms[key]


# Singleton manager
_MANAGER: Optional[DialogueHMMManager] = None


def get_hmm_manager() -> DialogueHMMManager:
    """Get or create singleton HMM manager."""
    global _MANAGER
    if _MANAGER is None:
        _MANAGER = DialogueHMMManager()
    return _MANAGER
