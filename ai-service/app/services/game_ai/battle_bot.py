"""
Tactical Battle Bot for human-like game AI.
Combines PFA behavior model with simple lookahead for action selection.
"""
from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple, Any

from .pfa_behavior import PFABehaviorModel, PLAYSTYLES


# Action definitions matching BattleGame.js
ACTIONS = {
    'strike': {'damage': 15, 'accuracy': 0.85, 'cooldown': 0},
    'guard': {'damage': 0, 'accuracy': 1.0, 'cooldown': 0, 'defense': 0.5},
    'quick': {'damage': 8, 'accuracy': 0.95, 'cooldown': 0},
    'block': {'damage': 0, 'accuracy': 1.0, 'cooldown': 0, 'defense': 0.8},
    'heavy': {'damage': 25, 'accuracy': 0.7, 'cooldown': 1},
    'heal': {'heal': 20, 'accuracy': 0.9, 'cooldown': 2},
}


class TacticalBattleBot:
    """
    A tactical battle bot that uses PFA for behavior and simple lookahead for decisions.

    The bot:
    1. Uses PFA to determine behavioral tendency (aggressive/defensive/etc)
    2. Considers game state (HP, cooldowns, enemy patterns)
    3. Applies simple 1-step lookahead for action evaluation
    4. Adds human-like delays and occasional suboptimal choices
    """

    def __init__(
        self,
        playstyle: str = 'balanced',
        skill_level: float = 0.7,
        personality_weight: float = 0.6,
    ):
        """
        Initialize tactical battle bot.

        Args:
            playstyle: One of 'aggressive', 'defensive', 'balanced', 'chaotic'
            skill_level: How optimal the bot plays (0-1, higher = better)
            personality_weight: How much personality affects decisions vs pure tactics
        """
        self.pfa = PFABehaviorModel(playstyle)
        self.skill_level = max(0.0, min(1.0, skill_level))
        self.personality_weight = max(0.0, min(1.0, personality_weight))

        # Track game state
        self.my_hp = 100
        self.my_max_hp = 100
        self.enemy_hp = 100
        self.enemy_max_hp = 100
        self.cooldowns: Dict[str, int] = {}
        self.enemy_last_actions: List[str] = []
        self.turn_count = 0

        # Pattern recognition for enemy
        self.enemy_action_counts: Dict[str, int] = {}

    def select_action(
        self,
        my_hp: int,
        enemy_hp: int,
        available_actions: List[str],
        cooldowns: Optional[Dict[str, int]] = None,
        enemy_last_action: Optional[str] = None,
        my_max_hp: int = 100,
        enemy_max_hp: int = 100,
    ) -> Dict[str, Any]:
        """
        Select next action based on game state.

        Args:
            my_hp: Bot's current HP
            enemy_hp: Enemy's current HP
            available_actions: List of action names the bot can use
            cooldowns: Dict of action cooldowns (action -> turns remaining)
            enemy_last_action: The enemy's previous action
            my_max_hp: Bot's max HP
            enemy_max_hp: Enemy's max HP

        Returns:
            Dict with action, confidence, reasoning
        """
        # Update state
        self.my_hp = my_hp
        self.my_max_hp = my_max_hp
        self.enemy_hp = enemy_hp
        self.enemy_max_hp = enemy_max_hp
        self.cooldowns = cooldowns or {}
        self.turn_count += 1

        # Track enemy patterns
        if enemy_last_action:
            self.enemy_last_actions.append(enemy_last_action)
            if len(self.enemy_last_actions) > 10:
                self.enemy_last_actions.pop(0)
            self.enemy_action_counts[enemy_last_action] = (
                self.enemy_action_counts.get(enemy_last_action, 0) + 1
            )

        # Filter available actions by cooldown
        usable_actions = [
            a for a in available_actions
            if a in ACTIONS and self.cooldowns.get(a, 0) <= 0
        ]

        if not usable_actions:
            usable_actions = ['strike']  # Fallback

        # Get game context for PFA
        game_context = {
            'my_hp': my_hp,
            'my_max_hp': my_max_hp,
            'enemy_hp': enemy_hp,
            'enemy_max_hp': enemy_max_hp,
        }

        # Get PFA tendency and action preferences
        tendency = self.pfa.get_tendency(game_context)
        pfa_prefs = self.pfa.get_action_preferences(game_context)

        # Score each action
        action_scores: Dict[str, float] = {}
        for action in usable_actions:
            tactical_score = self._evaluate_action(action, game_context)
            personality_score = pfa_prefs.get(action, 0.1)

            # Blend tactical and personality scores
            combined = (
                (1 - self.personality_weight) * tactical_score +
                self.personality_weight * personality_score
            )
            action_scores[action] = combined

        # Apply skill level (add noise for lower skill)
        if self.skill_level < 1.0:
            noise_factor = (1.0 - self.skill_level) * 0.5
            for action in action_scores:
                noise = random.gauss(0, noise_factor)
                action_scores[action] = max(0, action_scores[action] + noise)

        # Select action (softmax-ish selection for variety)
        selected = self._weighted_select(action_scores)

        # Trigger PFA state transition
        self.pfa._transition()

        # Generate reasoning
        reasoning = self._generate_reasoning(selected, tendency, game_context)

        return {
            'action': selected,
            'confidence': min(1.0, action_scores.get(selected, 0.5)),
            'tendency': tendency,
            'reasoning': reasoning,
            'all_scores': action_scores,
        }

    def _evaluate_action(self, action: str, context: Dict) -> float:
        """
        Evaluate tactical value of an action.

        Returns score between 0 and 1.
        """
        action_data = ACTIONS.get(action, {})
        hp_ratio = context['my_hp'] / max(1, context['my_max_hp'])
        enemy_hp_ratio = context['enemy_hp'] / max(1, context['enemy_max_hp'])

        score = 0.5  # Base score

        # Damage actions
        damage = action_data.get('damage', 0)
        if damage > 0:
            # Value damage more when enemy is low or I'm healthy
            damage_value = damage / 25.0  # Normalize by heavy attack damage

            # Bonus for finishing potential
            if damage >= context['enemy_hp']:
                score += 0.4
            else:
                score += damage_value * 0.3

            # Accuracy consideration
            accuracy = action_data.get('accuracy', 0.8)
            if enemy_hp_ratio < 0.3:
                # Value accuracy more for finishing blows
                score += accuracy * 0.2

            # Penalize risky moves when low HP
            if hp_ratio < 0.3 and accuracy < 0.9:
                score -= 0.2

        # Defensive actions
        defense = action_data.get('defense', 0)
        if defense > 0:
            # Value defense more when low HP
            if hp_ratio < 0.4:
                score += defense * 0.4
            elif hp_ratio < 0.6:
                score += defense * 0.2

            # Value block if enemy likely to attack
            if self._predict_enemy_attack_likely():
                score += 0.15

        # Heal action
        heal = action_data.get('heal', 0)
        if heal > 0:
            hp_missing = context['my_max_hp'] - context['my_hp']
            if hp_missing >= heal * 0.7:  # Don't waste heal
                heal_value = min(heal, hp_missing) / context['my_max_hp']
                score += heal_value * 0.5

                # Extra value if critically low
                if hp_ratio < 0.25:
                    score += 0.2
            else:
                score -= 0.3  # Penalize wasteful healing

        # Consider enemy patterns
        if action == 'guard' or action == 'block':
            # Good counter to heavy/strike patterns
            if 'heavy' in self.enemy_last_actions[-2:] if len(self.enemy_last_actions) >= 2 else []:
                score += 0.15

        return max(0.0, min(1.0, score))

    def _predict_enemy_attack_likely(self) -> bool:
        """Predict if enemy is likely to attack based on patterns."""
        if len(self.enemy_last_actions) < 2:
            return True  # Assume attack by default

        attack_actions = ['strike', 'quick', 'heavy']
        recent = self.enemy_last_actions[-3:]
        attack_count = sum(1 for a in recent if a in attack_actions)

        return attack_count >= len(recent) * 0.5

    def _weighted_select(self, scores: Dict[str, float]) -> str:
        """Select action with probability proportional to score."""
        if not scores:
            return 'strike'

        # Temperature-based selection (higher skill = lower temperature)
        temperature = 0.3 + (1.0 - self.skill_level) * 0.7

        # Softmax-like transformation
        total = sum(max(0.01, s) ** (1 / temperature) for s in scores.values())

        if total <= 0:
            return random.choice(list(scores.keys()))

        r = random.random() * total
        cumulative = 0.0

        for action, score in scores.items():
            cumulative += max(0.01, score) ** (1 / temperature)
            if r <= cumulative:
                return action

        return list(scores.keys())[-1]

    def _generate_reasoning(
        self,
        action: str,
        tendency: str,
        context: Dict
    ) -> str:
        """Generate human-readable reasoning for the action."""
        hp_ratio = context['my_hp'] / max(1, context['my_max_hp'])
        enemy_hp_ratio = context['enemy_hp'] / max(1, context['enemy_max_hp'])

        reasons = []

        # Tendency-based reason
        tendency_reasons = {
            'attack': "feeling aggressive",
            'pressure': "keeping up pressure",
            'retreat': "playing it safe",
            'guard': "being cautious",
            'counter': "waiting to counter",
            'wait': "biding time",
            'neutral': "staying balanced",
            'offensive': "going on offense",
            'defensive': "playing defense",
            'chaos': "being unpredictable",
        }
        if tendency in tendency_reasons:
            reasons.append(tendency_reasons[tendency])

        # HP-based reason
        if hp_ratio < 0.25:
            reasons.append("critically low on HP")
        elif hp_ratio < 0.5:
            reasons.append("need to be careful")

        if enemy_hp_ratio < 0.25:
            reasons.append("enemy is almost down")
        elif enemy_hp_ratio < 0.5:
            reasons.append("enemy is weakening")

        # Action-specific reason
        action_reasons = {
            'strike': "going for solid damage",
            'guard': "defending",
            'quick': "prioritizing speed",
            'block': "full defense",
            'heavy': "going for big damage",
            'heal': "recovering HP",
        }
        if action in action_reasons:
            reasons.append(action_reasons[action])

        if len(reasons) > 2:
            reasons = random.sample(reasons, 2)

        return "; ".join(reasons) if reasons else "making a move"

    def reset(self):
        """Reset bot state for new battle."""
        self.pfa.reset()
        self.my_hp = 100
        self.my_max_hp = 100
        self.enemy_hp = 100
        self.enemy_max_hp = 100
        self.cooldowns = {}
        self.enemy_last_actions = []
        self.turn_count = 0
        self.enemy_action_counts = {}

    def get_stats(self) -> Dict:
        """Get bot statistics."""
        return {
            'playstyle': self.pfa.playstyle,
            'skill_level': self.skill_level,
            'personality_weight': self.personality_weight,
            'turn_count': self.turn_count,
            'pfa_stats': self.pfa.get_stats(),
            'enemy_patterns': self.enemy_action_counts,
        }


def get_battle_bot(
    playstyle: Optional[str] = None,
    skill_level: float = 0.7,
    personality_weight: float = 0.6,
) -> TacticalBattleBot:
    """
    Factory function to create a battle bot.

    Args:
        playstyle: Specific playstyle or None for random
        skill_level: How optimal the bot plays (0-1)
        personality_weight: How much personality affects decisions

    Returns:
        Configured TacticalBattleBot instance
    """
    if playstyle is None:
        playstyle = random.choice(PLAYSTYLES)

    return TacticalBattleBot(
        playstyle=playstyle,
        skill_level=skill_level,
        personality_weight=personality_weight,
    )
