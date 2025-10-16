# app/services/agent/web_search.py
# -*- coding: utf-8 -*-
"""
Web Search Tool using Brave Search API.

This module keeps the original interface:
  - web_search(query, max_results) -> str     # returns a formatted string

And adds a structured function for routers:
  - web_search_results(query, max_results, recency_days=None, domains=None, timeout_seconds=None) -> List[dict]

The router should call `web_search_results(...)` to get normalized items.
"""

from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
from datetime import datetime
import httpx

from app.config import settings
from app.utils.logger import log_info, log_error


def _brave_endpoint() -> str:
    """Get Brave API endpoint with a safe default."""
    return getattr(
        settings, "BRAVE_API_ENDPOINT", "https://api.search.brave.com/res/v1/web/search"
    )


def _user_agent() -> str:
    """Get HTTP User-Agent with a safe default."""
    return getattr(settings, "HTTP_USER_AGENT", "CommuniverseBot-AI/1.0")


def _map_freshness(recency_days: Optional[int]) -> Optional[str]:
    """
    Map days to Brave 'freshness' parameter.
    Brave supports:
      - 'pd' (past day)
      - 'pw' (past week)
      - 'pm' (past month)
    """
    if not recency_days or recency_days <= 0:
        return None
    if recency_days <= 1:
        return "pd"
    if recency_days <= 7:
        return "pw"
    return "pm"


def _site_filter(domains: Optional[List[str]]) -> str:
    """
    Build a 'site:' filter prefix for the query if domains provided.
    Example: domains=['openai.com','platform.openai.com']
      -> '(site:openai.com OR site:platform.openai.com) '
    """
    if not domains:
        return ""
    parts = [d.strip() for d in domains if d and d.strip()]
    if not parts:
        return ""
    prefixed = [f"site:{d}" for d in parts]
    return "(" + " OR ".join(prefixed) + ") "


def _normalize_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a single Brave result item to our schema.
    """
    url = raw.get("url") or raw.get("link") or ""
    title = raw.get("title") or raw.get("name") or ""
    snippet = raw.get("description") or raw.get("snippet") or ""

    # Extract domain safely
    try:
        domain = urlparse(url).netloc
    except Exception:
        domain = ""

    # Try to normalize date if available
    published_raw = (
        raw.get("page_age") or raw.get("date") or raw.get("published") or None
    )
    published_date: Optional[str] = None
    try:
        if isinstance(published_raw, (int, float)):
            published_date = datetime.utcfromtimestamp(int(published_raw)).isoformat()
        elif isinstance(published_raw, str) and published_raw:
            published_date = published_raw
    except Exception:
        published_date = None

    return {
        "title": title,
        "url": url,
        "snippet": snippet,
        "domain": domain,
        "published_date": published_date,
    }


async def web_search_results(
    query: str,
    max_results: int = 5,
    recency_days: Optional[int] = None,
    domains: Optional[List[str]] = None,
    timeout_seconds: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Perform a Brave web search and return normalized structured results.

    Args:
        query: Search query.
        max_results: Maximum number of results to return.
        recency_days: Optional recency limit in days (mapped to Brave 'freshness').
        domains: Optional domain filter list; we convert to 'site:' filters.
        timeout_seconds: Optional HTTP timeout override.

    Returns:
        A list of normalized result dicts:
          { "title", "url", "snippet", "domain", "published_date" }
    """
    if not getattr(settings, "WEB_SEARCH_ENABLED", True) or not getattr(
        settings, "BRAVE_API_KEY", ""
    ):
        raise RuntimeError("Web search is not enabled or API key not configured")

    # Prepare query with optional site filters
    q = f"{_site_filter(domains)}{query}".strip()

    # Brave parameters
    params: Dict[str, Any] = {
        "q": q,
        "count": max_results,
    }
    freshness = _map_freshness(recency_days)
    if freshness:
        params["freshness"] = freshness

    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": settings.BRAVE_API_KEY,
        "User-Agent": _user_agent(),
    }

    log_info("Web search requested", query=q, count=max_results, freshness=freshness)

    try:
        async with httpx.AsyncClient(
            timeout=timeout_seconds or getattr(settings, "WEB_SEARCH_TIMEOUT", 12.0)
        ) as client:
            response = await client.get(
                _brave_endpoint(), headers=headers, params=params
            )

        if response.status_code != 200:
            log_error("Web search failed", status=response.status_code)
            raise RuntimeError(f"Web search failed with status {response.status_code}")

        data = response.json()
        results = (data or {}).get("web", {}).get("results", []) or []

        normalized = [_normalize_item(r) for r in results][:max_results]
        log_info("Web search completed", results_count=len(normalized))
        return normalized

    except Exception as e:
        log_error("Web search error", error=str(e))
        raise


# -----------------------------------------------------------------------------
# Original interface kept for backward compatibility
# -----------------------------------------------------------------------------
async def web_search(query: str, max_results: int = 5) -> str:
    """
    Search the web using Brave Search API and return a formatted multi-line string.

    Args:
        query: Search query.
        max_results: Maximum number of results.

    Returns:
        A formatted string that lists results in order:
            "1. <title>\n<snippet>\nURL: <url>\n"
        (joined with a blank line between items)
    """
    # Reuse the new structured function and format as before.
    items = await web_search_results(query=query, max_results=max_results)

    if not items:
        return "No results found"

    formatted: List[str] = []
    for i, item in enumerate(items, 1):
        title = item.get("title", "")
        description = item.get("snippet", "")
        url = item.get("url", "")
        formatted.append(f"{i}. {title}\n{description}\nURL: {url}")

    return "\n\n".join(formatted)
