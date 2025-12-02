"""
Template-based response generation with slot filling.
Provides reliable, persona-consistent responses with controlled variation.
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class TemplateFiller:
    """
    Template-based generation with slot filling.

    Templates use {slot_name} syntax for replaceable parts.
    Slots are filled probabilistically based on mood and context.
    """

    def __init__(self, templates_path: Optional[Path] = None):
        """
        Initialize template filler.

        Args:
            templates_path: Path to templates JSON file
        """
        self.templates_path = templates_path
        self.templates: Dict[str, Dict] = {}
        self.slot_fillers: Dict[str, Dict[str, List[Tuple[str, float]]]] = {}
        self.persona_styles: Dict[str, Dict] = {}

        if templates_path and templates_path.exists():
            self._load_templates(templates_path)
        else:
            self._init_default_templates()

    def _load_templates(self, path: Path):
        """Load templates from JSON file."""
        try:
            data = json.loads(path.read_text())
            self.templates = data.get('templates', {})
            self.slot_fillers = data.get('slot_fillers', {})
            self.persona_styles = data.get('persona_styles', {})
        except Exception as e:
            import logging
            logging.warning(f"Failed to load templates: {e}")
            self._init_default_templates()

    def _init_default_templates(self):
        """Initialize with default templates."""
        # Default templates for common scenarios
        self.templates = {
            'greeting': {
                'default': [
                    "{emote} {opener}! {feeling_phrase}",
                    "{opener}! {emote} {topic_hook}",
                ],
                'elio': [
                    "{emote} {opener}! {feeling_phrase} {topic_hook}",
                    "{emote} Oh, {opener}... {feeling_phrase}",
                ],
            },
            'question_response': {
                'default': [
                    "{emote} {acknowledgment} {main_response}",
                    "{acknowledgment} {emote} {main_response}",
                ],
            },
            'encouragement': {
                'default': [
                    "{emote} {empathy_phrase} {encouragement}",
                    "{encouragement} {emote}",
                ],
            },
            'curiosity': {
                'default': [
                    "{emote} {curiosity_opener} {question}",
                    "{curiosity_opener}! {emote} {question}",
                ],
            },
            'fallback': {
                'default': [
                    "{emote} {generic_response}",
                    "{generic_response} {emote}",
                ],
            },
        }

        # Default slot fillers with (text, probability) tuples
        self.slot_fillers = {
            'default': {
                'emote': [
                    ('*smiles*', 0.25),
                    ('*nods*', 0.25),
                    ('*thinks*', 0.2),
                    ('', 0.3),  # Sometimes no emote
                ],
                'opener': [
                    ('Hey there', 0.3),
                    ('Hello', 0.3),
                    ('Hi', 0.2),
                    ('Oh, hi', 0.2),
                ],
                'feeling_phrase': [
                    ("it's good to see you", 0.3),
                    ("how are you doing", 0.3),
                    ("nice to hear from you", 0.2),
                    ("I was just thinking about this", 0.2),
                ],
                'topic_hook': [
                    ("What's on your mind?", 0.3),
                    ("Tell me more!", 0.3),
                    ("I'm curious.", 0.2),
                    ("", 0.2),
                ],
                'acknowledgment': [
                    ("Hmm, let me think...", 0.25),
                    ("Good question!", 0.25),
                    ("I see!", 0.25),
                    ("Well...", 0.25),
                ],
                'main_response': [
                    ("That's something I think about a lot.", 0.3),
                    ("I appreciate you asking.", 0.3),
                    ("Let me share my thoughts.", 0.2),
                    ("Here's what I think.", 0.2),
                ],
                'empathy_phrase': [
                    ("I understand how you feel.", 0.3),
                    ("That makes sense.", 0.3),
                    ("I hear you.", 0.2),
                    ("I can see that.", 0.2),
                ],
                'encouragement': [
                    ("You've got this!", 0.25),
                    ("Keep going!", 0.25),
                    ("I believe in you.", 0.25),
                    ("You're doing great.", 0.25),
                ],
                'curiosity_opener': [
                    ("I wonder", 0.3),
                    ("I'm curious", 0.3),
                    ("Tell me", 0.2),
                    ("I'd love to know", 0.2),
                ],
                'question': [
                    ("what you think about this?", 0.3),
                    ("how this works?", 0.3),
                    ("more about that.", 0.2),
                    ("your perspective.", 0.2),
                ],
                'generic_response': [
                    ("That's interesting.", 0.25),
                    ("I appreciate that.", 0.25),
                    ("Thanks for sharing.", 0.25),
                    ("I'll think about that.", 0.25),
                ],
            },
            'elio': {
                'emote': [
                    ('*eyes light up*', 0.3),
                    ('*bounces excitedly*', 0.2),
                    ('*smiles shyly*', 0.2),
                    ('*sighs softly*', 0.15),
                    ('', 0.15),
                ],
                'opener': [
                    ('Oh, hey', 0.3),
                    ('Um, hi', 0.25),
                    ('Wow, hey', 0.2),
                    ('This is so cosmic', 0.15),
                    ('Oh!', 0.1),
                ],
                'feeling_phrase': [
                    ("I've been thinking about space a lot", 0.25),
                    ("it's been kind of a wild ride lately", 0.25),
                    ("I'm so glad you're here", 0.25),
                    ("sometimes I still feel a bit lonely", 0.15),
                    ("the stars are amazing today", 0.1),
                ],
                'topic_hook': [
                    ("Did you know about black holes?", 0.2),
                    ("Space is so fascinating!", 0.2),
                    ("I learned something cool!", 0.2),
                    ("Want to explore with me?", 0.2),
                    ("", 0.2),
                ],
            },
            'glordon': {
                'emote': [
                    ('*tilts head*', 0.25),
                    ('*laughs in a rumbling way*', 0.2),
                    ('*grins*', 0.2),
                    ('*chuckles*', 0.2),
                    ('', 0.15),
                ],
                'opener': [
                    ('Well hello there', 0.3),
                    ('Ah, greetings', 0.25),
                    ('Hey hey', 0.25),
                    ('Oh-ho', 0.2),
                ],
            },
            'olga': {
                'emote': [
                    ('*steady gaze*', 0.25),
                    ('*crosses arms*', 0.2),
                    ('*nods firmly*', 0.2),
                    ('*assessing look*', 0.2),
                    ('', 0.15),
                ],
                'opener': [
                    ('Listen', 0.3),
                    ('Right', 0.25),
                    ('Okay', 0.25),
                    ('Here\'s the thing', 0.2),
                ],
            },
        }

        # Persona style modifiers
        self.persona_styles = {
            'elio': {
                'exclamation_boost': 1.3,  # More likely to use !
                'question_boost': 1.2,  # More curious
                'warmth': 0.9,  # High warmth
            },
            'glordon': {
                'exclamation_boost': 1.1,
                'humor_phrases': ['—just kidding!', '—or am I?'],
            },
            'olga': {
                'exclamation_boost': 0.7,  # Less exclamatory
                'formal_boost': 1.2,
            },
        }

    def fill(
        self,
        persona: str,
        scenario: str,
        mood: str = 'neutral',
        context: Optional[Dict] = None,
    ) -> Dict:
        """
        Fill a template for the given persona and scenario.

        Args:
            persona: Persona name
            scenario: Scenario type (greeting, question_response, etc.)
            mood: Current mood
            context: Optional context dict with additional variables

        Returns:
            Dict with filled text and metadata
        """
        context = context or {}

        # Get templates for scenario
        scenario_templates = self.templates.get(scenario, self.templates.get('fallback', {}))

        # Try persona-specific templates first, then default
        templates = scenario_templates.get(persona.lower(), scenario_templates.get('default', []))

        if not templates:
            return {
                'text': '',
                'confidence': 0.0,
                'source': 'template_fill',
            }

        # Select a template
        template = random.choice(templates)

        # Get fillers for persona
        persona_key = persona.lower()
        fillers = self.slot_fillers.get(persona_key, {})
        default_fillers = self.slot_fillers.get('default', {})

        # Fill all slots
        filled = template
        slots_filled = 0
        total_slots = len(re.findall(r'\{(\w+)\}', template))

        for slot in re.findall(r'\{(\w+)\}', template):
            # Check context first
            if slot in context:
                replacement = str(context[slot])
            else:
                # Get filler options (persona-specific or default)
                options = fillers.get(slot, default_fillers.get(slot, []))

                if options:
                    replacement = self._weighted_choice(options, mood)
                else:
                    replacement = ''

            filled = filled.replace(f'{{{slot}}}', replacement, 1)
            slots_filled += 1

        # Clean up double spaces and trailing punctuation issues
        filled = re.sub(r'\s+', ' ', filled).strip()
        filled = re.sub(r'\s+([.,!?])', r'\1', filled)

        # Apply persona style modifiers
        filled = self._apply_style(filled, persona, mood)

        # Calculate confidence based on slot fill rate
        confidence = 0.5 + (0.3 * (slots_filled / max(1, total_slots)))

        return {
            'text': filled,
            'confidence': confidence,
            'source': 'template_fill',
            'metadata': {
                'template': template,
                'scenario': scenario,
                'persona': persona,
                'mood': mood,
            },
        }

    def _weighted_choice(
        self,
        options: List[Tuple[str, float]],
        mood: str,
    ) -> str:
        """
        Choose an option based on weights and mood.

        Args:
            options: List of (text, probability) tuples
            mood: Current mood for adjustment

        Returns:
            Selected text
        """
        if not options:
            return ''

        # Adjust weights based on mood
        adjusted = []
        for text, prob in options:
            weight = prob

            # Mood-based adjustments
            text_lower = text.lower()
            if mood == 'excited':
                if '!' in text or 'wow' in text_lower:
                    weight *= 1.3
            elif mood == 'curious':
                if '?' in text or 'wonder' in text_lower:
                    weight *= 1.3
            elif mood == 'warm':
                if 'smile' in text_lower or 'glad' in text_lower:
                    weight *= 1.2
            elif mood == 'playful':
                if 'grin' in text_lower or 'chuckle' in text_lower:
                    weight *= 1.2

            adjusted.append((text, weight))

        # Normalize and sample
        total = sum(w for _, w in adjusted)
        if total <= 0:
            return options[0][0] if options else ''

        r = random.random() * total
        cumulative = 0.0
        for text, weight in adjusted:
            cumulative += weight
            if r <= cumulative:
                return text

        return adjusted[-1][0]

    def _apply_style(self, text: str, persona: str, mood: str) -> str:
        """
        Apply persona-specific style modifications.

        Args:
            text: Filled text
            persona: Persona name
            mood: Current mood

        Returns:
            Styled text
        """
        style = self.persona_styles.get(persona.lower(), {})

        # Add humor phrases for playful personas
        if mood == 'playful' and 'humor_phrases' in style:
            if random.random() < 0.2:
                text += ' ' + random.choice(style['humor_phrases'])

        # Adjust exclamation frequency
        exclaim_boost = style.get('exclamation_boost', 1.0)
        if exclaim_boost > 1.0 and '.' in text and random.random() < (exclaim_boost - 1.0):
            # Replace one period with exclamation
            text = text.replace('.', '!', 1)
        elif exclaim_boost < 1.0 and '!' in text and random.random() < (1.0 - exclaim_boost):
            # Replace one exclamation with period
            text = text.replace('!', '.', 1)

        return text

    def add_template(
        self,
        scenario: str,
        template: str,
        persona: str = 'default',
    ):
        """
        Add a new template.

        Args:
            scenario: Scenario type
            template: Template string with {slots}
            persona: Persona name or 'default'
        """
        if scenario not in self.templates:
            self.templates[scenario] = {}

        if persona not in self.templates[scenario]:
            self.templates[scenario][persona] = []

        self.templates[scenario][persona].append(template)

    def add_filler(
        self,
        slot: str,
        options: List[Tuple[str, float]],
        persona: str = 'default',
    ):
        """
        Add slot filler options.

        Args:
            slot: Slot name
            options: List of (text, probability) tuples
            persona: Persona name or 'default'
        """
        if persona not in self.slot_fillers:
            self.slot_fillers[persona] = {}

        self.slot_fillers[persona][slot] = options

    def get_scenarios(self) -> List[str]:
        """Get list of available scenarios."""
        return list(self.templates.keys())

    def get_personas(self) -> List[str]:
        """Get list of personas with custom templates/fillers."""
        personas = set()
        for scenario_templates in self.templates.values():
            personas.update(scenario_templates.keys())
        personas.update(self.slot_fillers.keys())
        personas.discard('default')
        return list(personas)

    def save(self, path: Path):
        """Save templates to JSON file."""
        data = {
            'templates': self.templates,
            'slot_fillers': self.slot_fillers,
            'persona_styles': self.persona_styles,
        }
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


# Singleton instance
_FILLER: Optional[TemplateFiller] = None


def get_template_filler() -> TemplateFiller:
    """Get or create singleton template filler."""
    global _FILLER
    if _FILLER is None:
        # Try to load from data directory
        repo_root = Path(__file__).resolve().parents[3]
        templates_path = repo_root / 'data' / 'templates' / 'persona-templates.json'
        _FILLER = TemplateFiller(templates_path if templates_path.exists() else None)
    return _FILLER
