"""
Diversity-aware content ranking.

Ensures content mix across platforms and types to avoid over-representation
of any single source.
"""

import math
from typing import List, Dict, Any
from collections import Counter
from urllib.parse import urlparse


class DiversityRanker:
    """Ensure content diversity across platforms and content types"""

    def rank(
        self,
        items: List[Dict[str, Any]],
        desired_content_types: List[str],
        diversity_weight: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Apply diversity-aware ranking to content items.

        Algorithm:
        1. Sort by relevance_score (descending)
        2. Apply diversity bonus for underrepresented platforms
        3. Penalize duplicate domains
        4. Re-sort by adjusted score

        Args:
            items: List of scored content items
            desired_content_types: Desired content types (e.g., ['news', 'video', 'art'])
            diversity_weight: Weight for diversity adjustments (0.0-1.0)

        Returns:
            Re-ranked list of items
        """
        if not items:
            return []

        # First sort by relevance score
        sorted_items = sorted(
            items, key=lambda x: x.get("relevance_score", 0), reverse=True
        )

        # Count platform and domain distribution
        platform_counts = Counter(item.get("platform", "unknown") for item in sorted_items)
        domain_counts = Counter(self._extract_domain(item.get("url", "")) for item in sorted_items)
        content_type_counts = Counter(
            item.get("content_type", "unknown") for item in sorted_items
        )

        # Calculate total items for percentage calculations
        total_items = len(sorted_items)

        # Apply diversity adjustments
        adjusted_items = []
        for idx, item in enumerate(sorted_items):
            base_score = item.get("relevance_score", 0)

            # Platform diversity adjustment
            platform = item.get("platform", "unknown")
            platform_percentage = platform_counts[platform] / total_items
            platform_adjustment = self._calculate_platform_adjustment(
                platform_percentage, diversity_weight
            )

            # Domain diversity adjustment (penalize duplicate domains more heavily)
            domain = self._extract_domain(item.get("url", ""))
            domain_count = domain_counts[domain]
            domain_adjustment = self._calculate_domain_adjustment(
                domain_count, diversity_weight
            )

            # Content type diversity adjustment
            content_type = item.get("content_type", "unknown")
            content_type_percentage = content_type_counts[content_type] / total_items
            content_type_adjustment = self._calculate_content_type_adjustment(
                content_type, content_type_percentage, desired_content_types, diversity_weight
            )

            # Position bonus (slight boost for top items to maintain quality)
            position_bonus = max(0, 10 - idx) * diversity_weight

            # Calculate adjusted score
            total_adjustment = (
                platform_adjustment + domain_adjustment + content_type_adjustment + position_bonus
            )
            adjusted_score = base_score + total_adjustment

            # Store adjustments in item for transparency
            item["adjusted_score"] = round(adjusted_score, 2)
            item["diversity_adjustments"] = {
                "platform": round(platform_adjustment, 2),
                "domain": round(domain_adjustment, 2),
                "content_type": round(content_type_adjustment, 2),
                "position_bonus": round(position_bonus, 2),
                "total": round(total_adjustment, 2),
            }

            adjusted_items.append(item)

        # Re-sort by adjusted score
        final_ranked = sorted(
            adjusted_items, key=lambda x: x.get("adjusted_score", 0), reverse=True
        )

        return final_ranked

    def calculate_diversity(self, items: List[Dict[str, Any]]) -> float:
        """
        Calculate diversity score (0-100) using Shannon entropy.

        Higher score = better platform/content type mix.

        Args:
            items: List of content items

        Returns:
            Diversity score (0-100)
        """
        if not items or len(items) < 2:
            return 0.0

        # Calculate entropy for platforms
        platforms = [item.get("platform", "unknown") for item in items]
        platform_entropy = self._calculate_entropy(platforms)

        # Calculate entropy for content types
        content_types = [item.get("content_type", "unknown") for item in items]
        content_type_entropy = self._calculate_entropy(content_types)

        # Average of both entropies
        avg_entropy = (platform_entropy + content_type_entropy) / 2

        # Normalize to 0-100 scale
        diversity_score = avg_entropy * 100

        return round(diversity_score, 2)

    def _calculate_entropy(self, values: List[str]) -> float:
        """
        Calculate Shannon entropy for a list of values.

        Args:
            values: List of category values

        Returns:
            Entropy value (0.0-1.0)
        """
        if not values:
            return 0.0

        counts = Counter(values)
        total = len(values)

        entropy = 0.0
        for count in counts.values():
            p = count / total
            if p > 0:
                entropy -= p * math.log2(p)

        # Normalize by max possible entropy (log2 of number of unique categories)
        unique_count = len(counts)
        max_entropy = math.log2(unique_count) if unique_count > 1 else 1

        normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0

        return normalized_entropy

    def _calculate_platform_adjustment(
        self, platform_percentage: float, weight: float
    ) -> float:
        """
        Calculate platform diversity adjustment.

        Penalize over-represented platforms, bonus for underrepresented.

        Args:
            platform_percentage: Percentage of items from this platform
            weight: Diversity weight (0.0-1.0)

        Returns:
            Adjustment value (can be negative)
        """
        # Ideal percentage (assuming 6 platforms)
        ideal_percentage = 1 / 6  # ~16.7%

        # If over-represented, penalize
        if platform_percentage > ideal_percentage * 1.5:
            # Heavy penalty for platforms with >25% of content
            return -15 * weight
        elif platform_percentage > ideal_percentage:
            # Moderate penalty
            return -8 * weight
        elif platform_percentage < ideal_percentage * 0.5:
            # Bonus for underrepresented platforms
            return 8 * weight
        else:
            # Near ideal, small bonus
            return 2 * weight

    def _calculate_domain_adjustment(self, domain_count: int, weight: float) -> float:
        """
        Calculate domain diversity adjustment.

        Heavily penalize duplicate domains to avoid spam from single sources.

        Args:
            domain_count: Number of items from this domain
            weight: Diversity weight (0.0-1.0)

        Returns:
            Adjustment value (typically negative for duplicates)
        """
        if domain_count == 1:
            return 0  # First occurrence, no penalty

        # Escalating penalty for duplicates
        if domain_count >= 5:
            return -25 * weight
        elif domain_count >= 3:
            return -15 * weight
        else:
            return -8 * weight

    def _calculate_content_type_adjustment(
        self,
        content_type: str,
        content_type_percentage: float,
        desired_types: List[str],
        weight: float,
    ) -> float:
        """
        Calculate content type diversity adjustment.

        Bonus for desired content types that are underrepresented.

        Args:
            content_type: Content type of item
            content_type_percentage: Percentage of items of this type
            desired_types: List of desired content types
            weight: Diversity weight (0.0-1.0)

        Returns:
            Adjustment value
        """
        # If not in desired types, slight penalty
        if content_type not in desired_types:
            return -5 * weight

        # Ideal percentage
        ideal_percentage = 1 / len(desired_types) if desired_types else 0.25

        # Bonus for underrepresented desired types
        if content_type_percentage < ideal_percentage * 0.5:
            return 10 * weight
        elif content_type_percentage < ideal_percentage:
            return 5 * weight
        elif content_type_percentage > ideal_percentage * 2:
            return -10 * weight
        else:
            return 0

    def _extract_domain(self, url: str) -> str:
        """
        Extract domain from URL.

        Args:
            url: Full URL

        Returns:
            Domain name (e.g., "example.com")
        """
        try:
            parsed = urlparse(url)
            domain = parsed.netloc or parsed.path

            # Remove www prefix
            if domain.startswith("www."):
                domain = domain[4:]

            return domain.lower()
        except:
            return "unknown"
