"""
Shared pytest fixtures for ML model tests.
"""
import json
import tempfile
from pathlib import Path
from typing import Dict, List

import pytest


# Sample training data for tests
SAMPLE_TRAINING_DATA = [
    {
        "messages": [
            {"role": "system", "content": "You are Elio, a curious space ambassador."},
            {"role": "user", "content": "Hello! How are you?"},
            {"role": "assistant", "content": "Greetings, friend! I'm doing wonderfully. The universe is full of amazing things to explore!"}
        ],
        "metadata": {"character": "Elio", "scenario": "greeting"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Elio, a curious space ambassador."},
            {"role": "user", "content": "What's your favorite planet?"},
            {"role": "assistant", "content": "Oh, that's a tough one! I love Earth because of all the amazing humans I've met. But Neptune has such beautiful rings!"}
        ],
        "metadata": {"character": "Elio", "scenario": "question"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Glordon, a friendly potato-like alien."},
            {"role": "user", "content": "I'm feeling sad today."},
            {"role": "assistant", "content": "Oh friend, I understand those feelings. Would you like a warm potato hug? I'm here for you."}
        ],
        "metadata": {"character": "Glordon", "scenario": "feelings"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Glordon, a friendly potato-like alien."},
            {"role": "user", "content": "Can you help me with something?"},
            {"role": "assistant", "content": "Of course, friend! I would love to help you. What do you need?"}
        ],
        "metadata": {"character": "Glordon", "scenario": "advice"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Olga, a disciplined military aunt."},
            {"role": "user", "content": "How should I stay safe?"},
            {"role": "assistant", "content": "Safety is very important! Always be aware of your surroundings and follow proper protocols."}
        ],
        "metadata": {"character": "Olga", "scenario": "advice"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Olga, a disciplined military aunt."},
            {"role": "user", "content": "Tell me about your training."},
            {"role": "assistant", "content": "My air force training was rigorous but rewarding. Discipline and dedication are key to success."}
        ],
        "metadata": {"character": "Olga", "scenario": "lore"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Elio, a curious space ambassador."},
            {"role": "user", "content": "What do you think about stars?"},
            {"role": "assistant", "content": "Stars are absolutely fascinating! Each one is a sun, potentially with planets and maybe even life forms we haven't discovered yet!"}
        ],
        "metadata": {"character": "Elio", "scenario": "question"}
    },
    {
        "messages": [
            {"role": "system", "content": "You are Glordon, a friendly potato-like alien."},
            {"role": "user", "content": "Let's play a game!"},
            {"role": "assistant", "content": "Yay, games are so fun! What kind of game would you like to play, friend?"}
        ],
        "metadata": {"character": "Glordon", "scenario": "action"}
    },
]


# Sample documents for BM25/IR tests
SAMPLE_DOCUMENTS = [
    {"id": "doc1", "text": "The universe is vast and full of mysteries. Stars, planets, and galaxies await exploration."},
    {"id": "doc2", "text": "Potatoes are wonderful vegetables. They can be baked, fried, or mashed into delicious dishes."},
    {"id": "doc3", "text": "Military training requires discipline and dedication. Safety protocols must be followed."},
    {"id": "doc4", "text": "Space exploration has led to amazing discoveries about our solar system and beyond."},
    {"id": "doc5", "text": "Friendship is one of the most important aspects of life. Friends support each other."},
    {"id": "doc6", "text": "The cosmic rays from distant stars carry information about the universe's history."},
    {"id": "doc7", "text": "Emotions are a natural part of being alive. It's okay to feel sad, happy, or excited."},
    {"id": "doc8", "text": "The Communiverse is home to many different alien species who live together in harmony."},
]


@pytest.fixture
def sample_corpus() -> List[str]:
    """Sample text corpus for language models."""
    return [
        "Hello friend how are you today",
        "The universe is full of amazing wonders",
        "I love exploring new planets and stars",
        "Would you like to play a game together",
        "Safety and discipline are very important",
        "Let me tell you about space exploration",
        "Friends always support each other",
        "The stars are beautiful tonight",
        "I feel happy when we talk together",
        "This is a wonderful adventure we share",
    ]


@pytest.fixture
def sample_documents() -> List[Dict]:
    """Sample documents for retrieval tests."""
    return SAMPLE_DOCUMENTS.copy()


@pytest.fixture
def sample_training_data() -> List[Dict]:
    """Sample training data in JSONL format."""
    return SAMPLE_TRAINING_DATA.copy()


@pytest.fixture
def training_data_path(sample_training_data, tmp_path) -> Path:
    """Create a temporary JSONL file with training data."""
    file_path = tmp_path / "training-data.jsonl"
    with file_path.open("w", encoding="utf-8") as f:
        for item in sample_training_data:
            f.write(json.dumps(item) + "\n")
    return file_path


@pytest.fixture
def sample_texts() -> List[str]:
    """Sample texts for classification tests."""
    return [
        "Hello! How are you?",
        "What is the meaning of life?",
        "I'm feeling really sad today",
        "Can you help me with something?",
        "Tell me about Elio and the Communiverse",
        "Let's play a game together!",
        "Good morning, friend!",
        "Why do stars twinkle?",
    ]


@pytest.fixture
def sample_labels() -> List[str]:
    """Sample intent labels matching sample_texts."""
    return [
        "greeting",
        "question",
        "feelings",
        "advice",
        "lore",
        "action",
        "greeting",
        "question",
    ]


@pytest.fixture
def mood_texts() -> List[str]:
    """Sample texts for mood/sentiment classification."""
    return [
        "This is amazing! I love it!",
        "I'm so sad and worried about this.",
        "Haha, that's really funny!",
        "What do you think about that?",
        "Thank you so much for your help!",
        "I'm okay, nothing special.",
        "Wow, that's incredible news!",
        "I'm a bit concerned about the situation.",
    ]


@pytest.fixture
def mood_labels() -> List[str]:
    """Sample mood labels matching mood_texts."""
    return [
        "excited",
        "concerned",
        "playful",
        "curious",
        "warm",
        "neutral",
        "excited",
        "concerned",
    ]


@pytest.fixture
def persona_keywords() -> Dict[str, List[str]]:
    """Sample persona keywords for trie tests."""
    return {
        "Elio": ["space", "stars", "universe", "cosmic", "planet", "amazing"],
        "Glordon": ["friend", "potato", "hug", "love", "warm", "together"],
        "Olga": ["discipline", "safety", "training", "military", "protocol"],
    }


@pytest.fixture
def word_pairs() -> List[tuple]:
    """Sample word pairs for PMI tests."""
    return [
        ("space", "stars"),
        ("space", "universe"),
        ("friend", "love"),
        ("safety", "discipline"),
        ("planet", "cosmic"),
    ]


@pytest.fixture
def response_candidates() -> List[Dict]:
    """Sample response candidates for selector tests."""
    return [
        {
            "text": "Hello! I'm excited to talk with you!",
            "source": "tfidf_markov",
            "features": {"similarity_score": 0.8, "confidence": 0.7},
        },
        {
            "text": "Greetings, friend! How can I help?",
            "source": "template_fill",
            "features": {"similarity_score": 0.6, "confidence": 0.8},
        },
        {
            "text": "Hi there! Nice to meet you!",
            "source": "ngram_blend",
            "features": {"similarity_score": 0.7, "confidence": 0.6},
        },
    ]


@pytest.fixture
def selection_context() -> Dict:
    """Sample context for response selection."""
    return {
        "query": "Hello there!",
        "intent": "greeting",
        "mood": "neutral",
        "persona": "Elio",
    }


# Helper functions for tests


def create_temp_jsonl(data: List[Dict], tmp_path: Path, filename: str = "data.jsonl") -> Path:
    """Helper to create temporary JSONL file."""
    file_path = tmp_path / filename
    with file_path.open("w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item) + "\n")
    return file_path
