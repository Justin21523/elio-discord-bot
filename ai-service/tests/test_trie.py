"""
Tests for Trie (Prefix Tree) Data Structure.
"""
import pytest

from app.services.trie import (
    TrieNode,
    Trie,
    PersonaKeywordTrie,
    get_persona_trie,
    detect_persona_keywords,
)


class TestTrieNode:
    """Test suite for TrieNode dataclass."""

    def test_initialization(self):
        """Test node initializes with defaults."""
        node = TrieNode()

        assert node.children == {}
        assert node.is_end == False
        assert node.data is None
        assert node.count == 0


class TestTrie:
    """Test suite for Trie."""

    def test_initialization(self):
        """Test trie initializes correctly."""
        trie = Trie()

        assert trie.case_sensitive == False
        assert trie.word_count == 0

    def test_initialization_case_sensitive(self):
        """Test case-sensitive trie."""
        trie = Trie(case_sensitive=True)

        assert trie.case_sensitive == True

    def test_insert_single_word(self):
        """Test inserting single word."""
        trie = Trie()
        trie.insert("hello")

        assert trie.word_count == 1
        assert trie.search("hello") == True

    def test_insert_with_data(self):
        """Test inserting word with data."""
        trie = Trie()
        trie.insert("hello", data={"meaning": "greeting"})

        result = trie.search_with_data("hello")
        assert result is not None
        assert result[0] == True
        assert result[1]["meaning"] == "greeting"

    def test_insert_many(self):
        """Test inserting multiple words."""
        trie = Trie()
        words = ["hello", "world", "test"]
        trie.insert_many(words)

        assert trie.word_count == 3
        for word in words:
            assert trie.search(word) == True

    def test_insert_many_with_data(self):
        """Test inserting multiple words with data."""
        trie = Trie()
        words = ["a", "b", "c"]
        data_list = [1, 2, 3]
        trie.insert_many(words, data_list)

        for word, data in zip(words, data_list):
            result = trie.search_with_data(word)
            assert result[1] == data

    def test_search_existing_word(self):
        """Test searching for existing word."""
        trie = Trie()
        trie.insert("hello")

        assert trie.search("hello") == True

    def test_search_nonexistent_word(self):
        """Test searching for nonexistent word."""
        trie = Trie()
        trie.insert("hello")

        assert trie.search("world") == False

    def test_search_partial_word(self):
        """Test searching for partial word (prefix only)."""
        trie = Trie()
        trie.insert("hello")

        # "hell" is a prefix but not a complete word
        assert trie.search("hell") == False

    def test_search_case_insensitive(self):
        """Test case-insensitive search."""
        trie = Trie(case_sensitive=False)
        trie.insert("Hello")

        assert trie.search("hello") == True
        assert trie.search("HELLO") == True

    def test_search_case_sensitive(self):
        """Test case-sensitive search."""
        trie = Trie(case_sensitive=True)
        trie.insert("Hello")

        assert trie.search("Hello") == True
        assert trie.search("hello") == False

    def test_starts_with_prefix(self):
        """Test prefix checking."""
        trie = Trie()
        trie.insert("hello")
        trie.insert("help")

        assert trie.starts_with("hel") == True
        assert trie.starts_with("hello") == True
        assert trie.starts_with("xyz") == False

    def test_get_words_with_prefix(self):
        """Test getting all words with prefix."""
        trie = Trie()
        trie.insert("hello")
        trie.insert("help")
        trie.insert("world")

        results = trie.get_words_with_prefix("hel")

        words = [r[0] for r in results]
        assert "hello" in words
        assert "help" in words
        assert "world" not in words

    def test_get_words_with_prefix_max_results(self):
        """Test max results limit."""
        trie = Trie()
        for i in range(20):
            trie.insert(f"word{i}")

        results = trie.get_words_with_prefix("word", max_results=5)

        assert len(results) == 5

    def test_autocomplete(self):
        """Test autocomplete suggestions."""
        trie = Trie()
        trie.insert("hello")
        trie.insert("help")
        trie.insert("helper")

        suggestions = trie.autocomplete("hel", max_suggestions=3)

        assert len(suggestions) <= 3
        assert all(s.startswith("hel") for s in suggestions)

    def test_find_all_matches(self):
        """Test finding all matches in text."""
        trie = Trie()
        trie.insert("space")
        trie.insert("star")

        matches = trie.find_all_matches("I love space and stars in the sky")

        words = [m[0] for m in matches]
        assert "space" in words
        assert "star" in words

    def test_find_all_matches_with_position(self):
        """Test matches include position."""
        trie = Trie()
        trie.insert("hello")

        matches = trie.find_all_matches("hello world")

        assert len(matches) > 0
        assert matches[0][0] == "hello"
        assert matches[0][1] == 0  # Position

    def test_find_longest_match(self):
        """Test finding longest match."""
        trie = Trie()
        trie.insert("test")
        trie.insert("testing")
        trie.insert("tester")

        result = trie.find_longest_match("testing123")

        assert result is not None
        assert result[0] == "testing"

    def test_delete_word(self):
        """Test deleting a word."""
        trie = Trie()
        trie.insert("hello")
        trie.insert("help")

        trie.delete("hello")

        assert trie.search("hello") == False
        assert trie.search("help") == True

    def test_delete_nonexistent(self):
        """Test deleting nonexistent word."""
        trie = Trie()
        trie.insert("hello")

        result = trie.delete("world")

        assert result == True  # Returns True even if not found

    def test_get_stats(self):
        """Test getting trie statistics."""
        trie = Trie()
        trie.insert("hello")
        trie.insert("help")
        trie.insert("world")

        stats = trie.get_stats()

        assert stats["word_count"] == 3
        assert stats["node_count"] > 0
        assert stats["case_sensitive"] == False


class TestPersonaKeywordTrie:
    """Test suite for PersonaKeywordTrie."""

    def test_initialization(self):
        """Test persona trie initializes with defaults."""
        trie = PersonaKeywordTrie()

        assert len(trie.tries) > 0
        assert trie.all_keywords is not None

    def test_has_default_personas(self):
        """Test default personas are initialized."""
        trie = PersonaKeywordTrie()

        assert "Elio" in trie.tries
        assert "Glordon" in trie.tries
        assert "Olga" in trie.tries

    def test_add_keywords(self, persona_keywords):
        """Test adding keywords for persona."""
        trie = PersonaKeywordTrie()

        trie.add_keywords("TestPersona", ["keyword1", "keyword2"], weight=0.8)

        assert "TestPersona" in trie.tries
        assert trie.tries["TestPersona"].search("keyword1") == True

    def test_detect_keywords_in_text(self):
        """Test detecting keywords in text."""
        trie = PersonaKeywordTrie()

        matches = trie.detect_keywords("I love exploring space and stars")

        assert len(matches) > 0
        # Should find Elio-related keywords
        personas = [m[1] for m in matches]
        assert "Elio" in personas

    def test_detect_keywords_returns_weight(self):
        """Test keyword detection includes weight."""
        trie = PersonaKeywordTrie()

        matches = trie.detect_keywords("space exploration")

        if matches:
            # (keyword, persona, weight, position)
            assert len(matches[0]) == 4
            assert isinstance(matches[0][2], float)

    def test_score_for_persona(self):
        """Test scoring text for specific persona."""
        trie = PersonaKeywordTrie()

        # Text with Elio keywords
        elio_score = trie.score_for_persona("space stars universe cosmic", "Elio")
        # Text with no keywords
        empty_score = trie.score_for_persona("xyz random text", "Elio")

        assert elio_score > empty_score

    def test_score_for_unknown_persona(self):
        """Test scoring for unknown persona returns 0."""
        trie = PersonaKeywordTrie()

        score = trie.score_for_persona("some text", "UnknownPersona")

        assert score == 0.0

    def test_detect_persona(self):
        """Test detecting most likely persona."""
        trie = PersonaKeywordTrie()

        # Text with Elio keywords
        persona, confidence = trie.detect_persona("I love space and stars!")

        assert persona == "Elio"
        assert confidence > 0

    def test_detect_persona_glordon(self):
        """Test detecting Glordon persona."""
        trie = PersonaKeywordTrie()

        persona, confidence = trie.detect_persona("My dear friend, I love you!")

        assert persona == "Glordon"

    def test_detect_persona_no_keywords(self):
        """Test detecting persona with no keywords."""
        trie = PersonaKeywordTrie()

        persona, confidence = trie.detect_persona("xyz random text 123")

        assert persona == "default"
        assert confidence == 0.0

    def test_load_from_jsonl(self, training_data_path):
        """Test loading additional keywords from JSONL."""
        trie = PersonaKeywordTrie()
        initial_count = trie.all_keywords.get_stats()["word_count"]

        trie.load_from_jsonl(training_data_path)

        # Should have more keywords after loading (or at least not fewer)
        final_count = trie.all_keywords.get_stats()["word_count"]
        assert final_count >= initial_count


class TestConvenienceFunctions:
    """Test singleton and convenience functions."""

    def test_get_persona_trie_returns_instance(self):
        """Test get_persona_trie returns trie."""
        trie = get_persona_trie()

        assert isinstance(trie, PersonaKeywordTrie)

    def test_get_persona_trie_singleton(self):
        """Test get_persona_trie returns same instance."""
        t1 = get_persona_trie()
        t2 = get_persona_trie()

        assert t1 is t2

    def test_detect_persona_keywords_convenience(self):
        """Test detect_persona_keywords convenience function."""
        persona, confidence = detect_persona_keywords("Space is amazing!")

        assert isinstance(persona, str)
        assert isinstance(confidence, float)


class TestDefaultKeywords:
    """Test default keyword configuration."""

    def test_elio_keywords(self):
        """Test Elio has expected keywords."""
        trie = PersonaKeywordTrie()

        elio_trie = trie.tries.get("Elio")
        assert elio_trie is not None
        assert elio_trie.search("space") == True
        assert elio_trie.search("stars") == True

    def test_glordon_keywords(self):
        """Test Glordon has expected keywords."""
        trie = PersonaKeywordTrie()

        glordon_trie = trie.tries.get("Glordon")
        assert glordon_trie is not None
        assert glordon_trie.search("friend") == True
        assert glordon_trie.search("potato") == True

    def test_olga_keywords(self):
        """Test Olga has expected keywords."""
        trie = PersonaKeywordTrie()

        olga_trie = trie.tries.get("Olga")
        assert olga_trie is not None
        assert olga_trie.search("discipline") == True
        assert olga_trie.search("safety") == True
