# app/api/routers/web_search_router.py
# -*- coding: utf-8 -*-
"""
Web Search Router - Lightweight endpoint for CPU-only mode.

Provides web search functionality using Brave API without requiring LLM.
This router is loaded in BOTH CPU-only and full modes.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.agent.web_search import web_search_results
from app.utils.logger import setup_logger
from app.config import settings

logger = setup_logger(__name__)
router = APIRouter()


class WebSearchRequest(BaseModel):
    """Web search request model"""
    query: str = Field(..., description="Search query")
    max_results: int = Field(5, ge=1, le=20, description="Maximum number of results")
    recency_days: Optional[int] = Field(None, description="Filter by recency in days")
    domains: Optional[List[str]] = Field(None, description="Limit to specific domains")
    # Note: summarize is ignored in CPU-only mode since we don't have LLM
    summarize: bool = Field(False, description="Ignored in CPU-only mode")


class WebSearchResult(BaseModel):
    """Individual search result"""
    title: str
    url: str
    snippet: str
    domain: str
    published_date: Optional[str] = None


class WebSearchResponse(BaseModel):
    """Web search response model"""
    ok: bool = True
    data: dict


@router.post("/web-search", response_model=WebSearchResponse)
async def web_search(request: WebSearchRequest):
    """
    Perform web search using Brave API.

    This endpoint works in CPU-only mode - no LLM required.
    Set BRAVE_API_KEY in environment to enable.
    """
    try:
        # Check if web search is configured
        if not getattr(settings, "BRAVE_API_KEY", ""):
            logger.warning("[WEB_SEARCH] BRAVE_API_KEY not configured")
            raise HTTPException(
                status_code=503,
                detail={
                    "ok": False,
                    "error": {
                        "code": "SERVICE_UNAVAILABLE",
                        "message": "Web search not configured - BRAVE_API_KEY missing"
                    }
                }
            )

        logger.info(
            f"[WEB_SEARCH] Query: {request.query!r}, max={request.max_results}"
        )

        # Call the Brave search function
        results = await web_search_results(
            query=request.query,
            max_results=request.max_results,
            recency_days=request.recency_days,
            domains=request.domains,
            timeout_seconds=float(getattr(settings, "WEB_SEARCH_TIMEOUT", 12.0)),
        )

        logger.info(f"[WEB_SEARCH] Completed with {len(results)} results")

        return {
            "ok": True,
            "data": {
                "query": request.query,
                "results": results,
                "total_results": len(results),
                "summary": None,  # No summary in CPU-only mode
                "has_summary": False,
            }
        }

    except HTTPException:
        raise
    except RuntimeError as e:
        # Catch errors from web_search_results (like API key missing)
        logger.error(f"[WEB_SEARCH] Runtime error: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": str(e)
                }
            }
        )
    except Exception as e:
        logger.error(f"[WEB_SEARCH] Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {
                    "code": "WEB_SEARCH_ERROR",
                    "message": str(e)
                }
            }
        )


@router.get("/web-search/health")
async def web_search_health():
    """Check if web search is available"""
    api_key_set = bool(getattr(settings, "BRAVE_API_KEY", ""))
    enabled = getattr(settings, "WEB_SEARCH_ENABLED", True)

    return {
        "ok": True,
        "data": {
            "available": api_key_set and enabled,
            "api_key_configured": api_key_set,
            "enabled": enabled,
        }
    }
