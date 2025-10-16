"""
Moderation Router - Content safety endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.models.manager import ModelManager
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager

logger = setup_logger(__name__)
router = APIRouter()


class ScanRequest(BaseModel):
    text: str
    strict_mode: bool = False


class ModerationResult(BaseModel):
    is_safe: bool
    toxicity: float = Field(ge=0.0, le=1.0)
    hate: float = Field(ge=0.0, le=1.0)
    sexual: float = Field(ge=0.0, le=1.0)
    violence: float = Field(ge=0.0, le=1.0)
    flags: list = Field(default_factory=list)


class ScanResponse(BaseModel):
    ok: bool = True
    data: ModerationResult


class RewriteRequest(BaseModel):
    text: str
    reason: str


class RewriteResponse(BaseModel):
    ok: bool = True
    data: dict


@router.post("/scan", response_model=ScanResponse)
async def scan_content(request: ScanRequest):
    """Scan text for toxic/unsafe content"""
    try:
        logger.info(f"[MOD] Scanning text ({len(request.text)} chars)")

        # Simplified moderation (in production, use proper model)
        toxic_keywords = ["fuck", "shit", "asshole", "damn", "hate"]
        sexual_keywords = ["sex", "porn", "nude", "explicit"]
        violence_keywords = ["kill", "die", "murder", "blood", "violence"]

        text_lower = request.text.lower()

        toxicity = sum(1 for kw in toxic_keywords if kw in text_lower) / max(
            len(toxic_keywords), 1
        )
        sexual = sum(1 for kw in sexual_keywords if kw in text_lower) / max(
            len(sexual_keywords), 1
        )
        violence = sum(1 for kw in violence_keywords if kw in text_lower) / max(
            len(violence_keywords), 1
        )
        hate = 0.0

        flags = []
        if toxicity > 0.3:
            flags.append("toxicity")
        if sexual > 0.3:
            flags.append("sexual")
        if violence > 0.3:
            flags.append("violence")

        threshold = 0.5 if request.strict_mode else 0.7
        is_safe = max(toxicity, sexual, violence, hate) < threshold

        result = ModerationResult(
            is_safe=is_safe,
            toxicity=min(toxicity, 1.0),
            hate=hate,
            sexual=min(sexual, 1.0),
            violence=min(violence, 1.0),
            flags=flags,
        )

        logger.info(f"[MOD] Scan result: is_safe={is_safe}, flags={flags}")

        return {"ok": True, "data": result}
    except Exception as e:
        logger.error(f"[ERR] Moderation scan failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite_content(
    request: RewriteRequest,
    model_manager: ModelManager = Depends(get_model_manager)
):
    """Rewrite text to be safer/more appropriate"""
    try:
        logger.info(f"[MOD] Rewriting text (reason: {request.reason})")

        llm = await model_manager.get_llm()

        result = await llm.generate(
            system="You are a content moderator. Rewrite text appropriately while preserving intent.",
            prompt=f"""Original: {request.text}

Reason: {request.reason}

Rewritten text:""",
            max_tokens=512,
            temperature=0.5,
        )

        rewritten = result.get("text", "").strip()

        logger.info(f"[MOD] Rewritten ({len(rewritten)} chars)")

        return {
            "ok": True,
            "data": {
                "original": request.text,
                "rewritten": rewritten,
                "reason": request.reason,
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Content rewrite failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )
