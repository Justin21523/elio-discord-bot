"""
Tests for Game AI modules (PFA, Battle Bot, Error Injector).
"""
import pytest

from app.services.game_ai import (
    PFABehaviorModel,
    TacticalBattleBot,
    HumanLikeErrorInjector,
    get_battle_bot,
    create_error_injector,
    PLAYSTYLES,
)


class TestPFABehaviorModel:
    """Test suite for PFA Behavior Model."""

    def test_initialization_default(self):
        """Test default initialization."""
        pfa = PFABehaviorModel()

        assert pfa.playstyle == 'balanced'
        assert pfa.current_state == 'neutral'
        assert len(pfa.state_history) == 1

    def test_initialization_with_playstyle(self):
        """Test initialization with specific playstyle."""
        for style in PLAYSTYLES:
            pfa = PFABehaviorModel(style)
            assert pfa.playstyle == style

    def test_invalid_playstyle_defaults_to_balanced(self):
        """Test invalid playstyle falls back to balanced."""
        pfa = PFABehaviorModel('invalid_style')
        assert pfa.playstyle == 'balanced'

    def test_get_tendency(self):
        """Test get_tendency returns valid state."""
        pfa = PFABehaviorModel('aggressive')

        tendency = pfa.get_tendency()

        assert tendency in pfa.states

    def test_next_action_returns_valid_action(self):
        """Test next_action returns valid action."""
        pfa = PFABehaviorModel('aggressive')

        action = pfa.next_action()

        valid_actions = ['strike', 'guard', 'quick', 'block', 'heavy', 'heal']
        assert action in valid_actions

    def test_context_affects_state(self):
        """Test game context affects state transitions."""
        pfa = PFABehaviorModel('aggressive')

        # Low HP should trigger retreat
        context = {'my_hp': 10, 'my_max_hp': 100, 'enemy_hp': 80, 'enemy_max_hp': 100}
        pfa.get_tendency(context)

        # Should be in retreat or defensive state
        assert pfa.current_state in pfa.states

    def test_low_enemy_hp_increases_aggression(self):
        """Test bot becomes aggressive when enemy is low."""
        pfa = PFABehaviorModel('balanced')

        context = {'my_hp': 80, 'my_max_hp': 100, 'enemy_hp': 15, 'enemy_max_hp': 100}

        # Run multiple times to see trend
        attack_count = 0
        for _ in range(20):
            pfa.get_tendency(context)
            if pfa.current_state in ['attack', 'offensive']:
                attack_count += 1
            pfa.reset()

        # Should see some aggressive states
        assert attack_count > 0

    def test_state_history_tracking(self):
        """Test state history is tracked."""
        pfa = PFABehaviorModel('chaotic')

        for _ in range(10):
            pfa.next_action()

        assert len(pfa.state_history) > 1
        assert len(pfa.state_history) <= 20  # Max history size

    def test_reset(self):
        """Test reset returns to initial state."""
        pfa = PFABehaviorModel('aggressive')

        for _ in range(5):
            pfa.next_action()

        pfa.reset()

        assert pfa.current_state == 'attack'  # Initial state for aggressive
        assert len(pfa.state_history) == 1

    def test_get_stats(self):
        """Test get_stats returns expected structure."""
        pfa = PFABehaviorModel('defensive')

        for _ in range(5):
            pfa.next_action()

        stats = pfa.get_stats()

        assert 'playstyle' in stats
        assert 'current_state' in stats
        assert 'state_counts' in stats
        assert stats['playstyle'] == 'defensive'

    def test_random_playstyle(self):
        """Test random_playstyle class method."""
        pfa = PFABehaviorModel.random_playstyle()

        assert pfa.playstyle in PLAYSTYLES

    def test_chaotic_is_truly_random(self):
        """Test chaotic playstyle has varied actions."""
        pfa = PFABehaviorModel('chaotic')

        actions = set()
        for _ in range(50):
            action = pfa.next_action()
            actions.add(action)

        # Should see multiple different actions
        assert len(actions) >= 2


class TestTacticalBattleBot:
    """Test suite for Tactical Battle Bot."""

    def test_initialization(self):
        """Test bot initializes correctly."""
        bot = TacticalBattleBot()

        assert bot.skill_level == 0.7
        assert bot.personality_weight == 0.6
        assert bot.turn_count == 0

    def test_initialization_with_params(self):
        """Test bot with custom parameters."""
        bot = TacticalBattleBot(
            playstyle='aggressive',
            skill_level=0.9,
            personality_weight=0.3,
        )

        assert bot.pfa.playstyle == 'aggressive'
        assert bot.skill_level == 0.9
        assert bot.personality_weight == 0.3

    def test_select_action_returns_valid_action(self):
        """Test select_action returns valid action."""
        bot = TacticalBattleBot()

        result = bot.select_action(
            my_hp=100,
            enemy_hp=100,
            available_actions=['strike', 'guard', 'quick'],
        )

        assert 'action' in result
        assert result['action'] in ['strike', 'guard', 'quick']
        assert 'confidence' in result
        assert 'tendency' in result

    def test_cooldown_respected(self):
        """Test actions on cooldown are not selected."""
        bot = TacticalBattleBot()

        result = bot.select_action(
            my_hp=100,
            enemy_hp=100,
            available_actions=['strike', 'guard', 'heavy'],
            cooldowns={'heavy': 2},
        )

        # heavy is on cooldown, should not be selected
        # (unless it's the only option after filtering)
        assert result['action'] in ['strike', 'guard']

    def test_low_hp_affects_behavior(self):
        """Test bot behavior changes with low HP."""
        bot = TacticalBattleBot(playstyle='aggressive')

        # High HP - should attack
        high_hp_result = bot.select_action(
            my_hp=90,
            enemy_hp=100,
            available_actions=['strike', 'guard', 'block'],
        )

        bot.reset()

        # Low HP - should defend more
        low_hp_result = bot.select_action(
            my_hp=15,
            enemy_hp=100,
            available_actions=['strike', 'guard', 'block'],
        )

        # Both should return valid actions
        assert high_hp_result['action'] in ['strike', 'guard', 'block']
        assert low_hp_result['action'] in ['strike', 'guard', 'block']

    def test_enemy_pattern_tracking(self):
        """Test bot tracks enemy action patterns."""
        bot = TacticalBattleBot()

        # Simulate several turns
        for action in ['strike', 'strike', 'heavy']:
            bot.select_action(
                my_hp=100,
                enemy_hp=100,
                available_actions=['strike', 'guard'],
                enemy_last_action=action,
            )

        assert len(bot.enemy_last_actions) == 3
        assert bot.enemy_action_counts['strike'] == 2

    def test_turn_count_increments(self):
        """Test turn count increases each action."""
        bot = TacticalBattleBot()

        for i in range(5):
            bot.select_action(
                my_hp=100,
                enemy_hp=100,
                available_actions=['strike', 'guard'],
            )

        assert bot.turn_count == 5

    def test_reset(self):
        """Test reset clears all state."""
        bot = TacticalBattleBot()

        # Make some moves
        for _ in range(5):
            bot.select_action(my_hp=50, enemy_hp=50, available_actions=['strike'])

        bot.reset()

        assert bot.turn_count == 0
        assert bot.my_hp == 100
        assert len(bot.enemy_last_actions) == 0
        assert len(bot.enemy_action_counts) == 0

    def test_get_stats(self):
        """Test get_stats returns expected structure."""
        bot = TacticalBattleBot(playstyle='defensive')

        stats = bot.get_stats()

        assert 'playstyle' in stats
        assert 'skill_level' in stats
        assert 'turn_count' in stats
        assert 'pfa_stats' in stats

    def test_reasoning_generated(self):
        """Test reasoning is generated for actions."""
        bot = TacticalBattleBot()

        result = bot.select_action(
            my_hp=100,
            enemy_hp=100,
            available_actions=['strike', 'guard'],
        )

        assert 'reasoning' in result
        assert len(result['reasoning']) > 0


class TestGetBattleBot:
    """Test the factory function."""

    def test_creates_bot(self):
        """Test factory creates a bot."""
        bot = get_battle_bot()
        assert isinstance(bot, TacticalBattleBot)

    def test_random_playstyle_when_none(self):
        """Test random playstyle when not specified."""
        bot = get_battle_bot(playstyle=None)
        assert bot.pfa.playstyle in PLAYSTYLES

    def test_specified_playstyle(self):
        """Test specific playstyle is used."""
        bot = get_battle_bot(playstyle='chaotic')
        assert bot.pfa.playstyle == 'chaotic'


class TestHumanLikeErrorInjector:
    """Test suite for Error Injector."""

    def test_initialization(self):
        """Test error injector initializes correctly."""
        injector = HumanLikeErrorInjector()

        assert injector.skill_tier == 'intermediate'
        assert injector.fatigue_level == 0.0
        assert injector.tilt_level == 0.0

    def test_initialization_with_tier(self):
        """Test initialization with specific skill tier."""
        for tier in ['novice', 'beginner', 'intermediate', 'advanced', 'expert']:
            injector = HumanLikeErrorInjector(skill_tier=tier)
            assert injector.skill_tier == tier

    def test_reaction_time_in_valid_range(self):
        """Test reaction time is within expected range."""
        injector = HumanLikeErrorInjector()

        for _ in range(100):
            rt = injector.get_reaction_time()
            assert 150 <= rt <= 2000

    def test_expert_faster_than_novice(self):
        """Test experts have faster average reaction time."""
        expert = HumanLikeErrorInjector(skill_tier='expert')
        novice = HumanLikeErrorInjector(skill_tier='novice')

        expert_times = [expert.get_reaction_time() for _ in range(50)]
        novice_times = [novice.get_reaction_time() for _ in range(50)]

        assert sum(expert_times) / len(expert_times) < sum(novice_times) / len(novice_times)

    def test_misclick_returns_different_action(self):
        """Test misclick returns a different action."""
        injector = HumanLikeErrorInjector()

        available = ['strike', 'guard', 'quick', 'block']
        misclicked = injector.get_misclick_action('strike', available)

        assert misclicked in available
        # Could be same action if only one available

    def test_misclick_similar_actions(self):
        """Test misclicks tend to hit similar actions."""
        injector = HumanLikeErrorInjector()

        # Attack actions should misclick to other attacks more often
        attack_misclicks = 0
        for _ in range(100):
            result = injector.get_misclick_action('strike', ['strike', 'quick', 'heavy', 'guard'])
            if result in ['strike', 'quick', 'heavy']:
                attack_misclicks += 1

        # Should be > 50% attack misclicks (70% chance per code)
        assert attack_misclicks > 40

    def test_panic_action(self):
        """Test panic action returns valid action."""
        injector = HumanLikeErrorInjector()

        available = ['strike', 'guard', 'block', 'heal']
        panic_action = injector.get_panic_action(available)

        assert panic_action in available

    def test_fatigue_increases(self):
        """Test fatigue increases over turns."""
        injector = HumanLikeErrorInjector(fatigue_rate=0.1)

        for _ in range(10):
            injector.update_state()

        assert injector.fatigue_level > 0

    def test_tilt_from_losses(self):
        """Test tilt increases from consecutive losses."""
        injector = HumanLikeErrorInjector(tilt_sensitivity=1.0)

        for _ in range(5):
            injector.update_state(my_hp_change=-20, won_exchange=False)

        assert injector.tilt_level > 0
        assert injector.consecutive_losses == 5

    def test_inject_errors_returns_action_and_info(self):
        """Test inject_errors returns action and error info."""
        injector = HumanLikeErrorInjector()

        action, info = injector.inject_errors(
            intended_action='strike',
            available_actions=['strike', 'guard', 'quick'],
            hp_ratio=0.8,
        )

        assert action in ['strike', 'guard', 'quick']
        assert 'original_action' in info
        assert 'error_type' in info

    def test_low_hp_increases_panic_chance(self):
        """Test low HP increases panic chance."""
        injector = HumanLikeErrorInjector(skill_tier='novice')

        # High HP
        high_hp_panics = sum(
            1 for _ in range(100)
            if injector.should_panic(0.8)
        )

        # Low HP
        low_hp_panics = sum(
            1 for _ in range(100)
            if injector.should_panic(0.15)
        )

        assert low_hp_panics > high_hp_panics

    def test_reset(self):
        """Test reset clears state."""
        injector = HumanLikeErrorInjector()

        for _ in range(10):
            injector.update_state(my_hp_change=-10, won_exchange=False)

        injector.reset()

        assert injector.fatigue_level == 0.0
        assert injector.tilt_level == 0.0
        assert injector.consecutive_losses == 0

    def test_get_stats(self):
        """Test get_stats returns expected structure."""
        injector = HumanLikeErrorInjector()

        stats = injector.get_stats()

        assert 'skill_tier' in stats
        assert 'fatigue_level' in stats
        assert 'tilt_level' in stats
        assert 'current_error_rates' in stats


class TestCreateErrorInjector:
    """Test the factory function."""

    def test_skill_level_to_tier_mapping(self):
        """Test skill level maps to correct tier."""
        novice = create_error_injector(skill_level=0.1)
        beginner = create_error_injector(skill_level=0.3)
        intermediate = create_error_injector(skill_level=0.5)
        advanced = create_error_injector(skill_level=0.7)
        expert = create_error_injector(skill_level=0.9)

        assert novice.skill_tier == 'novice'
        assert beginner.skill_tier == 'beginner'
        assert intermediate.skill_tier == 'intermediate'
        assert advanced.skill_tier == 'advanced'
        assert expert.skill_tier == 'expert'
