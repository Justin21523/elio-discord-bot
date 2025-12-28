"""
Test script for art platform clients (DeviantArt and Tumblr)
Run with: python test_art_clients.py
"""

import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import clients
from app.services.art.deviantart_client import DeviantArtClient
from app.services.art.tumblr_client import TumblrClient


async def test_deviantart():
    """Test DeviantArt client"""
    print("\n" + "=" * 60)
    print("Testing DeviantArt Client")
    print("=" * 60)

    client_id = os.getenv("DEVIANTART_CLIENT_ID")
    client_secret = os.getenv("DEVIANTART_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("❌ SKIPPED: DeviantArt credentials not found in .env")
        print("   Add DEVIANTART_CLIENT_ID and DEVIANTART_CLIENT_SECRET to test")
        return False

    try:
        async with DeviantArtClient(client_id, client_secret) as client:
            # Test 1: Authentication
            print("\n[1] Testing authentication...")
            auth_success = await client.authenticate()

            if auth_success:
                print("✅ Authentication successful")
                print(f"   Access token: {client.access_token[:20]}...")
            else:
                print("❌ Authentication failed")
                return False

            # Test 2: Search by tag
            print("\n[2] Testing search by tag...")
            query = "Pixar"
            results = await client.search_by_tag(query, max_results=3)

            print(f"✅ Search completed: {len(results)} results found")

            if results:
                print(f"\n   Sample result:")
                item = results[0]
                print(f"   - Title: {item.get('title', 'N/A')}")
                print(f"   - Artist: {item.get('attribution', {}).get('artist', 'N/A')}")
                print(f"   - License: {item.get('attribution', {}).get('license', 'N/A')}")
                print(f"   - URL: {item.get('url', 'N/A')[:60]}...")
                print(f"   - Platform: {item.get('platform', 'N/A')}")
                print(f"   - Content Type: {item.get('content_type', 'N/A')}")

                # Verify structure
                required_fields = ['title', 'url', 'platform', 'content_type', 'attribution']
                missing_fields = [f for f in required_fields if f not in item]

                if missing_fields:
                    print(f"⚠️  Missing fields: {missing_fields}")
                else:
                    print("✅ Result structure valid")

            print("\n✅ DeviantArt client test PASSED")
            return True

    except Exception as e:
        print(f"\n❌ DeviantArt test FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_tumblr():
    """Test Tumblr client"""
    print("\n" + "=" * 60)
    print("Testing Tumblr Client")
    print("=" * 60)

    api_key = os.getenv("TUMBLR_API_KEY")

    if not api_key:
        print("❌ SKIPPED: Tumblr API key not found in .env")
        print("   Add TUMBLR_API_KEY to test")
        return False

    try:
        async with TumblrClient(api_key) as client:
            # Test 1: Search by tag
            print("\n[1] Testing search by tag...")
            query = "pixar"
            results = await client.search_by_tag(query, max_results=3, filter_nsfw=True)

            print(f"✅ Search completed: {len(results)} results found")

            if results:
                print(f"\n   Sample result:")
                item = results[0]
                print(f"   - Title: {item.get('title', 'N/A')[:50]}...")
                print(f"   - Artist: {item.get('attribution', {}).get('artist', 'N/A')}")
                print(f"   - Platform: {item.get('platform', 'N/A')}")
                print(f"   - Content Type: {item.get('content_type', 'N/A')}")
                print(f"   - URL: {item.get('url', 'N/A')[:60]}...")

                # Check for reblog chain if exists
                reblog_chain = item.get('attribution', {}).get('reblog_chain')
                if reblog_chain:
                    print(f"   - Reblog chain: {len(reblog_chain)} blogs")
                    print(f"     Original: {reblog_chain[0]['blog']}")

                # Verify structure
                required_fields = ['title', 'url', 'platform', 'content_type', 'attribution']
                missing_fields = [f for f in required_fields if f not in item]

                if missing_fields:
                    print(f"⚠️  Missing fields: {missing_fields}")
                else:
                    print("✅ Result structure valid")

            print("\n✅ Tumblr client test PASSED")
            return True

    except Exception as e:
        print(f"\n❌ Tumblr test FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_relevance_scorer():
    """Test relevance scorer (without LLM - heuristic mode)"""
    print("\n" + "=" * 60)
    print("Testing Relevance Scorer (Heuristic Mode)")
    print("=" * 60)

    try:
        from app.services.agent.relevance_scorer import RelevanceScorer

        scorer = RelevanceScorer(llm_service=None)  # No LLM, use heuristics

        # Test items
        test_items = [
            {
                "title": "Elio Official Trailer - Pixar 2025",
                "snippet": "Watch the first official trailer for Pixar's Elio movie coming in 2025",
                "url": "https://variety.com/elio-trailer",
                "platform": "variety.com",
                "published_date": "2024-12-01T00:00:00",
            },
            {
                "title": "Random space movie",
                "snippet": "A different sci-fi space adventure",
                "url": "https://example.com/space-movie",
                "platform": "example.com",
                "published_date": "2023-01-01T00:00:00",
            },
            {
                "title": "Elio fan art by amazing artist",
                "snippet": "Beautiful artwork depicting Elio as Earth's ambassador",
                "url": "https://deviantart.com/elio-art",
                "platform": "deviantart",
                "published_date": "2024-12-07T00:00:00",
            },
        ]

        print("\n[1] Testing batch scoring...")
        scored_items = await scorer.score_batch(test_items, query="Elio Pixar movie 2025")

        print(f"✅ Scored {len(scored_items)} items\n")

        for idx, item in enumerate(scored_items, 1):
            print(f"   Item {idx}: {item['title'][:50]}...")
            print(f"   - Total Score: {item['relevance_score']}")
            breakdown = item.get('score_breakdown', {})
            print(f"   - Topic: {breakdown.get('topic', 0)}")
            print(f"   - Quality: {breakdown.get('quality', 0)}")
            print(f"   - Recency: {breakdown.get('recency', 0)}")
            print(f"   - Credibility: {breakdown.get('credibility', 0)}")
            print(f"   - Reasoning: {item.get('relevance_reasoning', 'N/A')[:80]}...")
            print()

        # Verify scoring logic
        assert scored_items[0]['relevance_score'] > scored_items[1]['relevance_score'], \
            "First item (Elio trailer) should score higher than random space movie"

        print("✅ Relevance scorer test PASSED")
        return True

    except Exception as e:
        print(f"\n❌ Relevance scorer test FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_diversity_ranker():
    """Test diversity ranker"""
    print("\n" + "=" * 60)
    print("Testing Diversity Ranker")
    print("=" * 60)

    try:
        from app.services.agent.diversity_ranker import DiversityRanker

        ranker = DiversityRanker()

        # Test items with various platforms
        test_items = [
            {
                "title": "Item 1", "url": "https://variety.com/1",
                "platform": "variety.com", "content_type": "news",
                "relevance_score": 95
            },
            {
                "title": "Item 2", "url": "https://variety.com/2",
                "platform": "variety.com", "content_type": "news",
                "relevance_score": 90
            },
            {
                "title": "Item 3", "url": "https://youtube.com/1",
                "platform": "youtube", "content_type": "video",
                "relevance_score": 85
            },
            {
                "title": "Item 4", "url": "https://deviantart.com/1",
                "platform": "deviantart", "content_type": "art",
                "relevance_score": 80
            },
            {
                "title": "Item 5", "url": "https://reddit.com/1",
                "platform": "reddit", "content_type": "discussion",
                "relevance_score": 75
            },
        ]

        print("\n[1] Testing diversity ranking...")
        ranked_items = ranker.rank(
            test_items,
            desired_content_types=['news', 'video', 'discussion', 'art']
        )

        print(f"✅ Ranked {len(ranked_items)} items\n")

        for idx, item in enumerate(ranked_items, 1):
            print(f"   {idx}. {item['title']}")
            print(f"      - Original Score: {item['relevance_score']}")
            print(f"      - Adjusted Score: {item.get('adjusted_score', 0):.2f}")
            print(f"      - Platform: {item['platform']}")
            print(f"      - Type: {item['content_type']}")

            adjustments = item.get('diversity_adjustments', {})
            if adjustments:
                print(f"      - Adjustments: platform={adjustments.get('platform', 0):.1f}, "
                      f"domain={adjustments.get('domain', 0):.1f}, "
                      f"content_type={adjustments.get('content_type', 0):.1f}")
            print()

        # Test 2: Calculate diversity score
        print("[2] Testing diversity calculation...")
        diversity_score = ranker.calculate_diversity(ranked_items)
        print(f"✅ Diversity score: {diversity_score:.2f}/100")

        assert diversity_score > 0, "Diversity score should be positive"

        print("\n✅ Diversity ranker test PASSED")
        return True

    except Exception as e:
        print(f"\n❌ Diversity ranker test FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_content_discovery():
    """Test content discovery orchestrator (integration test)"""
    print("\n" + "=" * 60)
    print("Testing Content Discovery Orchestrator")
    print("=" * 60)

    try:
        from app.services.agent.content_discovery import ContentDiscoveryOrchestrator

        # Mock web search function
        async def mock_web_search(query, max_results, domains=None, recency_days=None):
            """Mock web search results"""
            return [
                {
                    "title": f"Mock news about {query}",
                    "url": "https://variety.com/mock",
                    "snippet": f"This is a mock news article about {query}",
                    "domain": "variety.com",
                }
            ]

        # Create orchestrator (without actual API clients for now)
        orchestrator = ContentDiscoveryOrchestrator(
            deviantart_client=None,
            tumblr_client=None,
            web_search_func=mock_web_search,
            llm_service=None
        )

        print("\n[1] Testing discovery with mock data...")
        result = await orchestrator.discover(
            query="Elio Pixar movie",
            platforms=["news"],  # Only test news for now
            max_results=5
        )

        print(f"✅ Discovery completed")
        print(f"   - Query: {result['query']}")
        print(f"   - Total results: {result['total_results']}")
        print(f"   - Diversity score: {result['diversity_score']}")
        print(f"   - Platforms covered: {result['platforms_covered']}")

        if result['results']:
            print(f"\n   Sample result:")
            item = result['results'][0]
            print(f"   - Title: {item.get('title', 'N/A')}")
            print(f"   - Relevance Score: {item.get('relevance_score', 0)}")
            print(f"   - Platform: {item.get('platform', 'N/A')}")

        print("\n✅ Content discovery test PASSED")
        return True

    except Exception as e:
        print(f"\n❌ Content discovery test FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("🧪 ART PLATFORM INTEGRATION TEST SUITE")
    print("=" * 60)

    results = {}

    # Run tests
    results['deviantart'] = await test_deviantart()
    results['tumblr'] = await test_tumblr()
    results['relevance_scorer'] = await test_relevance_scorer()
    results['diversity_ranker'] = await test_diversity_ranker()
    results['content_discovery'] = await test_content_discovery()

    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED/SKIPPED"
        print(f"   {test_name:.<40} {status}")

    print(f"\n   Total: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests PASSED!")
    elif passed > 0:
        print(f"\n⚠️  Some tests failed or were skipped")
    else:
        print(f"\n❌ All tests failed or were skipped")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
