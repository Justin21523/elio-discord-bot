"""
Data augmentation for persona training data.
Expands small training sets using various transformation techniques.
"""
from __future__ import annotations

import random
import re
from typing import Dict, List, Optional, Tuple, Any
from collections import defaultdict


class PersonaDataAugmenter:
    """
    Augments persona training data using various techniques:
    - Synonym replacement
    - Word reordering (within constraints)
    - Punctuation variation
    - Filler word injection
    - Sentence combination
    - Mood-based transformations
    """

    # Synonym mappings for common words
    SYNONYMS = {
        # Positive emotions
        'happy': ['glad', 'joyful', 'pleased', 'delighted', 'cheerful'],
        'good': ['great', 'wonderful', 'excellent', 'nice', 'fine'],
        'like': ['enjoy', 'love', 'appreciate', 'adore', 'fancy'],
        'friend': ['pal', 'buddy', 'companion', 'ally'],

        # Actions
        'think': ['believe', 'reckon', 'suppose', 'feel'],
        'know': ['understand', 'realize', 'see', 'recognize'],
        'want': ['wish', 'desire', 'hope for', 'seek'],
        'need': ['require', 'must have'],
        'help': ['assist', 'aid', 'support'],
        'look': ['see', 'gaze', 'glance', 'peer'],
        'come': ['arrive', 'approach', 'show up'],
        'go': ['leave', 'head', 'move', 'travel'],

        # Descriptors
        'big': ['large', 'huge', 'massive', 'enormous'],
        'small': ['little', 'tiny', 'miniature'],
        'fast': ['quick', 'swift', 'rapid', 'speedy'],
        'slow': ['gradual', 'unhurried', 'leisurely'],
        'old': ['ancient', 'aged', 'elderly'],
        'new': ['fresh', 'recent', 'modern'],

        # Conversation
        'said': ['replied', 'answered', 'responded', 'mentioned'],
        'asked': ['inquired', 'wondered', 'questioned'],
        'tell': ['inform', 'share', 'let you know'],
    }

    # Filler words by persona style
    FILLER_WORDS = {
        'casual': ['like', 'you know', 'basically', 'actually', 'kinda', 'sorta'],
        'formal': ['indeed', 'certainly', 'of course', 'naturally'],
        'playful': ['hehe', 'ooh', 'whee', 'yay'],
        'warm': ['oh', 'dear', 'ah', 'my'],
        'enthusiastic': ['wow', 'oh wow', 'amazing', 'incredible'],
    }

    # Sentence starters by mood
    MOOD_STARTERS = {
        'neutral': ['', 'Well,', 'So,', 'Hmm,'],
        'curious': ['Ooh,', 'Interesting...', 'Tell me more!', 'Really?'],
        'warm': ['Aw,', 'Oh,', 'How lovely!', 'That\'s sweet,'],
        'playful': ['Hehe,', 'Oho!', 'Ha!', 'Nice!'],
        'concerned': ['Oh no,', 'Oh dear,', 'I see...', 'Hmm,'],
        'excited': ['Wow!', 'Amazing!', 'Oh!', 'Yes!'],
    }

    # Punctuation variations
    PUNCT_VARIATIONS = {
        '.': ['.', '!', '...'],
        '!': ['!', '!!', '!~'],
        '?': ['?', '??', '?!'],
    }

    def __init__(
        self,
        synonym_prob: float = 0.2,
        filler_prob: float = 0.15,
        punct_prob: float = 0.3,
        starter_prob: float = 0.25,
    ):
        """
        Initialize augmenter.

        Args:
            synonym_prob: Probability of replacing a word with synonym
            filler_prob: Probability of inserting a filler word
            punct_prob: Probability of varying punctuation
            starter_prob: Probability of adding mood starter
        """
        self.synonym_prob = synonym_prob
        self.filler_prob = filler_prob
        self.punct_prob = punct_prob
        self.starter_prob = starter_prob

        # Build reverse synonym lookup
        self._synonym_lookup = {}
        for base, syns in self.SYNONYMS.items():
            self._synonym_lookup[base.lower()] = syns
            for syn in syns:
                if syn.lower() not in self._synonym_lookup:
                    self._synonym_lookup[syn.lower()] = [base] + [s for s in syns if s != syn]

    def augment(
        self,
        text: str,
        persona_style: str = 'casual',
        mood: str = 'neutral',
        n_augmentations: int = 3,
    ) -> List[str]:
        """
        Generate augmented versions of a text.

        Args:
            text: Original text to augment
            persona_style: Style for filler words (casual, formal, playful, warm, enthusiastic)
            mood: Current mood for starters
            n_augmentations: Number of augmented versions to generate

        Returns:
            List of augmented texts
        """
        augmented = []

        for _ in range(n_augmentations):
            aug_text = text

            # Apply synonym replacement
            aug_text = self._apply_synonyms(aug_text)

            # Apply filler injection
            aug_text = self._apply_fillers(aug_text, persona_style)

            # Apply punctuation variation
            aug_text = self._apply_punct_variation(aug_text)

            # Apply mood starter
            aug_text = self._apply_mood_starter(aug_text, mood)

            # Clean up
            aug_text = self._cleanup(aug_text)

            # Only add if different from original
            if aug_text.lower().strip() != text.lower().strip():
                augmented.append(aug_text)

        # Deduplicate
        return list(set(augmented))

    def _apply_synonyms(self, text: str) -> str:
        """Replace some words with synonyms."""
        words = text.split()
        result = []

        for word in words:
            # Preserve punctuation
            prefix = ''
            suffix = ''
            clean_word = word

            while clean_word and not clean_word[0].isalnum():
                prefix += clean_word[0]
                clean_word = clean_word[1:]
            while clean_word and not clean_word[-1].isalnum():
                suffix = clean_word[-1] + suffix
                clean_word = clean_word[:-1]

            # Check for synonym replacement
            if clean_word.lower() in self._synonym_lookup and random.random() < self.synonym_prob:
                synonyms = self._synonym_lookup[clean_word.lower()]
                replacement = random.choice(synonyms)

                # Preserve capitalization
                if clean_word.isupper():
                    replacement = replacement.upper()
                elif clean_word[0].isupper():
                    replacement = replacement.capitalize()

                result.append(prefix + replacement + suffix)
            else:
                result.append(word)

        return ' '.join(result)

    def _apply_fillers(self, text: str, style: str) -> str:
        """Insert filler words based on style."""
        if style not in self.FILLER_WORDS:
            return text

        if random.random() > self.filler_prob:
            return text

        fillers = self.FILLER_WORDS[style]
        filler = random.choice(fillers)

        words = text.split()
        if len(words) < 3:
            return text

        # Insert at a natural position (after first few words)
        insert_pos = random.randint(1, min(3, len(words) - 1))

        # Add comma if needed
        if filler in ['like', 'you know', 'basically', 'actually']:
            filler = filler + ','

        words.insert(insert_pos, filler)
        return ' '.join(words)

    def _apply_punct_variation(self, text: str) -> str:
        """Vary ending punctuation."""
        if random.random() > self.punct_prob:
            return text

        for punct, variations in self.PUNCT_VARIATIONS.items():
            if text.rstrip().endswith(punct):
                new_punct = random.choice(variations)
                text = text.rstrip()[:-1] + new_punct
                break

        return text

    def _apply_mood_starter(self, text: str, mood: str) -> str:
        """Add mood-appropriate sentence starter."""
        if random.random() > self.starter_prob:
            return text

        starters = self.MOOD_STARTERS.get(mood, self.MOOD_STARTERS['neutral'])
        starter = random.choice(starters)

        if starter:
            # Lowercase first letter of original if adding starter
            if text and text[0].isupper():
                text = text[0].lower() + text[1:]
            text = starter + ' ' + text

        return text

    def _cleanup(self, text: str) -> str:
        """Clean up augmented text."""
        # Fix double spaces
        text = re.sub(r'\s+', ' ', text)

        # Fix punctuation spacing
        text = re.sub(r'\s+([.,!?])', r'\1', text)

        # Capitalize first letter
        if text:
            text = text[0].upper() + text[1:]

        return text.strip()

    def augment_dataset(
        self,
        samples: List[Dict[str, Any]],
        persona_style: str = 'casual',
        target_multiplier: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Augment a full dataset of samples.

        Args:
            samples: List of sample dicts with 'prompt', 'reply', 'scenario', etc.
            persona_style: Style for the persona
            target_multiplier: Target multiplication factor

        Returns:
            Augmented dataset
        """
        augmented = []

        for sample in samples:
            # Always include original
            augmented.append(sample.copy())

            # Get mood from scenario or use neutral
            mood = self._scenario_to_mood(sample.get('scenario', ''))

            # Augment reply
            reply_augmentations = self.augment(
                sample.get('reply', ''),
                persona_style=persona_style,
                mood=mood,
                n_augmentations=target_multiplier - 1,
            )

            for aug_reply in reply_augmentations:
                aug_sample = sample.copy()
                aug_sample['reply'] = aug_reply
                aug_sample['augmented'] = True
                augmented.append(aug_sample)

        return augmented

    def _scenario_to_mood(self, scenario: str) -> str:
        """Map scenario to mood."""
        scenario = scenario.lower()

        if any(w in scenario for w in ['greet', 'hello', 'welcome']):
            return 'warm'
        elif any(w in scenario for w in ['question', 'ask', 'wonder']):
            return 'curious'
        elif any(w in scenario for w in ['sad', 'sorry', 'help', 'problem']):
            return 'concerned'
        elif any(w in scenario for w in ['fun', 'joke', 'play', 'game']):
            return 'playful'
        elif any(w in scenario for w in ['excite', 'amaze', 'great', 'awesome']):
            return 'excited'
        else:
            return 'neutral'

    def combine_samples(
        self,
        samples: List[Dict[str, Any]],
        n_combinations: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Create new samples by combining parts of existing ones.

        Args:
            samples: Original samples
            n_combinations: Number of combinations to generate

        Returns:
            Combined samples
        """
        combinations = []

        for _ in range(n_combinations):
            if len(samples) < 2:
                break

            # Pick two random samples
            s1, s2 = random.sample(samples, 2)

            reply1 = s1.get('reply', '')
            reply2 = s2.get('reply', '')

            if not reply1 or not reply2:
                continue

            # Sentence-level combination
            sentences1 = re.split(r'(?<=[.!?])\s+', reply1)
            sentences2 = re.split(r'(?<=[.!?])\s+', reply2)

            if len(sentences1) >= 1 and len(sentences2) >= 1:
                # Take first part from s1, add a sentence from s2
                combined_reply = sentences1[0] + ' ' + random.choice(sentences2)

                combined_sample = {
                    'prompt': s1.get('prompt', ''),
                    'reply': combined_reply.strip(),
                    'scenario': 'combined',
                    'augmented': True,
                    'source_scenarios': [s1.get('scenario'), s2.get('scenario')],
                }
                combinations.append(combined_sample)

        return combinations


class PersonaAugmentationPipeline:
    """
    Pipeline for augmenting persona training data.
    Applies multiple augmentation strategies.
    """

    def __init__(self, augmenter: Optional[PersonaDataAugmenter] = None):
        self.augmenter = augmenter or PersonaDataAugmenter()

    def process(
        self,
        samples: List[Dict[str, Any]],
        persona_name: str,
        persona_style: str = 'casual',
        target_size: int = 200,
    ) -> List[Dict[str, Any]]:
        """
        Process samples through augmentation pipeline.

        Args:
            samples: Original training samples
            persona_name: Name of the persona
            persona_style: Style (casual, formal, playful, warm, enthusiastic)
            target_size: Target dataset size

        Returns:
            Augmented dataset
        """
        original_count = len(samples)

        if original_count >= target_size:
            return samples

        # Calculate augmentation factor
        factor = max(2, (target_size // original_count) + 1)

        # Apply standard augmentation
        augmented = self.augmenter.augment_dataset(
            samples,
            persona_style=persona_style,
            target_multiplier=factor,
        )

        # Add combinations if still under target
        if len(augmented) < target_size:
            n_combos = min(target_size - len(augmented), original_count * 2)
            combinations = self.augmenter.combine_samples(samples, n_combos)
            augmented.extend(combinations)

        # Shuffle
        random.shuffle(augmented)

        return augmented[:target_size]

    def get_stats(
        self,
        original: List[Dict],
        augmented: List[Dict],
    ) -> Dict:
        """Get augmentation statistics."""
        original_count = len(original)
        augmented_count = len([s for s in augmented if s.get('augmented')])
        total_count = len(augmented)

        return {
            'original_samples': original_count,
            'augmented_samples': augmented_count,
            'total_samples': total_count,
            'augmentation_ratio': round(total_count / max(1, original_count), 2),
        }


# Global instances
_augmenter: Optional[PersonaDataAugmenter] = None
_pipeline: Optional[PersonaAugmentationPipeline] = None


def get_augmenter() -> PersonaDataAugmenter:
    """Get global augmenter instance."""
    global _augmenter
    if _augmenter is None:
        _augmenter = PersonaDataAugmenter()
    return _augmenter


def get_pipeline() -> PersonaAugmentationPipeline:
    """Get global pipeline instance."""
    global _pipeline
    if _pipeline is None:
        _pipeline = PersonaAugmentationPipeline()
    return _pipeline


def augment_persona_data(
    samples: List[Dict],
    persona_name: str,
    persona_style: str = 'casual',
    target_size: int = 200,
) -> Tuple[List[Dict], Dict]:
    """
    Convenience function to augment persona data.

    Args:
        samples: Original samples
        persona_name: Persona name
        persona_style: Persona style
        target_size: Target dataset size

    Returns:
        Tuple of (augmented_samples, stats)
    """
    pipeline = get_pipeline()
    augmented = pipeline.process(samples, persona_name, persona_style, target_size)
    stats = pipeline.get_stats(samples, augmented)

    return augmented, stats
