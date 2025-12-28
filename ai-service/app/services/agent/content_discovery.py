"""
Content Discovery Orchestrator

Main orchestration logic for multi-platform content discovery.
Coordinates search, scoring, and ranking across all platforms.
"""

import asyncio
from typing import List, Dict, Any, Optional
from .relevance_scorer import RelevanceScorer
from .diversity_ranker import DiversityRanker


class ContentDiscoveryOrchestrator:
    """Orchestrate content discovery across multiple platforms"""

    def __init__(
        self,
        deviantart_client=None,
        tumblr_client=None,
        web_search_func=None,
        llm_service=None,
    ):
        """
        Initialize orchestrator with platform clients.

        Args:
            deviantart_client: DeviantArt API client
            tumblr_client: Tumblr API client
            web_search_func: Web search function (for news, YouTube, Reddit, Twitter)
            llm_service: LLM service for relevance scoring
        """
        self.deviantart = deviantart_client
        self.tumblr = tumblr_client
        self.web_search = web_search_func

        # Initialize scorer and ranker
        self.scorer = RelevanceScorer(llm_service=llm_service)
        self.ranker = DiversityRanker()

    async def discover(
        self,
        query: str,
        platforms: List[str] = None,
        max_results: int = 20,
        content_types: List[str] = None,
    ) -> Dict[str, Any]:
        """
        Main orchestration method for content discovery.

        Executes multi-stage pipeline:
        1. Stage 1: Multi-source aggregation (parallel)
        2. Stage 2: LLM-powered relevance scoring (batch)
        3. Stage 3: Diversity-aware ranking

        Args:
            query: Search query
            platforms: List of platforms to search (default: all)
            max_results: Maximum total results to return
            content_types: Desired content types (default: ['news', 'video', 'discussion', 'art'])

        Returns:
            Discovery results with scored and ranked items
        """
        if platforms is None:
            platforms = ["news", "youtube", "reddit", "twitter", "deviantart", "tumblr"]

        if content_types is None:
            content_types = ["news", "video", "discussion", "art"]

        # Stage 1: Parallel Multi-Source Aggregation
        raw_results = await self._aggregate_sources(query, platforms, max_results * 2)

        if not raw_results:
            return {
                "query": query,
                "results": [],
                "total_results": 0,
                "diversity_score": 0.0,
                "platforms_covered": [],
            }

        # Stage 2: LLM-Powered Relevance Scoring
        scored_results = await self.scorer.score_batch(raw_results, query)

        # Stage 3: Content Diversity & Ranking
        final_results = self.ranker.rank(scored_results, content_types)

        # Calculate diversity score
        diversity_score = self.ranker.calculate_diversity(final_results)

        # Get platforms that returned results
        platforms_covered = list(set(r.get("platform", "") for r in final_results))

        return {
            "query": query,
            "results": final_results[:max_results],
            "total_results": len(final_results),
            "diversity_score": diversity_score,
            "platforms_covered": platforms_covered,
        }

    async def _aggregate_sources(
        self,
        query: str,
        platforms: List[str],
        max_per_platform: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Stage 1: Aggregate results from all enabled platforms in parallel.

        Args:
            query: Search query
            platforms: List of platforms to search
            max_per_platform: Maximum results per platform

        Returns:
            Combined list of results from all platforms
        """
        tasks = []

        # Queue up all platform searches
        if "news" in platforms:
            tasks.append(self._search_news(query, max_per_platform))

        if "youtube" in platforms:
            tasks.append(self._search_youtube(query, max_per_platform))

        if "reddit" in platforms:
            tasks.append(self._search_reddit(query, max_per_platform))

        if "twitter" in platforms:
            tasks.append(self._search_twitter(query, max_per_platform))

        if "deviantart" in platforms and self.deviantart:
            tasks.append(self._search_deviantart(query, max_per_platform))

        if "tumblr" in platforms and self.tumblr:
            tasks.append(self._search_tumblr(query, max_per_platform))

        # Execute all searches in parallel
        results_by_platform = await asyncio.gather(*tasks, return_exceptions=True)

        # Flatten and deduplicate
        all_results = []
        seen_urls = set()

        for platform_results in results_by_platform:
            if isinstance(platform_results, Exception):
                # Log error but continue with other platforms
                continue

            if isinstance(platform_results, list):
                for item in platform_results:
                    url = item.get("url", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        all_results.append(item)

        return all_results

    async def _search_news(self, query: str, max_results: int) -> List[Dict]:
        """Search news sites using Brave API"""
        if not self.web_search:
            return []

        try:
            results = await self.web_search(
                query=query,
                max_results=max_results,
                domains=[
                    "variety.com",
                    "hollywoodreporter.com",
                    "deadline.com",
                    "ew.com",
                    "ign.com",
                ],
                recency_days=7,
            )

            # Normalize to common schema
            return [self._normalize_web_result(r, "news") for r in results]

        except Exception:
            return []

    async def _search_youtube(self, query: str, max_results: int) -> List[Dict]:
        """Search YouTube using Brave API"""
        if not self.web_search:
            return []

        try:
            results = await self.web_search(
                query=query, max_results=max_results, domains=["youtube.com"], recency_days=30
            )

            return [self._normalize_web_result(r, "video") for r in results]

        except Exception:
            return []

    async def _search_reddit(self, query: str, max_results: int) -> List[Dict]:
        """Search Reddit using Brave API"""
        if not self.web_search:
            return []

        try:
            results = await self.web_search(
                query=query, max_results=max_results, domains=["reddit.com"], recency_days=7
            )

            return [self._normalize_web_result(r, "discussion") for r in results]

        except Exception:
            return []

    async def _search_twitter(self, query: str, max_results: int) -> List[Dict]:
        """Search Twitter/X using Brave API"""
        if not self.web_search:
            return []

        try:
            results = await self.web_search(
                query=query,
                max_results=max_results,
                domains=["twitter.com", "x.com"],
                recency_days=3,
            )

            return [self._normalize_web_result(r, "discussion") for r in results]

        except Exception:
            return []

    async def _search_deviantart(self, query: str, max_results: int) -> List[Dict]:
        """Search DeviantArt for fan art"""
        if not self.deviantart:
            return []

        try:
            results = await self.deviantart.search_by_tag(
                query=query, max_results=max_results, mature_content=False
            )

            # Results already normalized by DeviantArt client
            return results

        except Exception:
            return []

    async def _search_tumblr(self, query: str, max_results: int) -> List[Dict]:
        """Search Tumblr for posts"""
        if not self.tumblr:
            return []

        try:
            results = await self.tumblr.search_by_tag(
                query=query, max_results=max_results, filter_nsfw=True
            )

            # Results already normalized by Tumblr client
            return results

        except Exception:
            return []

    def _normalize_web_result(self, result: Dict, content_type: str) -> Dict[str, Any]:
        """
        Normalize Brave API results to common schema.

        Args:
            result: Raw result from Brave API
            content_type: Content type (news, video, discussion)

        Returns:
            Normalized result dictionary
        """
        return {
            "title": result.get("title", ""),
            "url": result.get("url", ""),
            "snippet": result.get("snippet", "") or result.get("description", ""),
            "platform": result.get("domain", "unknown"),
            "content_type": content_type,
            "published_date": result.get("published_date"),
            "description": result.get("snippet", ""),
            # No attribution for web results (not art)
            "attribution": None,
        }
