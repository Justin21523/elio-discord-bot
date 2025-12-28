"""
Tumblr API client for searching and retrieving posts.
Uses API key authentication (v2 API).

API Documentation: https://www.tumblr.com/docs/en/api/v2
"""

import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime


class TumblrClient:
    """Client for Tumblr API v2"""

    BASE_URL = "https://api.tumblr.com/v2"

    def __init__(self, api_key: str, timeout: int = 30):
        """
        Initialize Tumblr client.

        Args:
            api_key: Tumblr API key (consumer key)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.client.aclose()

    async def search_by_tag(
        self,
        query: str,
        max_results: int = 10,
        filter_nsfw: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Search Tumblr for posts by tag.

        Args:
            query: Search tag/query
            max_results: Maximum number of results (1-20)
            filter_nsfw: Filter out NSFW content

        Returns:
            List of normalized post results
        """
        try:
            # Tumblr tagged endpoint
            url = f"{self.BASE_URL}/tagged"
            params = {
                "tag": query,
                "api_key": self.api_key,
                "limit": min(max_results, 20),  # API max is 20
                "filter": "safe" if filter_nsfw else "raw",
            }

            response = await self.client.get(url, params=params)

            if response.status_code == 429:  # Rate limited
                return []

            if response.status_code != 200:
                return []

            data = response.json()
            posts = data.get("response", [])

            # Normalize results
            normalized = []
            for post in posts:
                # Only process posts with images
                if post.get("type") == "photo":
                    normalized_item = await self._normalize_result(post)
                    if normalized_item:
                        normalized.append(normalized_item)

            return normalized[:max_results]

        except Exception:
            return []

    async def get_post(self, blog_id: str, post_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed post information.

        Args:
            blog_id: Blog identifier (blog name)
            post_id: Post ID

        Returns:
            Normalized post data or None
        """
        try:
            url = f"{self.BASE_URL}/blog/{blog_id}/posts"
            params = {
                "id": post_id,
                "api_key": self.api_key,
            }

            response = await self.client.get(url, params=params)

            if response.status_code != 200:
                return None

            data = response.json()
            posts = data.get("response", {}).get("posts", [])

            if posts:
                return await self._normalize_result(posts[0])

            return None

        except Exception:
            return None

    async def get_blog_info(self, blog_id: str) -> Optional[Dict[str, Any]]:
        """
        Get blog information for attribution.

        Args:
            blog_id: Blog identifier (blog name)

        Returns:
            Blog info or None
        """
        try:
            url = f"{self.BASE_URL}/blog/{blog_id}/info"
            params = {"api_key": self.api_key}

            response = await self.client.get(url, params=params)

            if response.status_code != 200:
                return None

            data = response.json()
            return data.get("response", {}).get("blog", {})

        except Exception:
            return None

    def _parse_reblog_chain(self, post: Dict) -> List[Dict[str, str]]:
        """
        Parse reblog chain to find original artist.

        Tumblr posts contain reblog information that needs to be traversed
        to find the original creator.

        Args:
            post: Post data from API

        Returns:
            List of reblogs from original to current, each with blog name and URL
        """
        chain = []

        # Check if this is a reblog
        if "reblogged_from_name" in post:
            # Build chain from current post backwards
            current_blog = post.get("blog_name", "")
            current_url = post.get("post_url", "")

            if current_blog:
                chain.append({"blog": current_blog, "url": current_url})

            # Add parent reblog
            parent_blog = post.get("reblogged_from_name", "")
            parent_url = post.get("reblogged_from_url", "")

            if parent_blog:
                chain.insert(0, {"blog": parent_blog, "url": parent_url})

            # Check for root blog (original poster)
            root_blog = post.get("reblogged_root_name", "")
            root_url = post.get("reblogged_root_url", "")

            if root_blog and root_blog not in [parent_blog, current_blog]:
                chain.insert(0, {"blog": root_blog, "url": root_url})

        return chain

    def _extract_images(self, post: Dict) -> tuple[Optional[str], Optional[str]]:
        """
        Extract image URLs from post.

        Args:
            post: Post data from API

        Returns:
            Tuple of (preview_url, thumbnail_url)
        """
        photos = post.get("photos", [])

        if not photos:
            return None, None

        # Get first photo (usually the main image)
        first_photo = photos[0]

        # Get original size
        original_size = first_photo.get("original_size", {})
        preview_url = original_size.get("url")

        # Get thumbnail (usually alt_sizes has multiple sizes)
        alt_sizes = first_photo.get("alt_sizes", [])
        thumbnail_url = None

        # Find a reasonable thumbnail size (250-500px wide)
        for size in alt_sizes:
            width = size.get("width", 0)
            if 250 <= width <= 500:
                thumbnail_url = size.get("url")
                break

        # Fallback to smallest size if no suitable thumbnail found
        if not thumbnail_url and alt_sizes:
            smallest = min(alt_sizes, key=lambda s: s.get("width", 9999))
            thumbnail_url = smallest.get("url")

        return preview_url, thumbnail_url

    async def _normalize_result(self, post: Dict) -> Optional[Dict[str, Any]]:
        """
        Normalize Tumblr post to common schema.

        Args:
            post: Raw post data from API

        Returns:
            Normalized result dictionary or None
        """
        # Extract blog information
        blog_name = post.get("blog_name", "Unknown")
        blog_url = f"https://{blog_name}.tumblr.com"

        # Determine if this is a reblog and find original artist
        reblog_chain = self._parse_reblog_chain(post)

        # If reblog, attribute to original poster
        if reblog_chain:
            original = reblog_chain[0]
            artist_name = original["blog"]
            artist_url = original["url"]
        else:
            artist_name = blog_name
            artist_url = blog_url

        # Extract images
        preview_url, thumbnail_url = self._extract_images(post)

        if not preview_url:  # No image found
            return None

        # Extract caption/description
        caption = post.get("caption", "") or post.get("summary", "")
        # Strip HTML tags (basic)
        import re
        caption = re.sub(r"<[^>]+>", "", caption)
        if len(caption) > 200:
            caption = caption[:197] + "..."

        # Extract tags
        tags = post.get("tags", [])

        # Parse date
        date_str = post.get("date")
        published_date = None
        if date_str:
            try:
                # Tumblr date format: "2024-01-15 12:30:00 GMT"
                published_date = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S %Z").isoformat()
            except:
                pass

        # Post URL
        post_url = post.get("post_url", "")

        # Determine license (Tumblr doesn't provide explicit licensing)
        # We'll note that it's from Tumblr and requires attribution
        license_info = "Tumblr post - requires attribution"

        return {
            "title": caption[:100] if caption else "Tumblr Post",  # Use caption as title
            "url": preview_url,
            "thumbnail_url": thumbnail_url or preview_url,
            "preview_url": preview_url,
            "platform": "tumblr",
            "content_type": "art",
            "description": caption,
            "published_date": published_date,
            "tags": tags,
            "mature_content": post.get("is_nsfw", False),
            "attribution": {
                "artist": artist_name,
                "artist_url": artist_url,
                "license": license_info,
                "platform": "tumblr",
                "original_url": post_url,
                "published_date": published_date,
                "reblog_chain": reblog_chain if reblog_chain else None,
            },
            # Additional metadata
            "stats": {
                "notes": post.get("note_count", 0),  # Tumblr calls likes+reblogs "notes"
            },
        }
