"""
Trie (Prefix Tree) Data Structure for Fast Keyword Matching.

Used for:
- Fast persona keyword detection
- Autocomplete suggestions
- Pattern matching
- Entity recognition
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class TrieNode:
    """A node in the Trie."""
    children: Dict[str, "TrieNode"] = field(default_factory=dict)
    is_end: bool = False
    data: Optional[Any] = None
    count: int = 0  # How many times this word was inserted


class Trie:
    """
    Trie (Prefix Tree) implementation.

    Supports:
    - Insert words with associated data
    - Exact match search
    - Prefix search
    - Wildcard matching
    - Autocomplete suggestions
    """

    def __init__(self, case_sensitive: bool = False):
        """
        Initialize Trie.

        Args:
            case_sensitive: Whether matching is case-sensitive
        """
        self.root = TrieNode()
        self.case_sensitive = case_sensitive
        self.word_count = 0

    def _normalize(self, word: str) -> str:
        """Normalize word based on case sensitivity."""
        return word if self.case_sensitive else word.lower()

    def insert(self, word: str, data: Optional[Any] = None):
        """
        Insert a word into the Trie.

        Args:
            word: Word to insert
            data: Optional data associated with the word
        """
        word = self._normalize(word)
        node = self.root

        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]

        if not node.is_end:
            self.word_count += 1
        node.is_end = True
        node.count += 1
        node.data = data

    def insert_many(self, words: List[str], data_list: Optional[List[Any]] = None):
        """Insert multiple words."""
        data_list = data_list or [None] * len(words)
        for word, data in zip(words, data_list):
            self.insert(word, data)

    def search(self, word: str) -> bool:
        """
        Check if word exists in Trie.

        Args:
            word: Word to search

        Returns:
            True if word exists
        """
        node = self._find_node(word)
        return node is not None and node.is_end

    def search_with_data(self, word: str) -> Optional[Tuple[bool, Any]]:
        """
        Search for word and return associated data.

        Args:
            word: Word to search

        Returns:
            (exists, data) tuple or None
        """
        node = self._find_node(word)
        if node is not None and node.is_end:
            return (True, node.data)
        return None

    def _find_node(self, prefix: str) -> Optional[TrieNode]:
        """Find node for a prefix."""
        prefix = self._normalize(prefix)
        node = self.root

        for char in prefix:
            if char not in node.children:
                return None
            node = node.children[char]

        return node

    def starts_with(self, prefix: str) -> bool:
        """
        Check if any word starts with prefix.

        Args:
            prefix: Prefix to check

        Returns:
            True if any word starts with prefix
        """
        return self._find_node(prefix) is not None

    def get_words_with_prefix(
        self,
        prefix: str,
        max_results: int = 10,
    ) -> List[Tuple[str, Any]]:
        """
        Get all words starting with prefix.

        Args:
            prefix: Prefix to search
            max_results: Maximum results to return

        Returns:
            List of (word, data) tuples
        """
        node = self._find_node(prefix)
        if node is None:
            return []

        results = []
        self._collect_words(node, self._normalize(prefix), results, max_results)
        return results

    def _collect_words(
        self,
        node: TrieNode,
        prefix: str,
        results: List[Tuple[str, Any]],
        max_results: int,
    ):
        """Recursively collect words from node."""
        if len(results) >= max_results:
            return

        if node.is_end:
            results.append((prefix, node.data))

        for char, child in node.children.items():
            if len(results) >= max_results:
                return
            self._collect_words(child, prefix + char, results, max_results)

    def autocomplete(
        self,
        prefix: str,
        max_suggestions: int = 5,
    ) -> List[str]:
        """
        Get autocomplete suggestions for prefix.

        Args:
            prefix: Prefix to complete
            max_suggestions: Maximum suggestions

        Returns:
            List of complete words
        """
        results = self.get_words_with_prefix(prefix, max_suggestions)
        return [word for word, _ in results]

    def find_all_matches(self, text: str) -> List[Tuple[str, int, Any]]:
        """
        Find all Trie words that appear in text.

        Args:
            text: Text to search in

        Returns:
            List of (word, position, data) tuples
        """
        text = self._normalize(text)
        matches = []

        for i in range(len(text)):
            node = self.root
            j = i

            while j < len(text) and text[j] in node.children:
                node = node.children[text[j]]
                j += 1

                if node.is_end:
                    word = text[i:j]
                    matches.append((word, i, node.data))

        return matches

    def find_longest_match(self, text: str, start: int = 0) -> Optional[Tuple[str, Any]]:
        """
        Find longest matching word starting at position.

        Args:
            text: Text to search
            start: Starting position

        Returns:
            (word, data) tuple or None
        """
        text = self._normalize(text)
        node = self.root
        last_match = None
        i = start

        while i < len(text) and text[i] in node.children:
            node = node.children[text[i]]
            i += 1

            if node.is_end:
                last_match = (text[start:i], node.data)

        return last_match

    def delete(self, word: str) -> bool:
        """
        Delete a word from Trie.

        Args:
            word: Word to delete

        Returns:
            True if word was deleted
        """
        word = self._normalize(word)

        def _delete(node: TrieNode, depth: int) -> bool:
            if depth == len(word):
                if not node.is_end:
                    return False
                node.is_end = False
                node.count = 0
                node.data = None
                return len(node.children) == 0

            char = word[depth]
            if char not in node.children:
                return False

            should_delete = _delete(node.children[char], depth + 1)

            if should_delete:
                del node.children[char]
                return len(node.children) == 0 and not node.is_end

            return False

        deleted = _delete(self.root, 0)
        if deleted or self.search(word) is False:
            self.word_count = max(0, self.word_count - 1)
        return True

    def get_stats(self) -> Dict:
        """Get Trie statistics."""
        def count_nodes(node: TrieNode) -> int:
            return 1 + sum(count_nodes(c) for c in node.children.values())

        return {
            "word_count": self.word_count,
            "node_count": count_nodes(self.root),
            "case_sensitive": self.case_sensitive,
        }


class PersonaKeywordTrie:
    """
    Trie specialized for persona keyword detection.

    Maintains separate Tries per persona for efficient
    keyword-based persona detection.
    """

    def __init__(self):
        """Initialize persona keyword Trie."""
        self.tries: Dict[str, Trie] = {}
        self.all_keywords = Trie()

        # Default persona keywords
        self._init_default_keywords()

    def _init_default_keywords(self):
        """Initialize with default persona keywords."""
        persona_keywords = {
            "Elio": [
                "elio", "space", "alien", "stars", "cosmic", "universe",
                "amazing", "wow", "cool", "astronomy", "rocket", "planet",
                "galaxy", "satellite", "ambassador", "communiverse"
            ],
            "Glordon": [
                "glordon", "friend", "potato", "kind", "hug", "love",
                "gentle", "soft", "warm", "together", "buddy", "pal"
            ],
            "Olga": [
                "olga", "aunt", "discipline", "military", "air force",
                "proper", "important", "safety", "protect", "careful",
                "training", "duty", "major"
            ],
            "Lord Grigon": [
                "grigon", "hylurg", "warrior", "honor", "battle", "conquest",
                "power", "strength", "tradition", "glory"
            ],
            "Questa": [
                "questa", "gom", "mind", "thoughts", "sense", "feel",
                "never alone", "connection", "empathy"
            ],
            "Auva": [
                "auva", "manual", "positive", "vibes", "optimist",
                "peace", "love", "user's manual"
            ],
        }

        for persona, keywords in persona_keywords.items():
            trie = Trie(case_sensitive=False)
            for kw in keywords:
                trie.insert(kw, {"persona": persona, "weight": 1.0})
                self.all_keywords.insert(kw, {"persona": persona, "weight": 1.0})
            self.tries[persona] = trie

    def add_keywords(
        self,
        persona: str,
        keywords: List[str],
        weight: float = 1.0,
    ):
        """
        Add keywords for a persona.

        Args:
            persona: Persona name
            keywords: Keywords to add
            weight: Keyword weight for scoring
        """
        if persona not in self.tries:
            self.tries[persona] = Trie(case_sensitive=False)

        for kw in keywords:
            self.tries[persona].insert(kw, {"persona": persona, "weight": weight})
            self.all_keywords.insert(kw, {"persona": persona, "weight": weight})

    def detect_keywords(
        self,
        text: str,
    ) -> List[Tuple[str, str, float, int]]:
        """
        Detect all persona keywords in text.

        Args:
            text: Text to search

        Returns:
            List of (keyword, persona, weight, position) tuples
        """
        matches = self.all_keywords.find_all_matches(text)
        results = []

        for word, pos, data in matches:
            if data:
                results.append((
                    word,
                    data.get("persona", "unknown"),
                    data.get("weight", 1.0),
                    pos,
                ))

        return results

    def score_for_persona(self, text: str, persona: str) -> float:
        """
        Get keyword match score for a specific persona.

        Args:
            text: Text to analyze
            persona: Persona to score for

        Returns:
            Score based on keyword matches
        """
        if persona not in self.tries:
            return 0.0

        matches = self.tries[persona].find_all_matches(text)
        if not matches:
            return 0.0

        # Sum weights of matches
        total_weight = sum(
            m[2].get("weight", 1.0) if m[2] else 1.0
            for m in matches
        )

        # Normalize by text length
        text_len = len(text.split())
        if text_len == 0:
            return 0.0

        return min(1.0, total_weight / (text_len * 0.5))

    def detect_persona(self, text: str) -> Tuple[str, float]:
        """
        Detect most likely persona based on keywords.

        Args:
            text: Text to analyze

        Returns:
            (persona_name, confidence) tuple
        """
        scores = {}
        for persona in self.tries:
            scores[persona] = self.score_for_persona(text, persona)

        if not scores or max(scores.values()) == 0:
            return ("default", 0.0)

        best_persona = max(scores, key=scores.get)
        confidence = scores[best_persona]

        return (best_persona, confidence)

    def load_from_jsonl(self, path: Path) -> "PersonaKeywordTrie":
        """
        Learn additional keywords from training data.

        Extracts frequent words from persona responses.
        """
        from collections import Counter

        if not path.exists():
            return self

        persona_words: Dict[str, Counter] = {}

        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                obj = json.loads(line)
                messages = obj.get("messages", [])
                metadata = obj.get("metadata", {})

                persona = metadata.get("character", metadata.get("persona"))
                if not persona:
                    continue

                # Get assistant response
                response = next(
                    (m["content"] for m in messages if m.get("role") == "assistant"),
                    "",
                )

                if response:
                    if persona not in persona_words:
                        persona_words[persona] = Counter()
                    words = response.lower().split()
                    persona_words[persona].update(words)

        # Add top words as keywords
        stopwords = {
            "i", "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "to", "of", "and", "in", "that", "it", "for", "on", "with", "as",
            "at", "by", "this", "but", "from", "or", "have", "had", "not",
            "you", "your", "my", "me", "we", "us", "they", "their", "them",
        }

        for persona, counter in persona_words.items():
            top_words = [
                w for w, c in counter.most_common(50)
                if w not in stopwords and len(w) > 3 and c > 2
            ][:20]

            self.add_keywords(persona, top_words, weight=0.5)

        return self


# Singleton instance
_PERSONA_TRIE: Optional[PersonaKeywordTrie] = None


def get_persona_trie() -> PersonaKeywordTrie:
    """Get or create singleton PersonaKeywordTrie."""
    global _PERSONA_TRIE
    if _PERSONA_TRIE is None:
        _PERSONA_TRIE = PersonaKeywordTrie()
        # Try to load additional keywords from training data
        repo_root = Path(__file__).resolve().parents[3]
        training_path = repo_root / "data" / "training" / "final-complete-training-data.jsonl"
        if training_path.exists():
            _PERSONA_TRIE.load_from_jsonl(training_path)
    return _PERSONA_TRIE


def detect_persona_keywords(text: str) -> Tuple[str, float]:
    """
    Convenience function for persona detection.

    Args:
        text: Text to analyze

    Returns:
        (persona_name, confidence) tuple
    """
    return get_persona_trie().detect_persona(text)
