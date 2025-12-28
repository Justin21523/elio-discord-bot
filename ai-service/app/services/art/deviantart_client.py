"""
DeviantArt API client for searching and retrieving artwork.
Uses OAuth 2.0 client credentials flow for authentication.

API Documentation: https://www.deviantart.com/developers/
"""

import httpx
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta


class DeviantArtClient:
    """Client for DeviantArt REST API v1/v2"""

    BASE_URL = "https://www.deviantart.com/api/v1/oauth2"
    TOKEN_URL = "https://www.deviantart.com/oauth2/token"

    def __init__(self, client_id: str, client_secret: str, timeout: int = 30):
        """
        Initialize DeviantArt client.

        Args:
            client_id: OAuth 2.0 client ID
            client_secret: OAuth 2.0 client secret
            timeout: Request timeout in seconds
        """
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        self.client = httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.client.aclose()

    async def authenticate(self) -> bool:
        """
        Obtain OAuth 2.0 access token using client credentials flow.

        Returns:
            True if authentication successful, False otherwise
        """
        try:
            response = await self.client.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )

            if response.status_code != 200:
                return False

            data = response.json()
            self.access_token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)  # Default 1 hour

            # Set expiry with 5-minute buffer
            self.token_expires_at = datetime.now() + timedelta(seconds=expires_in - 300)

            return self.access_token is not None

        except Exception:
            return False

    async def _ensure_authenticated(self) -> bool:
        """
        Ensure we have a valid access token, refreshing if necessary.

        Returns:
            True if authenticated, False otherwise
        """
        if not self.access_token or not self.token_expires_at:
            return await self.authenticate()

        # Refresh if token is expired or about to expire
        if datetime.now() >= self.token_expires_at:
            return await self.authenticate()

        return True

    async def search_by_tag(
        self,
        query: str,
        max_results: int = 10,
        mature_content: bool = False,
        license_filter: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search DeviantArt for artwork by tag.

        Args:
            query: Search query/tag
            max_results: Maximum number of results (1-50)
            mature_content: Include mature content
            license_filter: Optional list of license types to filter by

        Returns:
            List of normalized artwork results
        """
        if not await self._ensure_authenticated():
            return []

        try:
            # DeviantArt API uses "browse/tags" endpoint for tag searches
            url = f"{self.BASE_URL}/browse/tags"
            params = {
                "tag": query,
                "offset": 0,
                "limit": min(max_results, 50),  # API max is 50
                "mature_content": "true" if mature_content else "false",
            }

            headers = {"Authorization": f"Bearer {self.access_token}"}

            response = await self.client.get(url, params=params, headers=headers)

            if response.status_code == 429:  # Rate limited
                # Could implement retry logic here
                return []

            if response.status_code != 200:
                return []

            data = response.json()
            results = data.get("results", [])

            # Normalize and filter results
            normalized = []
            for deviation in results:
                normalized_item = self._normalize_result(deviation)

                # Apply license filter if specified
                if license_filter:
                    item_license = normalized_item.get("license", "")
                    if not any(lf.lower() in item_license.lower() for lf in license_filter):
                        continue

                normalized.append(normalized_item)

            return normalized[:max_results]

        except Exception:
            return []

    async def get_deviation(self, deviation_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific deviation (artwork).

        Args:
            deviation_id: DeviantArt deviation ID

        Returns:
            Normalized deviation data or None
        """
        if not await self._ensure_authenticated():
            return None

        try:
            url = f"{self.BASE_URL}/deviation/{deviation_id}"
            headers = {"Authorization": f"Bearer {self.access_token}"}

            response = await self.client.get(url, headers=headers)

            if response.status_code != 200:
                return None

            deviation = response.json()
            return self._normalize_result(deviation)

        except Exception:
            return None

    async def get_user_profile(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Get user profile information for attribution.

        Args:
            username: DeviantArt username

        Returns:
            User profile data or None
        """
        if not await self._ensure_authenticated():
            return None

        try:
            url = f"{self.BASE_URL}/user/profile/{username}"
            headers = {"Authorization": f"Bearer {self.access_token}"}

            response = await self.client.get(url, headers=headers)

            if response.status_code != 200:
                return None

            return response.json()

        except Exception:
            return None

    def _parse_license(self, deviation: Dict) -> str:
        """
        Parse license information from deviation metadata.

        DeviantArt license types:
        - Creative Commons (various types)
        - All Rights Reserved (default)

        Args:
            deviation: Deviation data from API

        Returns:
            Human-readable license string
        """
        # Check for license object
        license_obj = deviation.get("license")
        if license_obj:
            return license_obj

        # Check allows_comments flag and other metadata
        allows_comments = deviation.get("allows_comments", True)
        is_downloadable = deviation.get("is_downloadable", False)

        # DeviantArt specific license detection
        if "license" in deviation:
            license_type = deviation["license"]
            if license_type == "creativecommons":
                # Try to determine CC type from metadata
                return "Creative Commons (unspecified)"
            elif license_type:
                return license_type

        # Default to All Rights Reserved if no explicit license
        return "All Rights Reserved"

    def _normalize_result(self, deviation: Dict) -> Dict[str, Any]:
        """
        Normalize DeviantArt deviation to common schema.

        Args:
            deviation: Raw deviation data from API

        Returns:
            Normalized result dictionary
        """
        # Extract author information
        author = deviation.get("author", {})
        author_username = author.get("username", "Unknown")
        author_user_id = author.get("userid", "")

        # Extract URLs
        deviation_url = deviation.get("url", "")

        # Get best quality image
        content = deviation.get("content", {})
        preview = deviation.get("preview", {})
        thumbs = deviation.get("thumbs", [])

        # Priority: content > preview > largest thumbnail
        image_url = content.get("src") or preview.get("src")
        thumbnail_url = preview.get("src")

        if thumbs and not thumbnail_url:
            # Get largest thumbnail
            largest_thumb = max(thumbs, key=lambda t: t.get("width", 0) * t.get("height", 0))
            thumbnail_url = largest_thumb.get("src")

        # Extract description (strip HTML if present)
        description = deviation.get("excerpt", "") or deviation.get("description", "")
        if len(description) > 200:
            description = description[:197] + "..."

        # Parse published date
        published_time = deviation.get("published_time")
        published_date = None
        if published_time:
            try:
                published_date = datetime.fromtimestamp(published_time).isoformat()
            except:
                pass

        # Extract tags
        tags = []
        if "tags" in deviation:
            tags = [tag.get("tag_name", "") for tag in deviation.get("tags", [])]

        return {
            "title": deviation.get("title", "Untitled"),
            "url": image_url or deviation_url,
            "thumbnail_url": thumbnail_url,
            "preview_url": image_url,
            "platform": "deviantart",
            "content_type": "art",
            "description": description,
            "published_date": published_date,
            "tags": tags,
            "mature_content": deviation.get("is_mature", False),
            "attribution": {
                "artist": author_username,
                "artist_url": f"https://www.deviantart.com/{author_username}",
                "license": self._parse_license(deviation),
                "platform": "deviantart",
                "original_url": deviation_url,
                "published_date": published_date,
            },
            # Additional metadata
            "stats": {
                "views": deviation.get("stats", {}).get("views", 0),
                "favorites": deviation.get("stats", {}).get("favourites", 0),
                "comments": deviation.get("stats", {}).get("comments", 0),
            },
        }
