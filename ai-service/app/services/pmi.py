"""
Pointwise Mutual Information (PMI) for Word Association Analysis.

PMI measures the association between two words:
PMI(x, y) = log2(P(x, y) / (P(x) * P(y)))

High PMI = words co-occur more than expected by chance
Zero PMI = words are independent
Negative PMI = words co-occur less than expected

Used for:
- Finding related words/phrases
- Query expansion
- Topic coherence
- Persona vocabulary analysis
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


@dataclass
class PMIStats:
    """Statistics for PMI analysis."""
    total_words: int = 0
    unique_words: int = 0
    total_pairs: int = 0
    unique_pairs: int = 0
    top_associations: List[Tuple[str, str, float]] = field(default_factory=list)


class PMICalculator:
    """
    Pointwise Mutual Information calculator for word associations.

    Supports:
    - Standard PMI
    - Positive PMI (PPMI) - clips negative values
    - Normalized PMI (NPMI) - normalized to [-1, 1]
    - PMI with window size control
    """

    def __init__(
        self,
        window_size: int = 5,
        min_count: int = 2,
        smoothing: float = 0.0,
    ):
        """
        Initialize PMI calculator.

        Args:
            window_size: Co-occurrence window size
            min_count: Minimum word count threshold
            smoothing: Laplace smoothing factor
        """
        self.window_size = window_size
        self.min_count = min_count
        self.smoothing = smoothing

        # Counts
        self.word_counts: Counter = Counter()
        self.pair_counts: Counter = Counter()
        self.total_words: int = 0
        self.total_pairs: int = 0

        # Vocabulary
        self.vocab: Set[str] = set()

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words."""
        words = []
        for word in text.lower().split():
            word = word.strip(".,!?;:\"'()[]{}").strip()
            if word and len(word) > 1:
                words.append(word)
        return words

    def add_document(self, text: str):
        """
        Add a document to the corpus.

        Args:
            text: Text document
        """
        tokens = self._tokenize(text)
        if not tokens:
            return

        # Update word counts
        self.word_counts.update(tokens)
        self.total_words += len(tokens)
        self.vocab.update(tokens)

        # Count co-occurrences within window
        for i, word1 in enumerate(tokens):
            # Look at words within window
            start = max(0, i - self.window_size)
            end = min(len(tokens), i + self.window_size + 1)

            for j in range(start, end):
                if i != j:
                    word2 = tokens[j]
                    # Use sorted pair for consistency
                    pair = tuple(sorted([word1, word2]))
                    self.pair_counts[pair] += 1
                    self.total_pairs += 1

    def train(self, corpus: List[str]) -> "PMICalculator":
        """
        Train on a corpus of documents.

        Args:
            corpus: List of text documents
        """
        for doc in corpus:
            self.add_document(doc)
        return self

    def train_from_jsonl(self, path: Path) -> "PMICalculator":
        """
        Train from JSONL file.

        Args:
            path: Path to training data
        """
        if not path.exists():
            return self

        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                obj = json.loads(line)
                messages = obj.get("messages", [])

                # Add both user and assistant messages
                for msg in messages:
                    content = msg.get("content", "")
                    if content:
                        self.add_document(content)

        return self

    def pmi(self, word1: str, word2: str) -> float:
        """
        Calculate PMI between two words.

        PMI(x, y) = log2(P(x, y) / (P(x) * P(y)))

        Args:
            word1: First word
            word2: Second word

        Returns:
            PMI score (can be negative)
        """
        word1 = word1.lower()
        word2 = word2.lower()

        # Get counts
        count1 = self.word_counts.get(word1, 0)
        count2 = self.word_counts.get(word2, 0)

        pair = tuple(sorted([word1, word2]))
        pair_count = self.pair_counts.get(pair, 0)

        # Apply minimum count threshold
        if count1 < self.min_count or count2 < self.min_count:
            return 0.0

        if pair_count == 0:
            return float("-inf")

        # Calculate probabilities with smoothing
        vocab_size = len(self.vocab)
        smoothing = self.smoothing

        p_x = (count1 + smoothing) / (self.total_words + smoothing * vocab_size)
        p_y = (count2 + smoothing) / (self.total_words + smoothing * vocab_size)
        p_xy = (pair_count + smoothing) / (self.total_pairs + smoothing * vocab_size * vocab_size)

        if p_x == 0 or p_y == 0 or p_xy == 0:
            return 0.0

        return math.log2(p_xy / (p_x * p_y))

    def ppmi(self, word1: str, word2: str) -> float:
        """
        Calculate Positive PMI (clips negative values to 0).

        Args:
            word1: First word
            word2: Second word

        Returns:
            PPMI score (>= 0)
        """
        return max(0.0, self.pmi(word1, word2))

    def npmi(self, word1: str, word2: str) -> float:
        """
        Calculate Normalized PMI (range [-1, 1]).

        NPMI(x, y) = PMI(x, y) / -log2(P(x, y))

        Args:
            word1: First word
            word2: Second word

        Returns:
            NPMI score in [-1, 1]
        """
        word1 = word1.lower()
        word2 = word2.lower()

        pair = tuple(sorted([word1, word2]))
        pair_count = self.pair_counts.get(pair, 0)

        if pair_count == 0:
            return -1.0

        vocab_size = len(self.vocab)
        p_xy = (pair_count + self.smoothing) / (self.total_pairs + self.smoothing * vocab_size * vocab_size)

        if p_xy == 0 or p_xy == 1:
            return 0.0

        pmi_val = self.pmi(word1, word2)
        h_xy = -math.log2(p_xy)

        if h_xy == 0:
            return 0.0

        return pmi_val / h_xy

    def get_associations(
        self,
        word: str,
        top_k: int = 10,
        use_ppmi: bool = True,
    ) -> List[Tuple[str, float]]:
        """
        Get words most associated with the given word.

        Args:
            word: Target word
            top_k: Number of associations to return
            use_ppmi: Use PPMI (True) or raw PMI (False)

        Returns:
            List of (word, score) tuples
        """
        word = word.lower()

        if word not in self.vocab:
            return []

        associations = []
        score_fn = self.ppmi if use_ppmi else self.pmi

        for other_word in self.vocab:
            if other_word != word:
                score = score_fn(word, other_word)
                if score > 0 or not use_ppmi:
                    associations.append((other_word, score))

        # Sort by score descending
        associations.sort(key=lambda x: x[1], reverse=True)
        return associations[:top_k]

    def expand_query(
        self,
        query: str,
        expansion_terms: int = 3,
        weight_decay: float = 0.5,
    ) -> List[Tuple[str, float]]:
        """
        Expand query with associated terms.

        Args:
            query: Query text
            expansion_terms: Number of terms to add per query word
            weight_decay: Weight decay for expansion terms

        Returns:
            List of (term, weight) tuples including original and expansion terms
        """
        tokens = self._tokenize(query)
        if not tokens:
            return []

        # Original terms get weight 1.0
        terms = {token: 1.0 for token in tokens}

        # Add associated terms
        for token in tokens:
            associations = self.get_associations(token, top_k=expansion_terms)
            for assoc_word, score in associations:
                # Normalize score and apply decay
                weight = min(1.0, score / 10.0) * weight_decay
                if assoc_word in terms:
                    terms[assoc_word] = max(terms[assoc_word], weight)
                else:
                    terms[assoc_word] = weight

        return sorted(terms.items(), key=lambda x: x[1], reverse=True)

    def topic_coherence(self, words: List[str]) -> float:
        """
        Calculate topic coherence using NPMI.

        Higher coherence = words are more related to each other.

        Args:
            words: List of topic words

        Returns:
            Average pairwise NPMI
        """
        if len(words) < 2:
            return 0.0

        scores = []
        for i, word1 in enumerate(words):
            for word2 in words[i + 1:]:
                score = self.npmi(word1, word2)
                if score > float("-inf"):
                    scores.append(score)

        if not scores:
            return 0.0

        return sum(scores) / len(scores)

    def get_stats(self) -> PMIStats:
        """Get statistics about the PMI model."""
        # Get top associations
        top_pairs = []
        for pair, count in self.pair_counts.most_common(100):
            if count >= self.min_count:
                score = self.ppmi(pair[0], pair[1])
                if score > 0:
                    top_pairs.append((pair[0], pair[1], score))

        top_pairs.sort(key=lambda x: x[2], reverse=True)

        return PMIStats(
            total_words=self.total_words,
            unique_words=len(self.vocab),
            total_pairs=self.total_pairs,
            unique_pairs=len(self.pair_counts),
            top_associations=top_pairs[:20],
        )


class PersonaPMI:
    """
    PMI calculator with persona-specific word associations.

    Maintains separate PMI models per persona to capture
    persona-specific vocabulary and associations.
    """

    def __init__(self, window_size: int = 5):
        """Initialize persona PMI models."""
        self.models: Dict[str, PMICalculator] = {}
        self.global_model = PMICalculator(window_size=window_size)
        self.window_size = window_size
        self._loaded = False

    def load_from_jsonl(self, path: Path) -> "PersonaPMI":
        """
        Load training data and build persona-specific PMI models.

        Args:
            path: Path to JSONL training file
        """
        if not path.exists():
            return self

        persona_texts: Dict[str, List[str]] = defaultdict(list)

        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                obj = json.loads(line)
                messages = obj.get("messages", [])
                metadata = obj.get("metadata", {})

                persona = metadata.get("character", metadata.get("persona", "default"))

                # Get assistant (persona) response
                for msg in messages:
                    if msg.get("role") == "assistant":
                        content = msg.get("content", "")
                        if content:
                            persona_texts[persona].append(content)
                            self.global_model.add_document(content)

        # Build persona-specific models
        for persona, texts in persona_texts.items():
            model = PMICalculator(window_size=self.window_size)
            model.train(texts)
            self.models[persona] = model

        self._loaded = True
        return self

    def get_associations(
        self,
        word: str,
        persona: Optional[str] = None,
        top_k: int = 10,
    ) -> List[Tuple[str, float]]:
        """
        Get word associations, optionally for a specific persona.

        Args:
            word: Target word
            persona: Optional persona name
            top_k: Number of associations

        Returns:
            List of (word, score) tuples
        """
        if persona and persona in self.models:
            return self.models[persona].get_associations(word, top_k)
        return self.global_model.get_associations(word, top_k)

    def expand_query(
        self,
        query: str,
        persona: Optional[str] = None,
        expansion_terms: int = 3,
    ) -> List[Tuple[str, float]]:
        """
        Expand query using persona-specific associations.

        Args:
            query: Query text
            persona: Optional persona name
            expansion_terms: Number of expansion terms per word

        Returns:
            List of (term, weight) tuples
        """
        if persona and persona in self.models:
            return self.models[persona].expand_query(query, expansion_terms)
        return self.global_model.expand_query(query, expansion_terms)

    def persona_vocabulary_similarity(
        self,
        persona1: str,
        persona2: str,
        sample_words: int = 50,
    ) -> float:
        """
        Calculate vocabulary similarity between two personas.

        Uses overlap of top associated words.

        Args:
            persona1: First persona
            persona2: Second persona
            sample_words: Number of words to sample

        Returns:
            Jaccard similarity of top associations
        """
        if persona1 not in self.models or persona2 not in self.models:
            return 0.0

        model1 = self.models[persona1]
        model2 = self.models[persona2]

        # Get top words for each persona
        top1 = set()
        top2 = set()

        for word in list(model1.vocab)[:sample_words]:
            assocs = model1.get_associations(word, top_k=5)
            top1.update(w for w, _ in assocs)

        for word in list(model2.vocab)[:sample_words]:
            assocs = model2.get_associations(word, top_k=5)
            top2.update(w for w, _ in assocs)

        if not top1 or not top2:
            return 0.0

        # Jaccard similarity
        intersection = len(top1 & top2)
        union = len(top1 | top2)

        return intersection / union if union > 0 else 0.0

    def score_response_fit(
        self,
        response: str,
        persona: str,
    ) -> float:
        """
        Score how well a response fits a persona's vocabulary.

        Uses average PMI of word pairs with persona vocabulary.

        Args:
            response: Response text
            persona: Persona name

        Returns:
            Fit score (higher = better fit)
        """
        if persona not in self.models:
            return 0.5

        model = self.models[persona]
        tokens = model._tokenize(response)

        if not tokens:
            return 0.5

        # Get average PMI with persona vocabulary
        scores = []
        persona_vocab = list(model.vocab)[:100]

        for token in tokens:
            for vocab_word in persona_vocab:
                if token != vocab_word:
                    score = model.ppmi(token, vocab_word)
                    if score > 0:
                        scores.append(score)

        if not scores:
            return 0.5

        avg_score = sum(scores) / len(scores)
        # Normalize to 0-1 range
        return min(1.0, avg_score / 5.0)


# Singleton instance
_PERSONA_PMI: Optional[PersonaPMI] = None


def get_persona_pmi() -> PersonaPMI:
    """Get or create singleton PersonaPMI."""
    global _PERSONA_PMI
    if _PERSONA_PMI is None:
        _PERSONA_PMI = PersonaPMI()
        # Try to load from default training data path
        repo_root = Path(__file__).resolve().parents[3]
        training_path = repo_root / "data" / "training" / "final-complete-training-data.jsonl"
        if training_path.exists():
            _PERSONA_PMI.load_from_jsonl(training_path)
    return _PERSONA_PMI


def get_word_associations(
    word: str,
    persona: Optional[str] = None,
    top_k: int = 10,
) -> List[Tuple[str, float]]:
    """
    Convenience function for getting word associations.

    Args:
        word: Target word
        persona: Optional persona for context
        top_k: Number of associations

    Returns:
        List of (word, score) tuples
    """
    return get_persona_pmi().get_associations(word, persona, top_k)
