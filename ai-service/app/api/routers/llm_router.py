"""
LLM Router - Text generation endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import math

from app.models.manager import ModelManager
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager
from app.services.agent.web_search import web_search_results
from app.config import settings

logger = setup_logger(__name__)
router = APIRouter()


# Request/Response models
class SummarizeNewsRequest(BaseModel):
    topics: List[str] = Field(..., description="Topics to search for", min_items=1)  # type: ignore
    locale: str = Field("en", description="Language locale")
    max_items: int = Field(6, ge=1, le=20)
    style: str = Field("concise-bullet", description="Summary style")


class PersonaReplyRequest(BaseModel):
    persona_name: str
    context: str
    user_message: str
    system_style: Optional[str] = None
    max_tokens: int = Field(512, ge=50, le=2048)
    temperature: float = Field(0.8, ge=0.0, le=2.0)
    use_finetuned: bool = Field(True, description="Use fine-tuned character model")


class GenerateRequest(BaseModel):
    system: Optional[str] = None
    prompt: str = Field(..., min_length=1)
    max_tokens: int = Field(512, ge=50, le=4096)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    top_p: float = Field(0.9, ge=0.0, le=1.0)
    stop: Optional[List[str]] = None
    use_finetuned: bool = Field(False, description="Use fine-tuned character model")


class GenerateResponse(BaseModel):
    ok: bool = True
    data: dict


@router.post("/summarizeNews", response_model=GenerateResponse)
async def summarize_news(
    request: SummarizeNewsRequest,
    model_manager: ModelManager = Depends(get_model_manager),
):
    """Generate news summary digest by combining real web search with LLM summarization."""
    try:
        logger.info(f"[LLM] Summarizing news for topics: {request.topics}")

        # 1) Resolve LLM
        llm = await model_manager.get_llm()

        # 2) Fetch news via Brave Search per topic (real HTTP)
        #    We split the budget of `max_items` across topics (at least 1 per topic).
        topics = request.topics or []
        if not topics:
            topics = []

        per_topic = 1
        try:
            if topics and request.max_items:
                per_topic = max(1, math.ceil(request.max_items / len(topics)))
        except Exception:
            per_topic = 1

        aggregated: list = []
        for topic in topics:
            # Use a recency heuristic: prefer past week for "news" feel.
            results = await web_search_results(
                query=str(topic),
                max_results=per_topic,
                recency_days=7,
                domains=None,  # you may pass a domain list if your request model supports it
                timeout_seconds=float(getattr(settings, "WEB_SEARCH_TIMEOUT", 12.0)),
            )
            aggregated.extend(results)

        # Trim to max_items if provided
        if getattr(request, "max_items", None):
            aggregated = aggregated[: int(request.max_items)]

        # 3) Prepare text for LLM summarization
        if aggregated:
            combined_text = "\n\n".join(
                [
                    f"[{i+1}] {r.get('title','')}\n{r.get('snippet','')}\n"
                    f"Source: {r.get('domain','')}\nURL: {r.get('url','')}"
                    for i, r in enumerate(aggregated)
                ]
            )
        else:
            combined_text = "No sources found."

        system_prompt = (
            f"You are a helpful news summarizer for a Pixar/Elio fan community.\n"
            f"Locale: {request.locale}\n"
            f"Style: {request.style}\n"
            f"Provide concise, engaging bullet-point summaries with source indices when helpful."
        )

        # 4) Ask LLM to summarize the aggregated search results
        result = await llm.generate(
            system=system_prompt,
            prompt=f"Topics: {', '.join(request.topics or [])}\n\n"
            f"Search results:\n{combined_text}\n\n"
            f"Write a concise digest:",
            max_tokens=1024,
            temperature=0.7,
        )

        # 5) Build items list for response (one item per search hit)
        items = [
            {
                "title": r.get("title", ""),
                "source": r.get("domain", ""),
                "url": r.get("url", ""),
                # Use snippet as per-item summary; the overall digest is in result["text"].
                "summary": r.get("snippet", ""),
            }
            for r in aggregated
        ]

        logger.info(f"[LLM] News summarization completed: items={len(items)}")

        return {
            "ok": True,
            "data": {
                "items": items,
                "model": model_manager.llm_model_name,
                "tokens": result.get("usage", {}),
                # Optionally, you can return the overall digest if your GenerateResponse supports it.
                "digest": result.get("text", ""),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] News summarization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


@router.post("/personaReply", response_model=GenerateResponse)
async def persona_reply(
    request: PersonaReplyRequest,
    model_manager: ModelManager = Depends(get_model_manager),
):
    """Generate persona-specific reply"""
    try:
        logger.info(f"[LLM] Generating reply for persona: {request.persona_name}")

        llm = await model_manager.get_llm()

        persona_traits = {
            "Elio": "Curious, optimistic, slightly awkward but endearing",
            "Glordon": "Wise, mysterious, speaks in riddles",
            "Ambassador Questa": "Professional, diplomatic, proper",
            "Lord Grigon": "Gruff, short-tempered, secretly caring",
        }

        trait = persona_traits.get(request.persona_name, "Friendly and helpful")

        system_prompt = f"""You are {request.persona_name} from the Pixar film Elio.
Personality: {trait}
{request.system_style or ''}

Respond naturally in character (2-3 sentences max)."""

        prompt = f"""Context: {request.context}

User said: "{request.user_message}"

Respond as {request.persona_name}:"""

        result = await llm.generate(
            system=system_prompt,
            prompt=prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            use_finetuned=request.use_finetuned,
        )

        return {
            "ok": True,
            "data": {
                "reply": result.get("text", "").strip(),
                "persona": request.persona_name,
                "tokens": result.get("usage", {}),
                "model": model_manager.llm_model_name,
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Persona reply failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: GenerateRequest, model_manager: ModelManager = Depends(get_model_manager)
):
    """General-purpose text generation"""
    try:
        logger.info(f"[LLM] Generating text (max_tokens={request.max_tokens})")

        llm = await model_manager.get_llm()

        result = await llm.generate(
            system=request.system,
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            stop=request.stop,
            use_finetuned=request.use_finetuned,
        )

        return {
            "ok": True,
            "data": {
                "text": result.get("text", ""),
                "usage": result.get("usage", {}),
                "model": model_manager.llm_model_name,
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Text generation failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )
