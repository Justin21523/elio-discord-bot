"""
N-gram Language Model for text generation.

N-gram models predict the next word based on the previous N-1 words.
This implementation supports:
- Variable order (1-5 grams)
- Smoothing (Laplace, Kneser-Ney inspired)
- Temperature-based sampling
- Backoff to lower-order models
- Persona-specific vocabulary
"""
from __future__ import annotations

import json
import math
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


@dataclass
class NgramStats:
    """Statistics for n-gram analysis."""
    total_tokens: int = 0
    unique_tokens: int = 0
    ngram_counts: Dict[int, int] = field(default_factory=dict)
    top_ngrams: Dict[int, List[Tuple[tuple, int]]] = field(default_factory=dict)


class NgramLanguageModel:
    """
    N-gram language model with backoff smoothing.

    Supports multiple orders (1-5) and uses Stupid Backoff for
    smoothing when higher-order n-grams are not found.
    """

    def __init__(
        self,
        max_order: int = 3,
        smoothing_alpha: float = 0.4,
        min_count: int = 1,
    ):
        """
        Initialize n-gram model.

        Args:
            max_order: Maximum n-gram order (1-5)
            smoothing_alpha: Stupid Backoff smoothing factor (0-1)
            min_count: Minimum count threshold for n-grams
        """
        self.max_order = min(max_order, 5)
        self.smoothing_alpha = smoothing_alpha
        self.min_count = min_count

        # N-gram counts: ngrams[n][context] = Counter of next words
        self.ngrams: Dict[int, Dict[tuple, Counter]] = {
            n: defaultdict(Counter) for n in range(1, self.max_order + 1)
        }

        # Vocabulary
        self.vocab: set = set()
        self.vocab_size: int = 0

        # Special tokens
        self.BOS = "<BOS>"  # Beginning of sentence
        self.EOS = "<EOS>"  # End of sentence
        self.UNK = "<UNK>"  # Unknown token

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words."""
        # Simple whitespace tokenization with punctuation handling
        tokens = []
        for word in text.split():
            word = word.strip()
            if word:
                tokens.append(word.lower())
        return tokens

    def _add_sentence(self, tokens: List[str]):
        """Add a sentence to the model."""
        # Add BOS tokens
        padded = [self.BOS] * (self.max_order - 1) + tokens + [self.EOS]

        # Update vocabulary
        self.vocab.update(tokens)

        # Count n-grams for each order
        for n in range(1, self.max_order + 1):
            for i in range(len(padded) - n + 1):
                if n == 1:
                    context = ()
                else:
                    context = tuple(padded[i:i + n - 1])
                next_word = padded[i + n - 1]
                self.ngrams[n][context][next_word] += 1

    def train(self, corpus: List[str]) -> "NgramLanguageModel":
        """
        Train the model on a corpus.

        Args:
            corpus: List of text strings (sentences/documents)
        """
        for text in corpus:
            tokens = self._tokenize(text)
            if tokens:
                self._add_sentence(tokens)

        self.vocab_size = len(self.vocab)
        return self

    def _get_continuation_prob(
        self,
        context: tuple,
        word: str,
        order: int,
    ) -> float:
        """
        Get probability of word given context using Stupid Backoff.

        P(word|context) = C(context, word) / C(context) if high-order found
                        = alpha * P(word|shorter_context) otherwise
        """
        if order <= 0:
            # Unigram fallback with Laplace smoothing
            unigram_counts = self.ngrams[1][()]
            total = sum(unigram_counts.values())
            count = unigram_counts.get(word, 0)
            return (count + 1) / (total + self.vocab_size + 1)

        # Get context for this order
        if len(context) >= order - 1:
            ctx = context[-(order - 1):] if order > 1 else ()
        else:
            ctx = context

        ngram_dict = self.ngrams[order]
        if ctx in ngram_dict:
            counter = ngram_dict[ctx]
            total = sum(counter.values())
            count = counter.get(word, 0)

            if count >= self.min_count:
                return count / total

        # Backoff to lower order
        shorter_context = context[1:] if len(context) > 0 else ()
        return self.smoothing_alpha * self._get_continuation_prob(
            shorter_context, word, order - 1
        )

    def probability(self, word: str, context: List[str]) -> float:
        """
        Get probability of word given context.

        Args:
            word: Target word
            context: List of preceding words

        Returns:
            Probability P(word|context)
        """
        ctx = tuple(w.lower() for w in context)
        return self._get_continuation_prob(ctx, word.lower(), self.max_order)

    def log_probability(self, word: str, context: List[str]) -> float:
        """Get log probability of word given context."""
        prob = self.probability(word, context)
        return math.log(prob) if prob > 0 else float("-inf")

    def _sample_next(
        self,
        context: tuple,
        temperature: float = 1.0,
        top_k: int = 50,
    ) -> str:
        """
        Sample next word given context.

        Args:
            context: Tuple of preceding words
            temperature: Sampling temperature (higher = more random)
            top_k: Consider only top-k candidates
        """
        # Collect candidates from all orders
        candidates: Dict[str, float] = {}

        for order in range(self.max_order, 0, -1):
            if len(context) >= order - 1:
                ctx = context[-(order - 1):] if order > 1 else ()
            else:
                ctx = context

            if ctx in self.ngrams[order]:
                counter = self.ngrams[order][ctx]
                for word, count in counter.most_common(top_k):
                    if word not in candidates:
                        prob = self._get_continuation_prob(context, word, order)
                        candidates[word] = prob

        if not candidates:
            # Fall back to unigram sampling
            unigrams = self.ngrams[1][()]
            if unigrams:
                candidates = {w: c / sum(unigrams.values())
                              for w, c in unigrams.most_common(top_k)}

        if not candidates:
            return self.EOS

        # Apply temperature
        words = list(candidates.keys())
        probs = list(candidates.values())

        if temperature != 1.0:
            probs = [p ** (1 / temperature) for p in probs]

        # Normalize
        total = sum(probs)
        if total == 0:
            return random.choice(words)

        probs = [p / total for p in probs]

        # Sample
        return random.choices(words, weights=probs, k=1)[0]

    def generate(
        self,
        seed: str = "",
        max_len: int = 50,
        temperature: float = 1.0,
        repetition_penalty: float = 1.2,
        stop_tokens: Optional[List[str]] = None,
    ) -> str:
        """
        Generate text from the model.

        Args:
            seed: Initial text to continue from
            max_len: Maximum number of tokens to generate
            temperature: Sampling temperature
            repetition_penalty: Penalty for repeating tokens
            stop_tokens: Additional stop tokens

        Returns:
            Generated text string
        """
        stop_tokens = stop_tokens or []
        stop_set = {self.EOS} | set(stop_tokens)

        # Initialize with seed or BOS
        if seed:
            tokens = self._tokenize(seed)
        else:
            tokens = []

        # Pad context
        context = [self.BOS] * (self.max_order - 1) + tokens

        generated = []
        recent_tokens: Counter = Counter()

        for _ in range(max_len):
            ctx = tuple(context[-(self.max_order - 1):])

            # Sample next token
            next_token = self._sample_next(ctx, temperature)

            # Apply repetition penalty
            if repetition_penalty > 1.0 and next_token in recent_tokens:
                # Try again with higher temperature
                for attempt in range(3):
                    alt_token = self._sample_next(
                        ctx, temperature * (1 + attempt * 0.5)
                    )
                    if alt_token not in recent_tokens or alt_token == self.EOS:
                        next_token = alt_token
                        break

            if next_token in stop_set:
                break

            generated.append(next_token)
            context.append(next_token)
            recent_tokens[next_token] += 1

            # Decay recent token counts
            if len(generated) % 5 == 0:
                recent_tokens = Counter(
                    {k: max(0, v - 1) for k, v in recent_tokens.items() if v > 1}
                )

        return " ".join(generated)

    def perplexity(self, text: str) -> float:
        """
        Calculate perplexity of text under the model.

        Lower perplexity = better fit to the model.
        """
        tokens = self._tokenize(text)
        if not tokens:
            return float("inf")

        log_prob_sum = 0.0
        context = [self.BOS] * (self.max_order - 1)

        for token in tokens:
            log_prob = self.log_probability(token, context)
            log_prob_sum += log_prob
            context.append(token)
            context = context[-(self.max_order - 1):]

        avg_log_prob = log_prob_sum / len(tokens)
        return math.exp(-avg_log_prob)

    def get_stats(self) -> NgramStats:
        """Get statistics about the model."""
        stats = NgramStats(
            total_tokens=sum(sum(c.values()) for c in self.ngrams[1].values()),
            unique_tokens=self.vocab_size,
        )

        for n in range(1, self.max_order + 1):
            total_ngrams = sum(
                sum(c.values()) for c in self.ngrams[n].values()
            )
            stats.ngram_counts[n] = total_ngrams

            # Top n-grams
            all_ngrams = []
            for ctx, counter in self.ngrams[n].items():
                for word, count in counter.items():
                    ngram = ctx + (word,) if ctx else (word,)
                    all_ngrams.append((ngram, count))

            all_ngrams.sort(key=lambda x: x[1], reverse=True)
            stats.top_ngrams[n] = all_ngrams[:10]

        return stats


class PersonaNgramModel:
    """
    N-gram model specialized for persona responses.

    Maintains separate models per persona and supports
    vocabulary blending for more natural responses.
    """

    def __init__(self, max_order: int = 3):
        """Initialize persona n-gram models."""
        self.models: Dict[str, NgramLanguageModel] = {}
        self.max_order = max_order
        self._loaded = False

    def load_from_jsonl(self, path: Path) -> "PersonaNgramModel":
        """
        Load training data and build persona-specific models.

        Args:
            path: Path to JSONL training file
        """
        persona_corpus: Dict[str, List[str]] = defaultdict(list)

        if not path.exists():
            return self

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
                reply = next(
                    (m["content"] for m in messages if m.get("role") == "assistant"),
                    "",
                )

                if reply:
                    persona_corpus[persona].append(reply)

        # Train model for each persona
        for persona, corpus in persona_corpus.items():
            model = NgramLanguageModel(max_order=self.max_order)
            model.train(corpus)
            self.models[persona] = model

        # Train a "default" model with all responses
        all_corpus = []
        for corpus in persona_corpus.values():
            all_corpus.extend(corpus)
        if all_corpus:
            default_model = NgramLanguageModel(max_order=self.max_order)
            default_model.train(all_corpus)
            self.models["default"] = default_model

        self._loaded = True
        return self

    def generate(
        self,
        persona: str,
        seed: str = "",
        max_len: int = 50,
        temperature: float = 0.9,
        repetition_penalty: float = 1.2,
    ) -> str:
        """
        Generate text for a persona.

        Args:
            persona: Persona name
            seed: Initial text to continue
            max_len: Maximum tokens to generate
            temperature: Sampling temperature
            repetition_penalty: Penalty for repetition
        """
        model = self.models.get(persona, self.models.get("default"))
        if not model:
            return ""

        return model.generate(
            seed=seed,
            max_len=max_len,
            temperature=temperature,
            repetition_penalty=repetition_penalty,
        )

    def probability(
        self,
        persona: str,
        text: str,
    ) -> float:
        """
        Get probability of text under persona model.

        Returns inverse perplexity as a score in [0, 1].
        """
        model = self.models.get(persona, self.models.get("default"))
        if not model:
            return 0.0

        perplexity = model.perplexity(text)
        if perplexity == float("inf"):
            return 0.0

        # Convert perplexity to probability-like score
        # Lower perplexity = higher score
        return 1.0 / (1.0 + math.log(perplexity + 1))


# Singleton instance
_PERSONA_NGRAM: Optional[PersonaNgramModel] = None


def get_persona_ngram() -> PersonaNgramModel:
    """Get or create singleton PersonaNgramModel."""
    global _PERSONA_NGRAM
    if _PERSONA_NGRAM is None:
        _PERSONA_NGRAM = PersonaNgramModel(max_order=3)
        # Try to load from default training data path
        repo_root = Path(__file__).resolve().parents[3]
        training_path = repo_root / "data" / "training" / "final-complete-training-data.jsonl"
        if training_path.exists():
            _PERSONA_NGRAM.load_from_jsonl(training_path)
    return _PERSONA_NGRAM


def ngram_generate(
    persona: str,
    seed: str = "",
    max_len: int = 50,
    temperature: float = 0.9,
) -> str:
    """
    Convenience function for n-gram generation.

    Args:
        persona: Persona name
        seed: Initial text
        max_len: Maximum tokens
        temperature: Sampling temperature

    Returns:
        Generated text
    """
    return get_persona_ngram().generate(
        persona=persona,
        seed=seed,
        max_len=max_len,
        temperature=temperature,
    )
