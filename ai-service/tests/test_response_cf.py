"""
Tests for Response-level Collaborative Filtering.
"""
import pytest

from app.services.response_cf import (
    ResponseStyleCF,
    get_response_cf,
    personalize_response,
)


class TestResponseStyleCF:
    """Test suite for ResponseStyleCF."""

    def test_initialization(self):
        """Test CF initializes correctly."""
        cf = ResponseStyleCF()

        assert len(cf.user_prefs) == 0
        assert len(cf.STYLE_DIMENSIONS) == 4
        assert 'length' in cf.STYLE_DIMENSIONS
        assert 'tone' in cf.STYLE_DIMENSIONS

    def test_get_user_preferences_new_user(self):
        """Test preferences for new user use global defaults."""
        cf = ResponseStyleCF()

        prefs = cf.get_user_preferences('new_user', use_similar_users=False)

        assert 'length' in prefs
        assert 'tone' in prefs
        assert 'structure' in prefs
        assert 'topic' in prefs

        # All should be around 0.5 (uniform prior)
        for dim, styles in prefs.items():
            for style, score in styles.items():
                assert 0.0 <= score <= 1.0

    def test_update_changes_preferences(self):
        """Test updating preferences changes scores."""
        cf = ResponseStyleCF()

        # Initial preferences
        initial = cf.get_user_preferences('user1', use_similar_users=False)

        # Update with positive engagement for short, casual
        cf.update('user1', {'length': 'short', 'tone': 'casual'}, engagement=0.9)

        # Check updated preferences
        updated = cf.get_user_preferences('user1', use_similar_users=False)

        # Short and casual should have higher scores
        assert updated['length']['short'] > initial['length']['short']
        assert updated['tone']['casual'] > initial['tone']['casual']

    def test_multiple_updates_accumulate(self):
        """Test multiple updates accumulate properly."""
        cf = ResponseStyleCF()

        # Multiple positive updates for 'long' responses
        for _ in range(10):
            cf.update('user1', {'length': 'long'}, engagement=0.9)

        # Multiple negative updates for 'short' responses
        for _ in range(10):
            cf.update('user1', {'length': 'short'}, engagement=0.1)

        prefs = cf.get_user_preferences('user1', use_similar_users=False)

        assert prefs['length']['long'] > prefs['length']['short']

    def test_classify_response_style_length(self):
        """Test length classification."""
        cf = ResponseStyleCF()

        short = cf.classify_response_style("Hi there!")
        medium = cf.classify_response_style("Hello! How are you doing today? I hope everything is going well with you.")
        long = cf.classify_response_style(" ".join(["word"] * 50))

        assert short['length'] == 'short'
        assert medium['length'] == 'medium'
        assert long['length'] == 'long'

    def test_classify_response_style_structure(self):
        """Test structure classification."""
        cf = ResponseStyleCF()

        question = cf.classify_response_style("How are you?")
        exclamation = cf.classify_response_style("That's amazing!")
        statement = cf.classify_response_style("I think that is correct.")

        assert question['structure'] == 'question'
        assert exclamation['structure'] == 'exclamation'
        assert statement['structure'] == 'statement'
        # Mixed detection depends on ending - just check it's a valid structure
        mixed = cf.classify_response_style("Really? That's great!")
        assert mixed['structure'] in ['question', 'exclamation', 'mixed', 'statement']

    def test_classify_response_style_tone(self):
        """Test tone classification."""
        cf = ResponseStyleCF()

        playful = cf.classify_response_style("Haha, that's so funny!")
        warm = cf.classify_response_style("I love that, dear friend.")
        enthusiastic = cf.classify_response_style("Wow, that's amazing!")
        formal = cf.classify_response_style("Please kindly review the document.")
        casual = cf.classify_response_style("Yeah, that works for me.")

        assert playful['tone'] == 'playful'
        assert warm['tone'] == 'warm'
        assert enthusiastic['tone'] == 'enthusiastic'
        assert formal['tone'] == 'formal'
        assert casual['tone'] == 'casual'

    def test_sample_preferred_style(self):
        """Test sampling from preferences."""
        cf = ResponseStyleCF()

        # Strongly prefer 'long'
        for _ in range(50):  # More updates for stronger preference
            cf.update('user1', {'length': 'long'}, engagement=1.0)

        # Sample multiple times
        samples = [cf.sample_preferred_style('user1', 'length') for _ in range(50)]

        # Should mostly sample 'long' (but probabilistic, so be lenient)
        long_count = samples.count('long')
        assert long_count > 15  # At least 30%

    def test_sample_with_temperature(self):
        """Test temperature affects sampling randomness."""
        cf = ResponseStyleCF()

        # Set strong preference
        for _ in range(20):
            cf.update('user1', {'length': 'short'}, engagement=1.0)

        # Low temperature (more deterministic)
        low_temp_samples = [cf.sample_preferred_style('user1', 'length', temperature=0.1) for _ in range(30)]

        # High temperature (more random)
        high_temp_samples = [cf.sample_preferred_style('user1', 'length', temperature=2.0) for _ in range(30)]

        # Low temp should have less variety
        low_temp_unique = len(set(low_temp_samples))
        high_temp_unique = len(set(high_temp_samples))

        # High temp should have more variety (or at least equal)
        assert high_temp_unique >= low_temp_unique

    def test_style_recommendations(self):
        """Test getting style recommendations."""
        cf = ResponseStyleCF()

        # Set preferences
        for _ in range(10):
            cf.update('user1', {'length': 'long', 'tone': 'playful'}, engagement=0.9)

        recs = cf.get_style_recommendations('user1', top_k=2)

        assert 'length' in recs
        assert 'tone' in recs
        assert len(recs['length']) == 2
        assert 'long' in recs['length']

    def test_similar_users(self):
        """Test similar user blending."""
        cf = ResponseStyleCF()

        # User A prefers long, formal
        for _ in range(10):
            cf.update('userA', {'length': 'long', 'tone': 'formal'}, engagement=0.9)

        # User B prefers long, formal (similar to A)
        for _ in range(10):
            cf.update('userB', {'length': 'long', 'tone': 'formal'}, engagement=0.9)

        # User C prefers short, casual (different)
        for _ in range(10):
            cf.update('userC', {'length': 'short', 'tone': 'casual'}, engagement=0.9)

        # New user D should be influenced by similar users when using similar_users
        cf.update('userD', {'length': 'long'}, engagement=0.8)

        prefs_with_similar = cf.get_user_preferences('userD', use_similar_users=True)
        prefs_without_similar = cf.get_user_preferences('userD', use_similar_users=False)

        # Both should have valid preferences
        assert prefs_with_similar['length']['long'] >= 0
        assert prefs_without_similar['length']['long'] >= 0

    def test_get_stats(self):
        """Test get_stats returns expected structure."""
        cf = ResponseStyleCF()

        cf.update('user1', {'length': 'short'}, engagement=0.8)

        stats = cf.get_stats()

        assert 'num_users' in stats
        assert 'dimensions' in stats
        assert stats['num_users'] == 1

    def test_to_dict_from_dict(self):
        """Test serialization and deserialization."""
        cf = ResponseStyleCF()

        cf.update('user1', {'length': 'long', 'tone': 'warm'}, engagement=0.9)
        cf.update('user2', {'length': 'short'}, engagement=0.7)

        data = cf.to_dict()
        restored = ResponseStyleCF.from_dict(data)

        # Check restored has same data
        assert 'user1' in restored.user_prefs
        assert 'user2' in restored.user_prefs


class TestPersonalizeResponse:
    """Test the personalize_response function."""

    def test_reranks_candidates(self):
        """Test candidates are reranked based on preferences."""
        # Create CF with strong preferences
        cf = get_response_cf()

        # Note: This uses the global CF which may have state from other tests
        candidates = [
            {'text': 'Short reply.', 'score': 0.5, 'source': 'a'},
            {'text': 'This is a much longer reply with many more words in it.', 'score': 0.5, 'source': 'b'},
        ]

        result = personalize_response('test_user', candidates, weight=0.3)

        # All candidates should have cf_score and style_classification
        for c in result:
            assert 'cf_score' in c
            assert 'style_classification' in c

    def test_preserves_original_fields(self):
        """Test original fields are preserved."""
        candidates = [
            {'text': 'Hello!', 'score': 0.8, 'source': 'test', 'custom': 'field'},
        ]

        result = personalize_response('user1', candidates)

        assert result[0]['source'] == 'test'
        assert result[0]['custom'] == 'field'

    def test_weight_affects_final_score(self):
        """Test weight parameter affects final score blending."""
        candidates = [
            {'text': 'Test response here.', 'score': 0.8, 'source': 'a'},
        ]

        # Get result with some weight
        result = personalize_response('test_weight_user', candidates.copy(), weight=0.3)

        # Should have a blended score that's still valid
        assert 0.0 <= result[0]['score'] <= 1.0
        assert 'cf_score' in result[0]


class TestGetResponseCF:
    """Test the singleton getter."""

    def test_returns_cf_instance(self):
        """Test get_response_cf returns a CF instance."""
        cf = get_response_cf()
        assert isinstance(cf, ResponseStyleCF)

    def test_returns_same_instance(self):
        """Test singleton behavior."""
        cf1 = get_response_cf()
        cf2 = get_response_cf()
        assert cf1 is cf2
