"""
LLM-powered relevance scoring for content discovery.

Scores content items on multiple dimensions:
- Topic Relevance (0-100): Is this about Elio (2025 Pixar movie)?
- Content Quality (0-100): Is this substantial and valuable?
- Recency Bonus (0-20): How recent is this content?
- Source Credibility (0-20): How trustworthy is the source?
"""

import asyncio
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta


class RelevanceScorer:
    """LLM-powered content relevance scorer"""

    SCORING_PROMPT_TEMPLATE = """You are a content relevance evaluator for the Pixar movie "Elio" (2025).

TASK: Rate the relevance of the following content item on multiple dimensions.

CONTENT ITEM:
Title: {title}
Description: {snippet}
URL: {url}
Source: {platform}
Published: {published_date}

SCORING DIMENSIONS (0-100 for each):

1. TOPIC RELEVANCE: Is this about the Pixar movie "Elio" (2025)?
   - 100: Directly about Elio movie (trailer, news, reviews, cast, plot, characters)
   - 75: About Elio movie production, behind-the-scenes, director interviews
   - 50: Related to Pixar or similar movies, mentions Elio
   - 25: Vaguely related (space movies, animation in general)
   - 0: Completely unrelated (different Elio, unrelated content)

2. CONTENT QUALITY: Is this substantial and valuable content?
   - 100: In-depth article, official news from Pixar/Disney, high-quality professional art
   - 75: Good discussion, thoughtful review, well-crafted fan content
   - 50: Basic information, simple updates, casual fan art
   - 25: Low-effort post, brief mention, low-quality content
   - 0: Spam, clickbait, or completely uninformative

3. RECENCY BONUS (0-20): How recent is this content?
   - 20: Published today or yesterday (within 24 hours)
   - 15: Published this week (within 7 days)
   - 10: Published this month (within 30 days)
   - 5: Within 3 months
   - 0: Older than 3 months

4. SOURCE CREDIBILITY (0-20): How trustworthy is this source?
   - 20: Official Pixar/Disney, major news outlets (Variety, THR, Deadline)
   - 15: Reputable entertainment sites (IGN, EW, Collider)
   - 10: Popular fan communities (Reddit, established fan sites)
   - 5: User-generated content (DeviantArt, Tumblr, personal blogs)
   - 0: Unknown or suspicious sources

IMPORTANT NOTES:
- The movie "Elio" is about a space-obsessed boy who becomes Earth's ambassador to an intergalactic organization
- Main characters include: Elio, Glordon, Olga, Questa, and other alien species
- Look for keywords: "Elio", "Pixar", "2025", "space", "ambassador", "Communiverse"
- Be strict: only score high if definitely about THIS specific movie

RESPOND ONLY WITH VALID JSON (no markdown, no code blocks):
{{
    "topic_relevance": 0,
    "content_quality": 0,
    "recency_bonus": 0,
    "source_credibility": 0,
    "total_score": 0,
    "reasoning": "brief explanation"
}}"""

    def __init__(self, llm_service=None, temperature: float = 0.2, max_tokens: int = 256):
        """
        Initialize relevance scorer.

        Args:
            llm_service: LLM service instance (will be injected)
            temperature: LLM temperature (lower = more consistent)
            max_tokens: Max tokens for LLM response
        """
        self.llm_service = llm_service
        self.temperature = temperature
        self.max_tokens = max_tokens

    async def score_batch(
        self,
        items: List[Dict[str, Any]],
        query: str,
        batch_size: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Score multiple items in batches to optimize LLM calls.

        Args:
            items: List of content items to score
            query: Original search query (for context)
            batch_size: Number of items to score in parallel

        Returns:
            List of items with added score fields
        """
        scored_items = []

        # Process in batches to avoid overwhelming the LLM
        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            batch_tasks = [self._score_single(item) for item in batch]

            # Run batch in parallel
            batch_scores = await asyncio.gather(*batch_tasks, return_exceptions=True)

            # Merge scores into items
            for item, score_result in zip(batch, batch_scores):
                if isinstance(score_result, Exception):
                    # Handle scoring failure gracefully
                    score_result = self._get_default_score()

                item["relevance_score"] = score_result.get("total_score", 50)
                item["relevance_reasoning"] = score_result.get("reasoning", "")
                item["score_breakdown"] = {
                    "topic": score_result.get("topic_relevance", 25),
                    "quality": score_result.get("content_quality", 25),
                    "recency": score_result.get("recency_bonus", 0),
                    "credibility": score_result.get("source_credibility", 5),
                }
                scored_items.append(item)

        return scored_items

    async def _score_single(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Score a single content item using LLM.

        Args:
            item: Content item to score

        Returns:
            Score data dictionary
        """
        # Build prompt with item data
        prompt = self.SCORING_PROMPT_TEMPLATE.format(
            title=item.get("title", "")[:200],
            snippet=item.get("snippet", "") or item.get("description", "")[:300],
            url=item.get("url", ""),
            platform=item.get("platform", "unknown"),
            published_date=item.get("published_date", "unknown"),
        )

        # Call LLM if available
        if self.llm_service:
            try:
                result = await self.llm_service.generate(
                    prompt=prompt,
                    system="You are a precise content evaluator. Respond only with valid JSON.",
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                )

                response_text = result.get("text", "")

                # Try to parse JSON from response
                score_data = self._parse_json_response(response_text)
                if score_data:
                    # Calculate total score
                    score_data["total_score"] = (
                        score_data.get("topic_relevance", 0)
                        + score_data.get("content_quality", 0)
                        + score_data.get("recency_bonus", 0)
                        + score_data.get("source_credibility", 0)
                    )
                    return score_data

            except Exception as e:
                # Log error but don't fail
                pass

        # Fallback: heuristic scoring if LLM unavailable
        return self._heuristic_score(item)

    def _parse_json_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse JSON from LLM response, handling various formats.

        Args:
            response_text: Raw LLM response

        Returns:
            Parsed JSON dict or None
        """
        try:
            # Try direct JSON parse
            return json.loads(response_text)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        import re

        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find JSON object anywhere in response
        json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        return None

    def _heuristic_score(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fallback heuristic scoring when LLM is unavailable.

        Args:
            item: Content item to score

        Returns:
            Score data dictionary
        """
        title = item.get("title", "").lower()
        snippet = (item.get("snippet", "") or item.get("description", "")).lower()
        platform = item.get("platform", "").lower()

        # Topic relevance - keyword matching
        elio_keywords = ["elio", "pixar", "2025", "space", "ambassador", "communiverse"]
        keyword_matches = sum(1 for kw in elio_keywords if kw in title or kw in snippet)

        if keyword_matches >= 3:
            topic_relevance = 90
        elif keyword_matches >= 2:
            topic_relevance = 70
        elif keyword_matches >= 1:
            topic_relevance = 50
        else:
            topic_relevance = 20

        # Content quality - based on platform and length
        quality_by_platform = {
            "variety.com": 90,
            "hollywoodreporter.com": 90,
            "deadline.com": 90,
            "ew.com": 80,
            "ign.com": 75,
            "youtube": 70,
            "reddit": 60,
            "twitter": 50,
            "deviantart": 60,
            "tumblr": 55,
        }

        content_quality = 50  # Default
        for domain, quality in quality_by_platform.items():
            if domain in platform or domain in item.get("url", "").lower():
                content_quality = quality
                break

        # Recency bonus
        recency_bonus = self._calculate_recency_bonus(item.get("published_date"))

        # Source credibility
        credibility_by_platform = {
            "variety.com": 20,
            "hollywoodreporter.com": 20,
            "deadline.com": 20,
            "ew.com": 15,
            "ign.com": 15,
            "youtube": 10,
            "reddit": 10,
            "twitter": 5,
            "deviantart": 5,
            "tumblr": 5,
        }

        source_credibility = 5  # Default
        for domain, cred in credibility_by_platform.items():
            if domain in platform or domain in item.get("url", "").lower():
                source_credibility = cred
                break

        total_score = topic_relevance + content_quality + recency_bonus + source_credibility

        return {
            "topic_relevance": topic_relevance,
            "content_quality": content_quality,
            "recency_bonus": recency_bonus,
            "source_credibility": source_credibility,
            "total_score": total_score,
            "reasoning": f"Heuristic scoring: {keyword_matches} keyword matches, platform: {platform}",
        }

    def _calculate_recency_bonus(self, published_date: Optional[str]) -> int:
        """
        Calculate recency bonus based on published date.

        Args:
            published_date: ISO format date string

        Returns:
            Recency bonus (0-20)
        """
        if not published_date:
            return 0

        try:
            # Parse ISO date
            pub_date = datetime.fromisoformat(published_date.replace("Z", "+00:00"))
            now = datetime.now(pub_date.tzinfo) if pub_date.tzinfo else datetime.now()

            age = now - pub_date

            if age < timedelta(days=1):
                return 20
            elif age < timedelta(days=7):
                return 15
            elif age < timedelta(days=30):
                return 10
            elif age < timedelta(days=90):
                return 5
            else:
                return 0

        except Exception:
            return 0

    def _get_default_score(self) -> Dict[str, Any]:
        """
        Get default score for error cases.

        Returns:
            Default score dictionary
        """
        return {
            "topic_relevance": 25,
            "content_quality": 25,
            "recency_bonus": 5,
            "source_credibility": 5,
            "total_score": 60,
            "reasoning": "Default score (scoring failed)",
        }
