"""
Content Discovery Router - Multi-platform content aggregation with LLM scoring and diversity ranking
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import time

from app.services.agent.core import AgentOrchestrator
from app.utils.logger import setup_logger
from app.dependencies import get_agent_orchestrator
from app.config import settings

logger = setup_logger(__name__)
router = APIRouter()


# Request/Response models
class ContentDiscoveryRequest(BaseModel):
    """Request model for content discovery"""
    query: str = Field(..., description="Search query for content discovery")
    platforms: Optional[List[str]] = Field(
        None,
        description="Platforms to search: news, youtube, reddit, twitter, deviantart, tumblr"
    )
    max_results: int = Field(20, ge=1, le=100, description="Maximum total results")
    content_types: Optional[List[str]] = Field(
        None,
        description="Desired content types: news, video, discussion, art"
    )


class ContentItem(BaseModel):
    """Individual content item with attribution"""
    title: str
    url: str
    snippet: Optional[str] = None
    platform: str
    content_type: str
    published_date: Optional[str] = None
    relevance_score: float = 0.0
    score_breakdown: Optional[Dict[str, float]] = None
    relevance_reasoning: Optional[str] = None
    adjusted_score: Optional[float] = None
    diversity_adjustments: Optional[Dict[str, float]] = None
    attribution: Optional[Dict[str, Any]] = None


class ContentDiscoveryResponse(BaseModel):
    """Response model for content discovery"""
    ok: bool = True
    data: Dict[str, Any] = Field(
        ...,
        description="Discovery results with query, results, diversity score, and platforms covered"
    )


# Endpoints
@router.post("/discover", response_model=ContentDiscoveryResponse, tags=["content-discovery"])
async def discover_content(
    request: ContentDiscoveryRequest,
    orchestrator: AgentOrchestrator = Depends(get_agent_orchestrator)
) -> ContentDiscoveryResponse:
    """
    Multi-platform content discovery with LLM-powered relevance scoring and diversity ranking.

    This endpoint orchestrates:
    1. **Stage 1**: Parallel multi-source aggregation (news, YouTube, Reddit, Twitter, DeviantArt, Tumblr)
    2. **Stage 2**: LLM-powered relevance scoring (topic, quality, recency, credibility)
    3. **Stage 3**: Content diversity ranking (platform balancing, duplicate detection)

    **Example Request**:
    ```json
    {
        "query": "Elio Pixar movie 2025",
        "platforms": ["news", "youtube", "deviantart", "tumblr"],
        "max_results": 20,
        "content_types": ["news", "video", "art"]
    }
    ```

    **Example Response**:
    ```json
    {
        "ok": true,
        "data": {
            "query": "Elio Pixar movie 2025",
            "results": [
                {
                    "title": "Elio Official Trailer - Pixar",
                    "url": "https://variety.com/elio-trailer",
                    "platform": "variety.com",
                    "content_type": "news",
                    "relevance_score": 95.5,
                    "score_breakdown": {
                        "topic": 100,
                        "quality": 95,
                        "recency": 20,
                        "credibility": 18
                    },
                    "attribution": null
                },
                {
                    "title": "Elio Fan Art",
                    "url": "https://deviantart.com/...",
                    "platform": "deviantart",
                    "content_type": "art",
                    "relevance_score": 88.0,
                    "attribution": {
                        "artist": "ArtistName",
                        "artist_url": "https://deviantart.com/artist",
                        "license": "CC BY-NC-SA 3.0"
                    }
                }
            ],
            "total_results": 20,
            "diversity_score": 85.5,
            "platforms_covered": ["variety.com", "youtube", "deviantart", "tumblr"]
        }
    }
    ```

    **Parameters**:
    - `query`: Search query (e.g., "Elio Pixar movie 2025")
    - `platforms`: Optional list of platforms (default: all)
    - `max_results`: Maximum total results (default: 20)
    - `content_types`: Desired content types (default: ["news", "video", "discussion", "art"])

    **Returns**:
    - `query`: Original search query
    - `results`: Scored and ranked content items with attribution
    - `total_results`: Total number of results found
    - `diversity_score`: Shannon entropy diversity score (0-100)
    - `platforms_covered`: List of platforms that returned results
    """
    start_time = time.time()

    try:
        logger.info(f"Content discovery request: query='{request.query}', platforms={request.platforms}")

        # Run orchestrator with content_discovery kind
        result = await orchestrator.run(
            kind="content_discovery",
            params={
                "query": request.query,
                "platforms": request.platforms,
                "max_results": request.max_results,
                "content_types": request.content_types
            },
            max_steps=1,  # Content discovery is single-step
            timeout_seconds=settings.CONTENT_DISCOVERY_TIMEOUT_SECONDS
        )

        if not result.get("success"):
            error_msg = result.get("result", {}).get("error", "Unknown error")
            logger.error(f"Content discovery failed: {error_msg}")
            raise HTTPException(status_code=500, detail=f"Content discovery failed: {error_msg}")

        discovery_data = result.get("result", {})

        duration_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Content discovery completed: "
            f"query='{request.query}', "
            f"results={discovery_data.get('total_results', 0)}, "
            f"diversity={discovery_data.get('diversity_score', 0):.2f}, "
            f"duration={duration_ms:.2f}ms"
        )

        return ContentDiscoveryResponse(
            ok=True,
            data={
                "query": discovery_data.get("query", request.query),
                "results": discovery_data.get("results", []),
                "total_results": discovery_data.get("total_results", 0),
                "diversity_score": discovery_data.get("diversity_score", 0.0),
                "platforms_covered": discovery_data.get("platforms_covered", []),
                "duration_ms": duration_ms
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(f"Content discovery error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Content discovery failed: {str(e)}"
        )


@router.get("/health", tags=["content-discovery"])
async def health_check():
    """Health check endpoint for content discovery service"""
    return {
        "ok": True,
        "service": "content-discovery",
        "status": "healthy",
        "features": {
            "deviantart": bool(settings.DEVIANTART_CLIENT_ID and settings.DEVIANTART_CLIENT_SECRET),
            "tumblr": bool(settings.TUMBLR_API_KEY),
            "web_search": bool(settings.BRAVE_API_KEY or settings.WEB_SEARCH_API_KEY),
            "llm_scoring": settings.USE_LLM
        }
    }


@router.get("/platforms", tags=["content-discovery"])
async def list_platforms():
    """List available platforms and their status"""
    return {
        "ok": True,
        "platforms": {
            "news": {
                "available": bool(settings.BRAVE_API_KEY or settings.WEB_SEARCH_API_KEY),
                "sources": ["variety.com", "hollywoodreporter.com", "deadline.com", "ew.com", "ign.com"]
            },
            "youtube": {
                "available": bool(settings.BRAVE_API_KEY or settings.WEB_SEARCH_API_KEY),
                "source": "youtube.com"
            },
            "reddit": {
                "available": bool(settings.BRAVE_API_KEY or settings.WEB_SEARCH_API_KEY),
                "source": "reddit.com"
            },
            "twitter": {
                "available": bool(settings.BRAVE_API_KEY or settings.WEB_SEARCH_API_KEY),
                "sources": ["twitter.com", "x.com"]
            },
            "deviantart": {
                "available": bool(settings.DEVIANTART_CLIENT_ID and settings.DEVIANTART_CLIENT_SECRET),
                "authenticated": bool(settings.DEVIANTART_CLIENT_ID and settings.DEVIANTART_CLIENT_SECRET),
                "api_url": "https://www.deviantart.com/api/v1/"
            },
            "tumblr": {
                "available": bool(settings.TUMBLR_API_KEY),
                "authenticated": bool(settings.TUMBLR_API_KEY),
                "api_url": "https://api.tumblr.com/v2/"
            }
        }
    }
