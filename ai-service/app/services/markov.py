"""
Markov chain text generator (CPU-only).
Supports variable order (1–3), temperature, and repetition penalty.
Training: from text corpus (list[str]); persistence: JSON-friendly.
"""
from __future__ import annotations
import json
import math
import random
from collections import defaultdict
from typing import Dict, List, Tuple


class MarkovModel:
    def __init__(self, order: int = 2):
        self.order = max(1, min(order, 3))
        self.transitions: Dict[Tuple[str, ...], Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def train(self, corpus: List[str]):
        for line in corpus:
            tokens = self._tokenize(line)
            if len(tokens) <= self.order:
                continue
            for i in range(len(tokens) - self.order):
                state = tuple(tokens[i : i + self.order])
                nxt = tokens[i + self.order]
                self.transitions[state][nxt] += 1

    def generate(
        self,
        seed: str = "",
        max_len: int = 50,
        temperature: float = 1.0,
        repetition_penalty: float = 1.1,
    ) -> str:
        if not self.transitions:
            return ""

        state = self._seed_state(seed)
        output = list(state)

        for _ in range(max_len - len(state)):
            dist = self.transitions.get(state)
            if not dist:
                break
            next_token = self._sample(dist, temperature, output, repetition_penalty)
            output.append(next_token)
            state = tuple(output[-self.order :])

        return self._detokenize(output)

    def to_json(self) -> str:
        data = {
            "order": self.order,
            "transitions": { "|".join(k): v for k, v in self.transitions.items() },
        }
        return json.dumps(data)

    @classmethod
    def from_json(cls, s: str) -> "MarkovModel":
        raw = json.loads(s)
        model = cls(raw.get("order", 2))
        for key, dist in raw.get("transitions", {}).items():
            state = tuple(key.split("|"))
            model.transitions[state] = defaultdict(int, dist)
        return model

    # --- helpers ---
    def _tokenize(self, text: str) -> List[str]:
        return text.strip().split()

    def _detokenize(self, tokens: List[str]) -> str:
        return " ".join(tokens)

    def _seed_state(self, seed: str) -> Tuple[str, ...]:
        if seed:
            tokens = self._tokenize(seed)
            if len(tokens) >= self.order:
                return tuple(tokens[-self.order :])
        # fallback: pick random state
        return random.choice(list(self.transitions.keys()))

    def _sample(
        self,
        dist: Dict[str, int],
        temperature: float,
        history: List[str],
        repetition_penalty: float,
    ) -> str:
        items = []
        total = 0.0
        history_counts = defaultdict(int)
        for t in history[-10:]:
            history_counts[t] += 1

        for token, count in dist.items():
            weight = count
            if history_counts[token] > 0:
                weight /= repetition_penalty ** history_counts[token]
            items.append((token, weight))
            total += weight

        if total <= 0:
            return random.choice(list(dist.keys()))

        # temperature scaling
        probs = []
        for token, weight in items:
            prob = math.pow(weight / total, 1.0 / max(0.1, temperature))
            probs.append((token, prob))

        sum_prob = sum(p for _, p in probs)
        r = random.random() * sum_prob
        cum = 0.0
        for token, prob in probs:
            cum += prob
            if r <= cum:
                return token
        return probs[-1][0]


def train_from_corpus(lines: List[str], order: int = 2) -> MarkovModel:
    model = MarkovModel(order)
    model.train(lines)
    return model
