"""
Probabilistic Finite Automata (PFA) behavior model for game bot personalities.
Different playstyles have different state machines that drive behavior.
"""
from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple


# Available playstyles
PLAYSTYLES = ['aggressive', 'defensive', 'balanced', 'chaotic']


class PFABehaviorModel:
    """
    PFA-based behavior model for game bot personalities.

    Each playstyle defines:
    - States: Current behavioral state
    - Transitions: Probabilities of moving between states
    - Action mappings: Which actions are preferred in each state
    """

    # Playstyle configurations
    PERSONALITIES = {
        'aggressive': {
            'states': ['attack', 'pressure', 'retreat'],
            'initial': 'attack',
            'transitions': {
                'attack': [('attack', 0.6), ('pressure', 0.3), ('retreat', 0.1)],
                'pressure': [('attack', 0.5), ('pressure', 0.4), ('retreat', 0.1)],
                'retreat': [('attack', 0.3), ('pressure', 0.4), ('retreat', 0.3)],
            },
            'action_map': {
                'attack': ['strike', 'quick'],
                'pressure': ['strike', 'guard'],
                'retreat': ['guard', 'block'],
            },
            'hp_threshold_retreat': 0.2,  # Retreat when HP < 20%
        },
        'defensive': {
            'states': ['guard', 'counter', 'wait'],
            'initial': 'guard',
            'transitions': {
                'guard': [('guard', 0.5), ('counter', 0.3), ('wait', 0.2)],
                'counter': [('guard', 0.4), ('counter', 0.4), ('wait', 0.2)],
                'wait': [('guard', 0.6), ('counter', 0.2), ('wait', 0.2)],
            },
            'action_map': {
                'guard': ['guard', 'block'],
                'counter': ['strike', 'quick'],
                'wait': ['guard', 'block'],
            },
            'hp_threshold_retreat': 0.3,  # More cautious
        },
        'balanced': {
            'states': ['neutral', 'offensive', 'defensive'],
            'initial': 'neutral',
            'transitions': {
                'neutral': [('neutral', 0.4), ('offensive', 0.3), ('defensive', 0.3)],
                'offensive': [('neutral', 0.3), ('offensive', 0.5), ('defensive', 0.2)],
                'defensive': [('neutral', 0.3), ('offensive', 0.2), ('defensive', 0.5)],
            },
            'action_map': {
                'neutral': ['strike', 'guard'],
                'offensive': ['strike', 'quick'],
                'defensive': ['guard', 'block'],
            },
            'hp_threshold_retreat': 0.25,
        },
        'chaotic': {
            'states': ['chaos'],
            'initial': 'chaos',
            'transitions': {
                'chaos': [('chaos', 1.0)],
            },
            'action_map': {
                'chaos': ['strike', 'guard', 'quick', 'block'],  # All equal probability
            },
            'hp_threshold_retreat': 0.15,  # Only retreat when very low
        },
    }

    def __init__(self, playstyle: str = 'balanced'):
        """
        Initialize PFA behavior model.

        Args:
            playstyle: One of 'aggressive', 'defensive', 'balanced', 'chaotic'
        """
        if playstyle not in self.PERSONALITIES:
            playstyle = 'balanced'

        config = self.PERSONALITIES[playstyle]
        self.playstyle = playstyle
        self.states = config['states']
        self.transitions = config['transitions']
        self.action_map = config['action_map']
        self.hp_threshold_retreat = config.get('hp_threshold_retreat', 0.25)
        self.current_state = config['initial']

        # Track state history for analysis
        self.state_history: List[str] = [self.current_state]

    def get_tendency(self, game_context: Optional[Dict] = None) -> str:
        """
        Get current behavioral tendency based on state and context.

        Args:
            game_context: Optional game state for context-aware adjustments

        Returns:
            Current behavioral tendency (state name)
        """
        # Context-aware state modification
        if game_context:
            self._adjust_for_context(game_context)

        return self.current_state

    def next_action(self, game_context: Optional[Dict] = None) -> str:
        """
        Get next action based on current behavioral state.

        Args:
            game_context: Optional game state

        Returns:
            Preferred action from current state's action map
        """
        # Get tendency (may adjust state)
        state = self.get_tendency(game_context)

        # Get actions for current state
        actions = self.action_map.get(state, ['strike'])

        # Select action with equal probability
        action = random.choice(actions)

        # Transition to next state
        self._transition()

        return action

    def get_action_preferences(self, game_context: Optional[Dict] = None) -> Dict[str, float]:
        """
        Get probability distribution over actions.

        Args:
            game_context: Optional game state

        Returns:
            Dict mapping action names to probabilities
        """
        state = self.get_tendency(game_context)
        actions = self.action_map.get(state, ['strike'])

        # Equal probability for each action in state
        prob = 1.0 / len(actions)
        return {action: prob for action in actions}

    def _adjust_for_context(self, context: Dict):
        """
        Adjust state based on game context.

        Args:
            context: Game state with hp, enemy_hp, etc.
        """
        my_hp = context.get('my_hp', 100)
        my_max_hp = context.get('my_max_hp', 100)
        enemy_hp = context.get('enemy_hp', 100)
        enemy_max_hp = context.get('enemy_max_hp', 100)

        hp_ratio = my_hp / max(1, my_max_hp)
        enemy_hp_ratio = enemy_hp / max(1, enemy_max_hp)

        # Force retreat state if HP critical
        if hp_ratio < self.hp_threshold_retreat:
            if 'retreat' in self.states:
                self.current_state = 'retreat'
            elif 'defensive' in self.states:
                self.current_state = 'defensive'
            elif 'guard' in self.states:
                self.current_state = 'guard'

        # Aggressive when enemy is low HP
        if enemy_hp_ratio < 0.3 and hp_ratio > 0.4:
            if 'attack' in self.states:
                if random.random() < 0.7:  # 70% chance to attack
                    self.current_state = 'attack'
            elif 'offensive' in self.states:
                if random.random() < 0.7:
                    self.current_state = 'offensive'

    def _transition(self):
        """Probabilistically transition to next state."""
        trans = self.transitions.get(self.current_state)
        if not trans:
            return

        r = random.random()
        cumulative = 0.0
        for state, prob in trans:
            cumulative += prob
            if r <= cumulative:
                self.current_state = state
                self.state_history.append(state)
                if len(self.state_history) > 20:
                    self.state_history.pop(0)
                return

    def reset(self):
        """Reset to initial state."""
        config = self.PERSONALITIES[self.playstyle]
        self.current_state = config['initial']
        self.state_history = [self.current_state]

    def get_stats(self) -> Dict:
        """Get behavior statistics."""
        state_counts = {}
        for state in self.state_history:
            state_counts[state] = state_counts.get(state, 0) + 1

        return {
            'playstyle': self.playstyle,
            'current_state': self.current_state,
            'state_counts': state_counts,
            'history_length': len(self.state_history),
        }

    @classmethod
    def random_playstyle(cls) -> 'PFABehaviorModel':
        """Create model with random playstyle."""
        playstyle = random.choice(PLAYSTYLES)
        return cls(playstyle)
