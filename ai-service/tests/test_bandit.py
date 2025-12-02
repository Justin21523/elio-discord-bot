"""
Tests for Thompson Sampling Bandit.
"""
import pytest
import numpy as np

from app.services.bandit import ThompsonSamplingBandit, get_persona_bandit


class TestThompsonSamplingBandit:
    """Test suite for ThompsonSamplingBandit."""

    def test_initialization(self):
        """Test bandit initializes with correct arms."""
        arms = ['strategy_a', 'strategy_b', 'strategy_c']
        bandit = ThompsonSamplingBandit(arms)

        assert len(bandit.arms) == 3
        assert set(bandit.arm_names) == set(arms)

        # Check initial alpha/beta values
        for arm in arms:
            assert bandit.arms[arm]['alpha'] == 1.0
            assert bandit.arms[arm]['beta'] == 1.0

    def test_initialization_custom_prior(self):
        """Test bandit with custom prior values."""
        arms = ['a', 'b']
        bandit = ThompsonSamplingBandit(arms, prior_alpha=2.0, prior_beta=3.0)

        for arm in arms:
            assert bandit.arms[arm]['alpha'] == 2.0
            assert bandit.arms[arm]['beta'] == 3.0

    def test_select_arm_returns_valid_arm(self):
        """Test that select_arm returns a valid arm name."""
        arms = ['x', 'y', 'z']
        bandit = ThompsonSamplingBandit(arms)

        for _ in range(100):
            selected = bandit.select_arm()
            assert selected in arms

    def test_update_positive_reward(self):
        """Test update increases alpha for positive reward."""
        bandit = ThompsonSamplingBandit(['test_arm'])
        initial_alpha = bandit.arms['test_arm']['alpha']
        initial_beta = bandit.arms['test_arm']['beta']

        bandit.update('test_arm', 0.8)  # Positive reward

        assert bandit.arms['test_arm']['alpha'] > initial_alpha
        assert bandit.arms['test_arm']['beta'] == initial_beta

    def test_update_negative_reward(self):
        """Test update increases beta for negative reward."""
        bandit = ThompsonSamplingBandit(['test_arm'])
        initial_alpha = bandit.arms['test_arm']['alpha']
        initial_beta = bandit.arms['test_arm']['beta']

        bandit.update('test_arm', 0.2)  # Negative reward

        assert bandit.arms['test_arm']['alpha'] == initial_alpha
        assert bandit.arms['test_arm']['beta'] > initial_beta

    def test_update_invalid_arm(self):
        """Test update with invalid arm does nothing."""
        bandit = ThompsonSamplingBandit(['valid_arm'])
        bandit.update('invalid_arm', 0.5)  # Should not raise

    def test_get_weight(self):
        """Test get_weight returns valid probability."""
        bandit = ThompsonSamplingBandit(['arm1', 'arm2'])

        weight = bandit.get_weight('arm1')
        assert 0.0 <= weight <= 1.0

    def test_get_all_weights(self):
        """Test get_all_weights returns dict of all weights."""
        arms = ['a', 'b', 'c']
        bandit = ThompsonSamplingBandit(arms)

        weights = bandit.get_all_weights()
        assert set(weights.keys()) == set(arms)
        for w in weights.values():
            assert 0.0 <= w <= 1.0

    def test_reset_single_arm(self):
        """Test resetting a single arm."""
        bandit = ThompsonSamplingBandit(['arm1', 'arm2'])

        # Update arm1
        bandit.update('arm1', 1.0)
        bandit.update('arm1', 1.0)

        # Reset arm1
        bandit.reset('arm1')

        assert bandit.arms['arm1']['alpha'] == 1.0
        assert bandit.arms['arm1']['beta'] == 1.0

    def test_reset_all_arms(self):
        """Test resetting all arms."""
        bandit = ThompsonSamplingBandit(['arm1', 'arm2'])

        bandit.update('arm1', 1.0)
        bandit.update('arm2', 0.0)

        bandit.reset()

        for arm in ['arm1', 'arm2']:
            assert bandit.arms[arm]['alpha'] == 1.0
            assert bandit.arms[arm]['beta'] == 1.0

    def test_get_stats(self):
        """Test get_stats returns expected structure."""
        bandit = ThompsonSamplingBandit(['a', 'b'])
        bandit.update('a', 0.8)

        stats = bandit.get_stats()

        # Stats returns dict keyed by arm names
        assert 'a' in stats
        assert 'b' in stats
        assert 'alpha' in stats['a']
        assert 'beta' in stats['a']
        assert 'weight' in stats['a']

    def test_batch_update(self):
        """Test batch update with multiple rewards."""
        bandit = ThompsonSamplingBandit(['a', 'b', 'c'])

        updates = [
            {'arm': 'a', 'reward': 0.9},
            {'arm': 'b', 'reward': 0.3},
            {'arm': 'a', 'reward': 0.7},
        ]

        bandit.batch_update(updates)

        # arm 'a' should have higher weight than 'b' after positive rewards
        assert bandit.get_weight('a') > bandit.get_weight('b')

    def test_convergence_to_best_arm(self):
        """Test that bandit converges to best arm over time."""
        bandit = ThompsonSamplingBandit(['good', 'bad'])

        # Simulate many trials where 'good' always wins
        for _ in range(100):
            bandit.update('good', 0.9)
            bandit.update('bad', 0.1)

        # 'good' should have much higher weight
        assert bandit.get_weight('good') > 0.7
        assert bandit.get_weight('bad') < 0.3

    def test_to_dict_from_dict(self):
        """Test serialization and deserialization."""
        bandit = ThompsonSamplingBandit(['a', 'b'])
        bandit.update('a', 0.8)
        bandit.update('b', 0.3)

        data = bandit.to_dict()
        restored = ThompsonSamplingBandit.from_dict(data)

        assert restored.arms['a']['alpha'] == bandit.arms['a']['alpha']
        assert restored.arms['b']['beta'] == bandit.arms['b']['beta']


class TestGetPersonaBandit:
    """Test the singleton getter."""

    def test_returns_bandit_instance(self):
        """Test that get_persona_bandit returns a bandit."""
        bandit = get_persona_bandit()
        assert isinstance(bandit, ThompsonSamplingBandit)

    def test_returns_same_instance(self):
        """Test singleton behavior."""
        bandit1 = get_persona_bandit()
        bandit2 = get_persona_bandit()
        assert bandit1 is bandit2

    def test_has_expected_arms(self):
        """Test bandit has expected strategy arms."""
        bandit = get_persona_bandit()
        expected = {'tfidf_markov', 'template_fill', 'ngram_blend', 'retrieval_mod'}
        assert expected.issubset(set(bandit.arm_names))
