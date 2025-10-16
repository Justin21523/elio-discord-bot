# -*- coding: utf-8 -*-
"""
webSearch tool.

Implementation notes:
- Lightweight DuckDuckGo HTML scraping to avoid API keys.
- Strict allowlist (optional) and short timeouts.
- If network is unavailable, return empty results gracefully.

This is intentionally minimal and safe.
"""

from __future__ import annotations

import re
import socket
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import requests

from core.config import get_config

from . import Tool, ToolResult

_cfg = get_config()


class WebSearchTool(Tool):
    name = "webSearch"

    def meta(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": "Search the web (DuckDuckGo) with allowlisted domains and return titles+urls.",
            "params": {"query": "str", "max_results": "int<=10"},
        }

    def run(self, params: Dict[str, Any]) -> ToolResult:
        q = str(params.get("query", "")).strip()[:256]
        max_results = int(params.get("max_results", 6))
        max_results = max(1, min(max_results, 10))

        if not q:
            return ToolResult(ok=False, error="Empty query")

        try:
            # quick network sanity
            socket.gethostbyname("duckduckgo.com")
        except Exception:
            return ToolResult(ok=True, preview="(offline) 0 results", extra={"results": []})

        url = f"https://duckduckgo.com/html/?q={quote_plus(q)}"
        try:
            resp = requests.get(url, timeout=6)
            html = resp.text
        except Exception as e:
            return ToolResult(ok=True, preview=f"(network error) {e}", extra={"results": []})

        # naive parse for results
        items: List[Dict[str, str]] = []
        for m in re.finditer(r'<a rel="nofollow" class="result__a" href="([^"]+)">([^<]+)</a>', html):
            link = m.group(1)
            title = re.sub(r"\s+", " ", m.group(2)).strip()
            if _cfg.api.search_allowlist:
                if not any(dom in link for dom in _cfg.api.search_allowlist):
                    continue
            items.append({"title": title, "url": link})
            if len(items) >= max_results:
                break

        preview = f"{len(items)} results for '{q}'"
        return ToolResult(ok=True, preview=preview, extra={"results": items})
