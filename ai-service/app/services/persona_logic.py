"""
Logic-only persona responder (no LLM, CPU-friendly).
Uses TF-IDF similarity + Markov generation + persona style templates + simple mood HMM.
"""
from __future__ import annotations

import json
import logging
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .markov import train_from_corpus

logger = logging.getLogger(__name__)


@dataclass
class PersonaSample:
    user: str
    reply: str
    scenario: str


@dataclass
class PersonaModel:
    samples: List[PersonaSample]
    vectorizer: TfidfVectorizer
    matrix: np.ndarray
    markov_text: object
    mood_transitions: Dict[str, Dict[str, float]]
    current_mood: str


class PersonaLogicEngine:
    def __init__(self):
        repo_root = Path(__file__).resolve().parents[3]
        self.root = repo_root if (repo_root / "data").exists() else Path(__file__).resolve().parents[2]
        self.persona_meta = self._load_persona_meta()
        self.corpus = self._load_corpus()
        self.models: Dict[str, PersonaModel] = self._build_models()

    def reply(
        self,
        persona: str,
        message: str,
        history: List[Dict[str, str]] | None = None,
        top_k: int = 5,
        max_len: int = 60,
    ) -> Dict[str, object]:
        persona_key = self._resolve_persona(persona)
        model = self.models.get(persona_key) or self.models.get("default")
        if not model:
            return {
                "text": f"{persona_key}: I'm here, but I need more data to answer.",
                "persona": persona_key,
                "strategy": "fallback",
                "mood": "neutral",
            }

        query_text = self._build_query(message, history or [])
        query_vec = model.vectorizer.transform([query_text])
        sims = cosine_similarity(query_vec, model.matrix).flatten()

        top_k = max(1, min(top_k, len(model.samples)))
        top_indices = sims.argsort()[::-1][:top_k]

        candidates: List[Tuple[str, float, PersonaSample]] = []
        for idx in top_indices:
            sample = model.samples[idx]
            base_reply = sample.reply
            similarity = float(sims[idx])

            # ALWAYS use the actual training reply - Markov blending produces garbage
            # The training data already has high-quality, contextual responses
            final_text = base_reply

            # Apply style wrapping to final text
            styled = self._style_wrap(persona_key, final_text, model.current_mood)
            candidates.append((styled, similarity, sample))

        if not candidates:
            return {
                "text": self._style_wrap(persona_key, "Thanks for reaching out."),
                "persona": persona_key,
                "strategy": "no_corpus",
                "mood": "neutral",
            }

        chosen = self._weighted_choice(candidates)
        model.current_mood = self._next_mood(model.mood_transitions, model.current_mood)

        return {
            "text": chosen[0],
            "persona": persona_key,
            "strategy": "tfidf_retrieval",
            "mood": model.current_mood,
            "source": {
                "scenario": chosen[2].scenario,
                "user": chosen[2].user,
                "similarity": round(chosen[1], 4),
            },
        }

    # --- build/load helpers ---
    def _load_persona_meta(self) -> Dict[str, dict]:
        meta_path = self.root / "data" / "personas.json"
        if not meta_path.exists():
            return {}
        raw = json.loads(meta_path.read_text())
        personas = raw.get("personas", [])
        return {p["name"]: p for p in personas}

    def _load_corpus(self) -> Dict[str, List[PersonaSample]]:
        # Load ALL training data files for better coverage
        paths = [
            self.root / "data" / "training" / "final-complete-training-data.jsonl",
            self.root / "data" / "training" / "general-conversation-subset.jsonl",
            self.root / "data" / "training" / "fandom-first-person-training-data.jsonl",  # Rich first-person dialogues
            self.root / "data" / "training" / "fandom-lore-training-data.jsonl",  # Lore-specific data
            self.root / "data" / "training" / "multi-character-v2.jsonl",  # Multi-character generated data (2,380+)
            self.root / "data" / "training" / "supplemental-elio-bryce-caleb.jsonl",  # Elio/Bryce/Caleb supplemental
        ]

        # Also load user interaction exports (daily exports from Discord)
        user_interaction_dir = self.root / "data" / "training" / "user-interactions"
        if user_interaction_dir.exists():
            for jsonl_file in user_interaction_dir.glob("*.jsonl"):
                paths.append(jsonl_file)
        corpus: Dict[str, List[PersonaSample]] = {}
        for path in paths:
            if not path.exists():
                continue
            with path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    obj = json.loads(line)
                    messages = obj.get("messages") or []
                    meta = obj.get("metadata") or {}
                    user_msg = next((m["content"] for m in messages if m.get("role") == "user"), "")
                    reply_msg = next((m["content"] for m in messages if m.get("role") == "assistant"), "")
                    persona = meta.get("character") or meta.get("persona") or "default"
                    scenario = meta.get("scenario") or "generic"
                    persona_key = self._resolve_persona(persona)
                    sample = PersonaSample(user=user_msg, reply=reply_msg, scenario=scenario)
                    corpus.setdefault(persona_key, []).append(sample)
        # Build a default pool combining all personas (for fallback)
        pooled: List[PersonaSample] = []
        for samples in corpus.values():
            pooled.extend(samples)
        if pooled:
            corpus.setdefault("default", pooled)

        # Log corpus statistics
        total_samples = sum(len(s) for s in corpus.values())
        logger.info(f"[PersonaLogic] Loaded {total_samples} samples across {len(corpus)} personas")
        for persona, samples in corpus.items():
            if persona != "default":
                logger.info(f"  - {persona}: {len(samples)} samples")

        return corpus

    def _build_models(self) -> Dict[str, PersonaModel]:
        models: Dict[str, PersonaModel] = {}
        for persona, samples in self.corpus.items():
            texts = []
            for s in samples:
                # Combine user question + scenario for better semantic matching
                # This helps find the most relevant context for the query
                combined = f"{s.user} {s.scenario}".strip()
                texts.append(combined if combined else s.reply)
            vectorizer = TfidfVectorizer(
                stop_words="english",
                ngram_range=(1, 3),  # Include trigrams for better phrase matching
                min_df=1,
                max_df=0.95,  # Ignore very common terms
            )
            matrix = vectorizer.fit_transform(texts)
            markov_model = train_from_corpus([s.reply for s in samples], order=2)
            mood_transitions = self._mood_transitions(persona)
            models[persona] = PersonaModel(
                samples=samples,
                vectorizer=vectorizer,
                matrix=matrix,
                markov_text=markov_model,
                mood_transitions=mood_transitions,
                current_mood="neutral",
            )
        return models

    # --- generation helpers ---
    def _build_query(self, message: str, history: List) -> str:
        parts = []
        for item in history[-3:]:
            # Handle both dict and Pydantic model
            if hasattr(item, "role"):
                role = item.role
                text = item.content if hasattr(item, "content") else ""
            else:
                role = item.get("role") if isinstance(item, dict) else None
                text = item.get("content", "") if isinstance(item, dict) else ""
            if role == "assistant":
                parts.append(f"they said {text}")
            else:
                parts.append(text)
        parts.append(message)
        return " ".join(parts)

    def _blend_text(self, persona: str, base: str, markov_text: str, mood: str) -> str:
        # Prefer Markov output if it adds new tokens
        candidate = markov_text or base
        candidate = candidate.strip()
        candidate = candidate.replace("assistant:", "").replace("user:", "")
        styled = self._style_wrap(persona, candidate, mood)
        return styled

    def _style_wrap(self, persona: str, text: str, mood: str = "neutral") -> str:
        meta = self.persona_meta.get(persona, {})
        openers = meta.get("openers") or []
        speaking_style = meta.get("speaking_style") or ""
        filler = self._mood_filler(persona, mood)

        prefix = ""
        if openers and random.random() < 0.4:
            prefix = random.choice(openers).strip() + " "

        tone_hint = ""
        if speaking_style and random.random() < 0.25:
            tone_hint = f" ({speaking_style.split('.')[0].strip()}) "

        return f"{prefix}{filler}{tone_hint}{text}".strip()

    def _mood_transitions(self, persona: str) -> Dict[str, Dict[str, float]]:
        # Lightweight HMM for mood progression; tuned per persona if desired
        base = {
            "neutral": {"curious": 0.35, "warm": 0.35, "playful": 0.2, "neutral": 0.1},
            "curious": {"warm": 0.3, "curious": 0.4, "playful": 0.2, "neutral": 0.1},
            "warm": {"warm": 0.4, "curious": 0.3, "playful": 0.2, "neutral": 0.1},
            "playful": {"playful": 0.35, "warm": 0.35, "curious": 0.2, "neutral": 0.1},
        }
        # Minor persona-specific tweaks
        if persona.lower().startswith("elio"):
            base["curious"]["playful"] += 0.05
            base["warm"]["curious"] += 0.05
        elif persona.lower().startswith("glordon"):
            base["playful"]["playful"] += 0.1
        elif persona.lower().startswith("olga"):
            base["warm"]["neutral"] += 0.1
        return base

    def _mood_filler(self, persona: str, mood: str) -> str:
        mood = mood or "neutral"
        fillers = {
            "curious": ["*leans in*", "*eyes widen*"],
            "warm": ["*smiles softly*", "*nods warmly*"],
            "playful": ["*chuckles*", "*grins*"],
            "neutral": [""],
        }
        persona_filler = {
          "elio": ["*eyes light up*", "*bounces*"],
          "glordon": ["*tilts head*", "*laughs in a rumbling way*"],
          "olga": ["*steady gaze*", "*crosses arms*"],
        }
        options = fillers.get(mood, [""])
        key = persona.lower()
        if key in persona_filler:
            options = options + persona_filler[key]
        choice = random.choice(options) if options else ""
        return f"{choice} ".strip()

    def _next_mood(self, transitions: Dict[str, Dict[str, float]], current: str) -> str:
        dist = transitions.get(current, transitions.get("neutral", {}))
        if not dist:
            return "neutral"
        r = random.random()
        cumulative = 0.0
        for mood, prob in dist.items():
            cumulative += prob
            if r <= cumulative:
                return mood
        return current

    def _weighted_choice(
        self, candidates: List[Tuple[str, float, PersonaSample]]
    ) -> Tuple[str, float, PersonaSample]:
        weights = []
        for _, score, _ in candidates:
            weights.append(max(0.05, score))
        total = sum(weights)
        r = random.random() * total
        cum = 0.0
        for candidate, weight in zip(candidates, weights):
            cum += weight
            if r <= cum:
                return candidate
        return candidates[0]

    def _resolve_persona(self, persona: str) -> str:
        if not persona:
            return "default"
        persona_clean = persona.strip()
        for name in self.persona_meta.keys():
            if persona_clean.lower() == name.lower():
                return name
            if persona_clean.lower() in name.lower() or name.lower() in persona_clean.lower():
                return name
        # Fallback: title case first token
        return persona_clean.split()[0].strip().title() or "default"


# Singleton engine
ENGINE = PersonaLogicEngine()


def persona_logic_reply(persona: str, message: str, history: List[Dict[str, str]], top_k: int, max_len: int):
    return ENGINE.reply(persona, message, history, top_k=top_k, max_len=max_len)
