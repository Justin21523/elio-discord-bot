"""
Human-like error injection for game AI.
Makes bots feel more natural by adding realistic mistakes and delays.
"""
from __future__ import annotations

import random
import math
from typing import Dict, List, Optional, Tuple, Any


class HumanLikeErrorInjector:
    """
    Injects human-like errors and variations into game AI behavior.

    Error types:
    - Reaction time variation (fatigue, distraction)
    - Misclicks / wrong button presses
    - Suboptimal decisions under pressure
    - Consistency drift over time
    - Tilt behavior when losing
    """

    # Reaction time parameters (milliseconds)
    BASE_REACTION_MS = 400
    REACTION_STD_DEV = 150
    MIN_REACTION_MS = 150
    MAX_REACTION_MS = 2000

    # Error rates by skill level
    ERROR_RATES = {
        'novice': {'misclick': 0.12, 'suboptimal': 0.25, 'panic': 0.15},
        'beginner': {'misclick': 0.08, 'suboptimal': 0.18, 'panic': 0.10},
        'intermediate': {'misclick': 0.04, 'suboptimal': 0.10, 'panic': 0.06},
        'advanced': {'misclick': 0.02, 'suboptimal': 0.05, 'panic': 0.03},
        'expert': {'misclick': 0.005, 'suboptimal': 0.02, 'panic': 0.01},
    }

    def __init__(
        self,
        skill_tier: str = 'intermediate',
        fatigue_rate: float = 0.01,
        tilt_sensitivity: float = 0.5,
    ):
        """
        Initialize error injector.

        Args:
            skill_tier: One of 'novice', 'beginner', 'intermediate', 'advanced', 'expert'
            fatigue_rate: How quickly reaction time degrades per turn
            tilt_sensitivity: How much losing affects error rates (0-1)
        """
        if skill_tier not in self.ERROR_RATES:
            skill_tier = 'intermediate'

        self.skill_tier = skill_tier
        self.error_rates = self.ERROR_RATES[skill_tier].copy()
        self.base_error_rates = self.error_rates.copy()
        self.fatigue_rate = fatigue_rate
        self.tilt_sensitivity = tilt_sensitivity

        # State tracking
        self.turn_count = 0
        self.fatigue_level = 0.0
        self.tilt_level = 0.0
        self.consecutive_losses = 0
        self.recent_hp_changes: List[int] = []

    def get_reaction_time(self, is_critical: bool = False) -> int:
        """
        Get a human-like reaction time in milliseconds.

        Args:
            is_critical: Whether this is a critical/time-sensitive situation

        Returns:
            Reaction time in milliseconds
        """
        base = self.BASE_REACTION_MS

        # Skill tier adjustment
        skill_multipliers = {
            'novice': 1.4,
            'beginner': 1.2,
            'intermediate': 1.0,
            'advanced': 0.85,
            'expert': 0.7,
        }
        base *= skill_multipliers.get(self.skill_tier, 1.0)

        # Fatigue increases reaction time
        base *= (1.0 + self.fatigue_level * 0.5)

        # Critical situations can cause faster OR slower reactions
        if is_critical:
            if random.random() < 0.3:  # 30% chance of panic (slower)
                base *= 1.5
            else:  # Adrenaline (faster)
                base *= 0.8

        # Add gaussian noise
        reaction = random.gauss(base, self.REACTION_STD_DEV)

        # Occasional outliers (distraction, etc)
        if random.random() < 0.05:
            reaction *= random.uniform(1.5, 2.5)

        return int(max(self.MIN_REACTION_MS, min(self.MAX_REACTION_MS, reaction)))

    def should_misclick(self) -> bool:
        """Check if a misclick should occur."""
        rate = self.error_rates['misclick']

        # Increase with fatigue
        rate *= (1.0 + self.fatigue_level)

        # Increase with tilt
        rate *= (1.0 + self.tilt_level * 0.5)

        return random.random() < rate

    def get_misclick_action(
        self,
        intended_action: str,
        available_actions: List[str]
    ) -> str:
        """
        Get a realistic misclick replacement action.
        Misclicks typically hit adjacent or similar options.

        Args:
            intended_action: The action the player meant to select
            available_actions: All available actions

        Returns:
            The "misclicked" action
        """
        if len(available_actions) <= 1:
            return intended_action

        # Action similarity groups (actions that might be confused)
        similarity_groups = [
            ['strike', 'quick', 'heavy'],  # Attack actions
            ['guard', 'block'],  # Defensive actions
            ['heal'],  # Utility
        ]

        # Find the group of the intended action
        intended_group = None
        for group in similarity_groups:
            if intended_action in group:
                intended_group = group
                break

        # 70% chance to misclick within same group if possible
        if intended_group and random.random() < 0.7:
            group_actions = [a for a in intended_group if a in available_actions and a != intended_action]
            if group_actions:
                return random.choice(group_actions)

        # Otherwise random other action
        other_actions = [a for a in available_actions if a != intended_action]
        return random.choice(other_actions) if other_actions else intended_action

    def should_make_suboptimal_choice(self) -> bool:
        """Check if player makes a suboptimal (but not random) choice."""
        rate = self.error_rates['suboptimal']

        # Increase with fatigue
        rate *= (1.0 + self.fatigue_level * 0.5)

        # Increase when tilted
        rate *= (1.0 + self.tilt_level)

        return random.random() < rate

    def should_panic(self, hp_ratio: float) -> bool:
        """Check if player panics under pressure."""
        rate = self.error_rates['panic']

        # Much higher chance when low HP
        if hp_ratio < 0.2:
            rate *= 3.0
        elif hp_ratio < 0.4:
            rate *= 1.5

        # Increase with tilt
        rate *= (1.0 + self.tilt_level)

        return random.random() < rate

    def get_panic_action(self, available_actions: List[str]) -> str:
        """
        Get a panic-influenced action.
        Panic tends toward defensive actions or spam attacks.
        """
        # When panicking, players either go full defensive or spam attack
        panic_preferences = {
            'block': 0.3,
            'guard': 0.25,
            'heal': 0.2,
            'strike': 0.15,
            'quick': 0.1,
        }

        available_prefs = {a: panic_preferences.get(a, 0.05) for a in available_actions}
        total = sum(available_prefs.values())

        r = random.random() * total
        cumulative = 0.0
        for action, weight in available_prefs.items():
            cumulative += weight
            if r <= cumulative:
                return action

        return available_actions[0]

    def update_state(
        self,
        my_hp_change: int = 0,
        won_exchange: bool = True,
    ):
        """
        Update internal state after an action/turn.

        Args:
            my_hp_change: Change in bot's HP (negative = took damage)
            won_exchange: Whether the bot "won" this exchange
        """
        self.turn_count += 1

        # Update fatigue (increases over time)
        self.fatigue_level = min(1.0, self.fatigue_level + self.fatigue_rate)

        # Track HP changes for tilt calculation
        self.recent_hp_changes.append(my_hp_change)
        if len(self.recent_hp_changes) > 5:
            self.recent_hp_changes.pop(0)

        # Update consecutive losses
        if not won_exchange:
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = max(0, self.consecutive_losses - 1)

        # Calculate tilt level
        self._update_tilt()

    def _update_tilt(self):
        """Update tilt level based on recent performance."""
        # Tilt from consecutive losses
        loss_tilt = min(1.0, self.consecutive_losses * 0.15)

        # Tilt from HP loss trend
        if self.recent_hp_changes:
            avg_change = sum(self.recent_hp_changes) / len(self.recent_hp_changes)
            hp_tilt = max(0, -avg_change / 20)  # More tilt from taking damage
        else:
            hp_tilt = 0

        # Combine with sensitivity
        self.tilt_level = min(1.0, (loss_tilt + hp_tilt) * self.tilt_sensitivity)

        # Update error rates based on tilt
        for error_type in self.error_rates:
            base = self.base_error_rates[error_type]
            tilt_multiplier = 1.0 + self.tilt_level
            self.error_rates[error_type] = min(0.5, base * tilt_multiplier)

    def inject_errors(
        self,
        intended_action: str,
        available_actions: List[str],
        hp_ratio: float,
        action_scores: Optional[Dict[str, float]] = None,
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Process an intended action through error injection.

        Args:
            intended_action: The optimal action chosen by the AI
            available_actions: All available actions
            hp_ratio: Current HP as ratio (0-1)
            action_scores: Optional dict of action scores for suboptimal selection

        Returns:
            Tuple of (final_action, error_info)
        """
        error_info = {
            'original_action': intended_action,
            'error_type': None,
            'fatigue_level': self.fatigue_level,
            'tilt_level': self.tilt_level,
        }

        final_action = intended_action

        # Check for panic first (overrides other errors)
        if self.should_panic(hp_ratio):
            final_action = self.get_panic_action(available_actions)
            error_info['error_type'] = 'panic'
            error_info['panic_action'] = final_action
            return final_action, error_info

        # Check for misclick
        if self.should_misclick():
            final_action = self.get_misclick_action(intended_action, available_actions)
            error_info['error_type'] = 'misclick'
            error_info['misclick_to'] = final_action
            return final_action, error_info

        # Check for suboptimal choice
        if self.should_make_suboptimal_choice() and action_scores:
            # Pick second or third best action instead of best
            sorted_actions = sorted(
                [(a, s) for a, s in action_scores.items() if a in available_actions],
                key=lambda x: x[1],
                reverse=True
            )

            if len(sorted_actions) >= 2:
                # Pick from non-optimal actions with probability based on score
                suboptimal = sorted_actions[1:]
                weights = [max(0.1, s) for a, s in suboptimal]
                total = sum(weights)
                r = random.random() * total
                cumulative = 0.0

                for (action, score), weight in zip(suboptimal, weights):
                    cumulative += weight
                    if r <= cumulative:
                        final_action = action
                        break

                error_info['error_type'] = 'suboptimal'
                error_info['suboptimal_action'] = final_action

        return final_action, error_info

    def reset(self):
        """Reset state for new game."""
        self.turn_count = 0
        self.fatigue_level = 0.0
        self.tilt_level = 0.0
        self.consecutive_losses = 0
        self.recent_hp_changes = []
        self.error_rates = self.base_error_rates.copy()

    def get_stats(self) -> Dict:
        """Get current error injector statistics."""
        return {
            'skill_tier': self.skill_tier,
            'turn_count': self.turn_count,
            'fatigue_level': round(self.fatigue_level, 3),
            'tilt_level': round(self.tilt_level, 3),
            'consecutive_losses': self.consecutive_losses,
            'current_error_rates': {k: round(v, 4) for k, v in self.error_rates.items()},
        }


def create_error_injector(
    skill_level: float = 0.7,
    fatigue_rate: float = 0.01,
    tilt_sensitivity: float = 0.5,
) -> HumanLikeErrorInjector:
    """
    Factory function to create error injector from skill level.

    Args:
        skill_level: Skill level 0-1
        fatigue_rate: How fast fatigue accumulates
        tilt_sensitivity: How much losing affects performance

    Returns:
        Configured HumanLikeErrorInjector
    """
    # Map skill level to tier
    if skill_level < 0.2:
        tier = 'novice'
    elif skill_level < 0.4:
        tier = 'beginner'
    elif skill_level < 0.6:
        tier = 'intermediate'
    elif skill_level < 0.8:
        tier = 'advanced'
    else:
        tier = 'expert'

    return HumanLikeErrorInjector(
        skill_tier=tier,
        fatigue_rate=fatigue_rate,
        tilt_sensitivity=tilt_sensitivity,
    )
