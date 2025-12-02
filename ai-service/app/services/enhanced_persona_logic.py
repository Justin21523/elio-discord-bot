"""
Enhanced persona responder with hybrid ensemble system.

Integrates comprehensive ML/statistical models:
- TF-IDF/Markov + Templates + HMM + Cascade + Bandit learning + CF
- BM25 probabilistic retrieval
- N-gram language models (1-5)
- SVM intent classification
- Naive Bayes sentiment/mood classification
- Decision Tree / Random Forest response selection
- Trie keyword matching
- PMI word association

This allows the bot to run without GPU/LLM using pure statistical/ML methods.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from .bandit import ThompsonSamplingBandit, get_persona_bandit
from .cascade import CascadeRouter, get_cascade_router
from .ensemble import Candidate, EnsembleGenerator, get_ensemble
from .hmm_dialogue import DialogueHMMManager, get_hmm_manager
from .persona_logic import PersonaLogicEngine, ENGINE as BASE_ENGINE
from .template_filler import TemplateFiller, get_template_filler
from .response_cf import ResponseStyleCF, get_response_cf, personalize_response

# New ML/Text Mining imports
from .bm25 import get_persona_bm25, PersonaBM25Retriever
from .ngram_lm import get_persona_ngram, PersonaNgramModel
from .intent_classifier import get_intent_classifier, PersonaIntentClassifier, IntentPrediction
from .sentiment_classifier import get_mood_classifier, PersonaMoodClassifier, MoodPrediction
from .response_selector import get_response_selector, ResponseSelector, ResponseCandidate
from .trie import get_persona_trie, PersonaKeywordTrie
from .pmi import get_persona_pmi, PersonaPMI

logger = logging.getLogger(__name__)


class EnhancedPersonaLogicEngine:
    """
    Enhanced persona responder combining multiple generation strategies.

    Core Strategies:
    1. tfidf_markov: Original TF-IDF + Markov (from PersonaLogicEngine)
    2. template_fill: Template-based with slot filling
    3. ngram_blend: N-gram generation with persona vocabulary
    4. retrieval_mod: Retrieval + modification

    New ML/Text Mining Strategies:
    5. bm25_retrieve: BM25 probabilistic retrieval
    6. ngram_lm: N-gram language model generation (1-5 grams)
    7. pmi_expand: PMI-based query expansion + retrieval
    8. hybrid_blend: Combined BM25 + TF-IDF + N-gram

    Selection uses:
    - Thompson Sampling Bandit for exploration/exploitation
    - Random Forest for feature-based selection
    - SVM for intent classification
    - Naive Bayes for mood detection
    - Trie for fast keyword matching
    """

    def __init__(
        self,
        base_engine: Optional[PersonaLogicEngine] = None,
        bandit: Optional[ThompsonSamplingBandit] = None,
        template_filler: Optional[TemplateFiller] = None,
        hmm_manager: Optional[DialogueHMMManager] = None,
        cascade_router: Optional[CascadeRouter] = None,
        response_cf: Optional[ResponseStyleCF] = None,
        # New ML components
        bm25_retriever: Optional[PersonaBM25Retriever] = None,
        ngram_model: Optional[PersonaNgramModel] = None,
        intent_classifier: Optional[PersonaIntentClassifier] = None,
        mood_classifier: Optional[PersonaMoodClassifier] = None,
        response_selector: Optional[ResponseSelector] = None,
        keyword_trie: Optional[PersonaKeywordTrie] = None,
        pmi_calculator: Optional[PersonaPMI] = None,
    ):
        """
        Initialize enhanced engine with all ML/statistical components.

        Args:
            base_engine: Base PersonaLogicEngine for TF-IDF/Markov
            bandit: Thompson Sampling bandit for strategy selection
            template_filler: Template-based generator
            hmm_manager: Dialogue state HMM manager
            cascade_router: Safety and selection router
            response_cf: Response style collaborative filtering
            bm25_retriever: BM25 probabilistic retrieval
            ngram_model: N-gram language model
            intent_classifier: SVM intent classifier
            mood_classifier: Naive Bayes mood classifier
            response_selector: Random Forest response selector
            keyword_trie: Trie for keyword matching
            pmi_calculator: PMI word association
        """
        # Core components
        self.base_engine = base_engine or BASE_ENGINE
        self.bandit = bandit or get_persona_bandit()
        self.template_filler = template_filler or get_template_filler()
        self.hmm_manager = hmm_manager or get_hmm_manager()
        self.cascade_router = cascade_router or get_cascade_router()
        self.response_cf = response_cf or get_response_cf()

        # New ML/Text Mining components
        self.bm25_retriever = bm25_retriever or get_persona_bm25()
        self.ngram_model = ngram_model or get_persona_ngram()
        self.intent_classifier = intent_classifier or get_intent_classifier()
        self.mood_classifier = mood_classifier or get_mood_classifier()
        self.response_selector = response_selector or get_response_selector()
        self.keyword_trie = keyword_trie or get_persona_trie()
        self.pmi_calculator = pmi_calculator or get_persona_pmi()

        # Update cascade router with persona metadata
        self.cascade_router.set_persona_meta(self.base_engine.persona_meta)

        # Build ensemble with strategy generators
        self.ensemble = EnsembleGenerator(bandit=self.bandit)
        self._register_strategies()

        # Track last selections for feedback attribution
        self._last_selection: Optional[Dict] = None

    def _classify_message(self, message: str, persona: str) -> Tuple[str, str, float, float]:
        """
        Classify message intent and mood using ML classifiers.

        Args:
            message: User message
            persona: Persona name

        Returns:
            (intent, mood, intent_confidence, mood_confidence)
        """
        # SVM Intent Classification
        intent_pred = self.intent_classifier.predict(message, persona)

        # Naive Bayes Mood Classification
        mood_pred = self.mood_classifier.predict(message, persona)

        return (
            intent_pred.intent,
            mood_pred.mood,
            intent_pred.confidence,
            mood_pred.confidence,
        )

    def _detect_keywords(self, message: str) -> List[Tuple[str, str, float]]:
        """
        Detect persona keywords using Trie.

        Args:
            message: User message

        Returns:
            List of (keyword, persona, weight) tuples
        """
        matches = self.keyword_trie.detect_keywords(message)
        # Return (keyword, persona, weight) without position
        return [(kw, persona, weight) for kw, persona, weight, _ in matches]

    def _register_strategies(self):
        """Register generation strategies with ensemble."""

        # Strategy 1: TF-IDF + Markov (original)
        def tfidf_markov_strategy(context: Dict) -> Dict:
            result = self.base_engine.reply(
                persona=context.get('persona', 'default'),
                message=context.get('message', ''),
                history=context.get('history', []),
                top_k=context.get('top_k', 5),
                max_len=context.get('max_len', 60),
            )
            return {
                'text': result.get('text', ''),
                'confidence': result.get('source', {}).get('similarity', 0.5),
                'metadata': result,
            }

        # Strategy 2: Template filling
        def template_fill_strategy(context: Dict) -> Dict:
            persona = context.get('persona', 'default')
            mood = context.get('mood', 'neutral')
            topic = context.get('topic', 'general')

            # Map topic to scenario
            scenario_map = {
                'greeting': 'greeting',
                'personal': 'question_response',
                'advice': 'encouragement',
                'feelings': 'encouragement',
                'lore': 'curiosity',
                'general': 'fallback',
            }
            scenario = scenario_map.get(topic, 'fallback')

            result = self.template_filler.fill(
                persona=persona,
                scenario=scenario,
                mood=mood,
                context={'message': context.get('message', '')},
            )
            return result

        # Strategy 3: N-gram blend (uses Markov with different seed)
        def ngram_blend_strategy(context: Dict) -> Dict:
            persona_key = self.base_engine._resolve_persona(context.get('persona', 'default'))
            model = self.base_engine.models.get(persona_key)

            if not model or not model.markov_text:
                return {'text': '', 'confidence': 0.0}

            # Use mood-based seed for variety
            mood = context.get('mood', 'neutral')
            message = context.get('message', '')
            seed = f"{mood} {message}"

            text = model.markov_text.generate(
                seed=seed,
                max_len=context.get('max_len', 60),
                temperature=0.95,  # Higher for more creativity
                repetition_penalty=1.2,
            )

            if text:
                text = self.base_engine._style_wrap(persona_key, text, mood)

            return {
                'text': text,
                'confidence': 0.4,  # Lower confidence for pure Markov
                'metadata': {'strategy': 'ngram_blend'},
            }

        # Strategy 4: Retrieval + modification
        def retrieval_mod_strategy(context: Dict) -> Dict:
            persona_key = self.base_engine._resolve_persona(context.get('persona', 'default'))
            model = self.base_engine.models.get(persona_key)

            if not model:
                return {'text': '', 'confidence': 0.0}

            # Find most similar sample
            message = context.get('message', '')
            history = context.get('history', [])
            query_text = self.base_engine._build_query(message, history)

            from sklearn.metrics.pairwise import cosine_similarity
            query_vec = model.vectorizer.transform([query_text])
            sims = cosine_similarity(query_vec, model.matrix).flatten()

            best_idx = sims.argmax()
            best_sim = float(sims[best_idx])

            if best_sim < 0.1:
                return {'text': '', 'confidence': 0.0}

            # Get best sample and modify it
            sample = model.samples[best_idx]
            original = sample.reply

            # Modify by injecting Markov-generated content
            words = original.split()
            if len(words) > 5 and model.markov_text:
                # Replace middle portion
                mid_start = len(words) // 3
                seed = " ".join(words[:mid_start])
                markov_mid = model.markov_text.generate(seed, max_len=10)

                if markov_mid:
                    mid_words = markov_mid.split()[:5]
                    modified = words[:mid_start] + mid_words + words[-2:]
                    text = " ".join(modified)
                else:
                    text = original
            else:
                text = original

            mood = context.get('mood', 'neutral')
            text = self.base_engine._style_wrap(persona_key, text, mood)

            return {
                'text': text,
                'confidence': best_sim * 0.8,  # Slightly lower than direct match
                'metadata': {
                    'strategy': 'retrieval_mod',
                    'original_scenario': sample.scenario,
                },
            }

        # Strategy 5: BM25 probabilistic retrieval
        def bm25_retrieve_strategy(context: Dict) -> Dict:
            persona = context.get('persona', 'default')
            message = context.get('message', '')
            history = context.get('history', [])

            # Build query with history context
            query = message
            if history:
                recent = history[-2:]
                query = " ".join([h.get('content', '') for h in recent]) + " " + message

            # Search with BM25 (note: persona first, then query)
            results = self.bm25_retriever.search(persona, query, top_k=3)

            if not results:
                return {'text': '', 'confidence': 0.0}

            # Get best result (BM25 returns: reply_text, score, metadata)
            best_text, best_score, best_meta = results[0]

            if not best_text:
                return {'text': '', 'confidence': 0.0}

            # Optionally blend with Markov
            persona_key = self.base_engine._resolve_persona(persona)
            model = self.base_engine.models.get(persona_key)

            if model and model.markov_text and len(best_text.split()) > 3:
                # Use retrieved text as seed for Markov continuation
                seed = " ".join(best_text.split()[:3])
                continuation = model.markov_text.generate(seed, max_len=30)
                if continuation:
                    text = best_text + " " + continuation
                else:
                    text = best_text
            else:
                text = best_text

            mood = context.get('mood', 'neutral')
            text = self.base_engine._style_wrap(persona_key, text, mood)

            return {
                'text': text,
                'confidence': min(1.0, best_score / 10.0),
                'metadata': {'strategy': 'bm25_retrieve', 'bm25_score': best_score, 'scenario': best_meta.get('scenario')},
            }

        # Strategy 6: N-gram language model generation
        def ngram_lm_strategy(context: Dict) -> Dict:
            persona = context.get('persona', 'default')
            message = context.get('message', '')
            max_len = context.get('max_len', 60)

            # Use message as seed for N-gram generation
            seed_words = message.split()[:3]
            seed = " ".join(seed_words) if seed_words else ""

            text = self.ngram_model.generate(
                persona=persona,
                seed=seed,
                max_len=max_len,
                temperature=0.9,
                repetition_penalty=1.3,
            )

            if not text:
                return {'text': '', 'confidence': 0.0}

            # Score the generated text for persona fit
            fit_score = self.ngram_model.probability(persona, text)

            mood = context.get('mood', 'neutral')
            persona_key = self.base_engine._resolve_persona(persona)
            text = self.base_engine._style_wrap(persona_key, text, mood)

            return {
                'text': text,
                'confidence': fit_score,
                'metadata': {'strategy': 'ngram_lm'},
            }

        # Strategy 7: PMI-based query expansion + retrieval
        def pmi_expand_strategy(context: Dict) -> Dict:
            persona = context.get('persona', 'default')
            message = context.get('message', '')

            # Expand query using PMI associations
            expanded_terms = self.pmi_calculator.expand_query(
                message, persona, expansion_terms=3
            )

            if not expanded_terms:
                return {'text': '', 'confidence': 0.0}

            # Build expanded query
            expanded_query = " ".join([term for term, weight in expanded_terms[:10]])

            # Search with expanded query using BM25 (note: persona first)
            results = self.bm25_retriever.search(persona, expanded_query, top_k=3)

            if not results:
                # Fallback to TF-IDF search
                persona_key = self.base_engine._resolve_persona(persona)
                model = self.base_engine.models.get(persona_key)
                if not model:
                    return {'text': '', 'confidence': 0.0}

                from sklearn.metrics.pairwise import cosine_similarity
                query_vec = model.vectorizer.transform([expanded_query])
                sims = cosine_similarity(query_vec, model.matrix).flatten()
                best_idx = sims.argmax()

                if sims[best_idx] < 0.1:
                    return {'text': '', 'confidence': 0.0}

                text = model.samples[best_idx].reply
                confidence = float(sims[best_idx])
            else:
                # BM25 returns (reply_text, score, metadata)
                text, best_score, _ = results[0]
                confidence = min(1.0, best_score / 10.0)

            mood = context.get('mood', 'neutral')
            persona_key = self.base_engine._resolve_persona(persona)
            text = self.base_engine._style_wrap(persona_key, text, mood)

            return {
                'text': text,
                'confidence': confidence * 0.9,  # Slightly lower for expanded query
                'metadata': {
                    'strategy': 'pmi_expand',
                    'expanded_terms': [t for t, _ in expanded_terms[:5]],
                },
            }

        # Strategy 8: Hybrid blend (BM25 + TF-IDF + N-gram)
        def hybrid_blend_strategy(context: Dict) -> Dict:
            persona = context.get('persona', 'default')
            message = context.get('message', '')
            max_len = context.get('max_len', 60)

            # Get candidates from multiple sources
            candidates = []

            # BM25 candidate (note: persona first, then query)
            bm25_results = self.bm25_retriever.search(persona, message, top_k=1)
            if bm25_results:
                # BM25 returns (reply_text, score, metadata)
                text, score, _ = bm25_results[0]
                if text:
                    candidates.append(('bm25', text, min(1.0, score / 10.0)))

            # TF-IDF candidate
            persona_key = self.base_engine._resolve_persona(persona)
            model = self.base_engine.models.get(persona_key)
            if model:
                from sklearn.metrics.pairwise import cosine_similarity
                query_vec = model.vectorizer.transform([message])
                sims = cosine_similarity(query_vec, model.matrix).flatten()
                best_idx = sims.argmax()
                if sims[best_idx] > 0.1:
                    candidates.append(('tfidf', model.samples[best_idx].reply, float(sims[best_idx])))

            # N-gram candidate
            ngram_text = self.ngram_model.generate(persona, message[:20], max_len // 2)
            if ngram_text:
                ngram_score = self.ngram_model.probability(persona, ngram_text)
                candidates.append(('ngram', ngram_text, ngram_score))

            if not candidates:
                return {'text': '', 'confidence': 0.0}

            # Blend: weight by confidence and combine
            total_weight = sum(c[2] for c in candidates)
            if total_weight == 0:
                return {'text': '', 'confidence': 0.0}

            # Choose best candidate but blend with others
            candidates.sort(key=lambda x: x[2], reverse=True)
            best_source, best_text, best_score = candidates[0]

            # If we have Markov, add some variation
            if model and model.markov_text and len(best_text.split()) > 5:
                words = best_text.split()
                seed = " ".join(words[:3])
                variation = model.markov_text.generate(seed, max_len=15)
                if variation:
                    # Blend: use first part of best, add Markov variation
                    text = " ".join(words[:len(words)//2]) + " " + variation
                else:
                    text = best_text
            else:
                text = best_text

            mood = context.get('mood', 'neutral')
            text = self.base_engine._style_wrap(persona_key, text, mood)

            return {
                'text': text,
                'confidence': best_score,
                'metadata': {
                    'strategy': 'hybrid_blend',
                    'sources': [c[0] for c in candidates],
                    'scores': {c[0]: c[2] for c in candidates},
                },
            }

        # Register all strategies (original + new)
        self.ensemble.register_strategy('tfidf_markov', tfidf_markov_strategy)
        self.ensemble.register_strategy('template_fill', template_fill_strategy)
        self.ensemble.register_strategy('ngram_blend', ngram_blend_strategy)
        self.ensemble.register_strategy('retrieval_mod', retrieval_mod_strategy)

        # New ML/Text Mining strategies
        self.ensemble.register_strategy('bm25_retrieve', bm25_retrieve_strategy)
        self.ensemble.register_strategy('ngram_lm', ngram_lm_strategy)
        self.ensemble.register_strategy('pmi_expand', pmi_expand_strategy)
        self.ensemble.register_strategy('hybrid_blend', hybrid_blend_strategy)

    def reply(
        self,
        persona: str,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[str] = None,
        channel_id: Optional[str] = None,
        top_k: int = 5,
        max_len: int = 60,
    ) -> Dict:
        """
        Generate enhanced persona response using full ML pipeline.

        Pipeline:
        1. Keyword detection (Trie) - fast persona cues
        2. Intent classification (SVM) - what user wants
        3. Mood classification (Naive Bayes) - user sentiment
        4. HMM state update - dialogue context tracking
        5. Multi-strategy candidate generation (8 strategies)
        6. Response selection (Random Forest + Thompson Sampling)
        7. Personalization (Collaborative Filtering)
        8. Safety cascade routing

        Args:
            persona: Persona name
            message: User message
            history: Conversation history
            user_id: Optional user ID for CF scoring
            channel_id: Optional channel ID for context
            top_k: Number of candidates to consider
            max_len: Maximum response length

        Returns:
            Response dict with text, strategy, mood, confidence, and ML metadata
        """
        history = history or []

        # Step 1: Fast keyword detection using Trie
        keyword_matches = self._detect_keywords(message)
        detected_persona = None
        if keyword_matches:
            # Check if keywords suggest a different persona
            persona_scores = {}
            for kw, p, weight in keyword_matches:
                persona_scores[p] = persona_scores.get(p, 0) + weight
            if persona_scores:
                detected_persona = max(persona_scores, key=persona_scores.get)

        # Step 2 & 3: ML classification (SVM intent + Naive Bayes mood)
        ml_intent, ml_mood, intent_conf, mood_conf = self._classify_message(message, persona)

        # Step 4: Update dialogue HMM state (combines with ML predictions)
        hmm_mood, hmm_topic = self.hmm_manager.update(persona, message, history)

        # Blend HMM and ML mood predictions
        # Use ML mood if high confidence, otherwise use HMM
        if mood_conf > 0.7:
            mood = ml_mood
        else:
            mood = hmm_mood

        # Use ML intent as topic if high confidence
        if intent_conf > 0.6:
            topic = ml_intent
        else:
            topic = hmm_topic

        # Build context for generators with ML enrichment
        context = {
            'persona': persona,
            'message': message,
            'history': history,
            'user_id': user_id,
            'channel_id': channel_id,
            'top_k': top_k,
            'max_len': max_len,
            'mood': mood,
            'topic': topic,
            # ML classification results
            'ml_intent': ml_intent,
            'ml_mood': ml_mood,
            'intent_confidence': intent_conf,
            'mood_confidence': mood_conf,
            'keyword_matches': keyword_matches,
            'detected_persona': detected_persona,
        }

        # Generate candidates from all strategies
        candidates = self.ensemble.generate_candidates(context)

        if not candidates:
            # Fallback to base engine
            result = self.base_engine.reply(persona, message, history, top_k, max_len)
            return {
                **result,
                'strategy': 'fallback_base',
                'mood': mood,
            }

        # Convert to Candidate objects if needed
        candidate_objs = []
        for c in candidates:
            if isinstance(c, Candidate):
                candidate_objs.append(c)
            elif isinstance(c, dict):
                candidate_objs.append(Candidate(
                    text=c.get('text', ''),
                    source=c.get('source', 'unknown'),
                    confidence=c.get('confidence', 0.5),
                    metadata=c.get('metadata', {}),
                ))

        # Apply CF personalization if user_id is provided
        if user_id and self.response_cf:
            # Convert candidates to dict format for CF
            candidate_dicts = [
                {'text': c.text, 'score': c.confidence, 'source': c.source, 'metadata': c.metadata}
                for c in candidate_objs
            ]
            # Re-rank based on user preferences
            personalized = personalize_response(user_id, candidate_dicts, weight=0.25)

            # Convert back to Candidate objects with updated scores
            candidate_objs = [
                Candidate(
                    text=d['text'],
                    source=d['source'],
                    confidence=d['score'],
                    cf_score=d.get('cf_score', 0.5),
                    metadata={**d.get('metadata', {}), 'style': d.get('style_classification', {})},
                )
                for d in personalized
            ]

        # Route through cascade (safety + context scoring + selection)
        selected = self.cascade_router.route(context, candidate_objs)

        if not selected:
            # Ultimate fallback
            result = self.base_engine.reply(persona, message, history, top_k, max_len)
            return {
                **result,
                'strategy': 'fallback_cascade',
                'mood': mood,
            }

        # Track selection for feedback attribution
        self._last_selection = {
            'strategy': selected.source,
            'persona': persona,
            'mood': mood,
            'confidence': selected.confidence,
            'user_id': user_id,
            'response_text': selected.text,
            'style': selected.metadata.get('style', {}),
        }

        return {
            'text': selected.text,
            'persona': persona,
            'strategy': selected.source,
            'mood': mood,
            'topic': topic,
            'confidence': round(selected.confidence, 4),
            'metadata': selected.metadata,
            # ML classification metadata
            'ml_analysis': {
                'intent': ml_intent,
                'intent_confidence': round(intent_conf, 4),
                'mood': ml_mood,
                'mood_confidence': round(mood_conf, 4),
                'keywords': [kw for kw, _, _ in keyword_matches[:5]] if keyword_matches else [],
                'detected_persona': detected_persona,
            },
        }

    def record_feedback(
        self,
        reward: float,
        strategy: Optional[str] = None,
        user_id: Optional[str] = None,
    ):
        """
        Record feedback for bandit learning and CF updates.

        Args:
            reward: Reward value [0, 1]
            strategy: Strategy name (uses last selection if not provided)
            user_id: User ID for CF update (uses last selection if not provided)
        """
        # Update bandit
        if strategy:
            self.bandit.update(strategy, reward)
        elif self._last_selection:
            self.bandit.update(self._last_selection['strategy'], reward)

        # Update CF preferences
        uid = user_id or (self._last_selection.get('user_id') if self._last_selection else None)
        if uid and self._last_selection:
            response_text = self._last_selection.get('response_text', '')
            style = self._last_selection.get('style')

            # Classify style if not already classified
            if not style and response_text:
                style = self.response_cf.classify_response_style(response_text)

            if style:
                self.response_cf.update(uid, style, reward)

    def get_last_selection(self) -> Optional[Dict]:
        """Get info about the last selection for feedback attribution."""
        return self._last_selection

    def get_stats(self) -> Dict:
        """Get comprehensive engine statistics including all ML components."""
        return {
            'bandit': self.bandit.get_stats(),
            'ensemble': self.ensemble.get_stats(),
            'strategies': list(self.ensemble.strategies.keys()),
            'cf': self.response_cf.get_stats(),
            # New ML component stats
            'ml_components': {
                'bm25': {
                    'personas': list(self.bm25_retriever.retrievers.keys()),
                    'loaded': self.bm25_retriever._loaded,
                },
                'ngram': {
                    'personas': list(self.ngram_model.models.keys()),
                    'loaded': self.ngram_model._loaded,
                },
                'intent_classifier': {
                    'loaded': self.intent_classifier._loaded,
                    'personas': list(self.intent_classifier.persona_intent_weights.keys()),
                },
                'mood_classifier': {
                    'loaded': self.mood_classifier._loaded,
                    'personas': list(self.mood_classifier.persona_priors.keys()),
                },
                'trie': {
                    'personas': list(self.keyword_trie.tries.keys()),
                },
                'pmi': {
                    'personas': list(self.pmi_calculator.models.keys()),
                    'loaded': self.pmi_calculator._loaded,
                },
            },
        }

    def reset_bandit(self, arm: Optional[str] = None):
        """Reset bandit to initial state."""
        self.bandit.reset(arm)


# Singleton enhanced engine
ENHANCED_ENGINE: Optional[EnhancedPersonaLogicEngine] = None


def get_enhanced_engine() -> EnhancedPersonaLogicEngine:
    """Get or create singleton enhanced engine."""
    global ENHANCED_ENGINE
    if ENHANCED_ENGINE is None:
        ENHANCED_ENGINE = EnhancedPersonaLogicEngine()
    return ENHANCED_ENGINE


def enhanced_persona_logic_reply(
    persona: str,
    message: str,
    history: List[Dict[str, str]],
    top_k: int = 5,
    max_len: int = 60,
    user_id: Optional[str] = None,
    channel_id: Optional[str] = None,
) -> Dict:
    """
    Enhanced persona reply function.

    Args:
        persona: Persona name
        message: User message
        history: Conversation history
        top_k: Number of candidates
        max_len: Maximum response length
        user_id: Optional user ID for personalization
        channel_id: Optional channel ID for context

    Returns:
        Response dict
    """
    engine = get_enhanced_engine()
    return engine.reply(
        persona=persona,
        message=message,
        history=history,
        user_id=user_id,
        channel_id=channel_id,
        top_k=top_k,
        max_len=max_len,
    )
