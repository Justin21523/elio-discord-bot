"""
VLM Router - Vision-Language Model endpoints
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, HttpUrl

from app.models.manager import ModelManager
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager

logger = setup_logger(__name__)
router = APIRouter()


class DescribeRequest(BaseModel):
    image_url: HttpUrl
    task: str = Field("caption", description="caption, describe, react")
    tone: str = Field("neutral", description="neutral, playful, dramatic")
    question: Optional[str] = None


class SafetyCheck(BaseModel):
    nsfw: bool = False
    violence: bool = False
    hate: bool = False


class DescribeResponse(BaseModel):
    ok: bool = True
    data: dict


@router.post("/describe", response_model=DescribeResponse)
async def describe_image(
    request: DescribeRequest,
    model_manager: ModelManager = Depends(get_model_manager)
):
    """Generate image description/caption"""
    try:
        logger.info(f"[VLM] Describing image (task={request.task})")

        vlm = await model_manager.get_vlm()

        if request.question:
            prompt = request.question
        elif request.task == "caption":
            prompt = f"Provide a {request.tone} caption for this image."
        elif request.task == "describe":
            prompt = f"Describe this image in detail with a {request.tone} tone."
        else:
            prompt = "What's in this image?"

        result = await vlm.describe_image(
            image_url=str(request.image_url), question=prompt
        )

        description = result.get("text", "")

        safety = SafetyCheck(
            nsfw="nsfw" in description.lower(),
            violence="violence" in description.lower(),
            hate=False,
        )

        return {
            "ok": True,
            "data": {
                "caption": description if request.task == "caption" else None,
                "description": description if request.task == "describe" else None,
                "reaction": description if request.task == "react" else None,
                "safety": safety.dict(),
                "model": model_manager.vlm_model_name,
                "tokens": result.get("usage", {}),
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Image description failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


class ImageReactRequest(BaseModel):
    image_url: HttpUrl
    persona_name: str
    context: Optional[str] = None


@router.post("/imageReact")
async def image_react(
    request: ImageReactRequest,
    model_manager: ModelManager = Depends(get_model_manager)
):
    """Generate persona-specific image reaction"""
    try:
        logger.info(f"[VLM] Image reaction for: {request.persona_name}")

        vlm = await model_manager.get_vlm()

        persona_styles = {
            "Elio": "React with wonder and curiosity",
            "Glordon": "React with ancient wisdom",
            "Ambassador Questa": "React professionally",
            "Lord Grigon": "React gruffly but with hidden warmth",
        }

        style = persona_styles.get(request.persona_name, "React naturally")
        prompt = f"{style}. {request.context or ''}"

        result = await vlm.describe_image(image_url=str(request.image_url), question=prompt)

        return {
            "ok": True,
            "data": {
                "reaction": result.get("text", ""),
                "persona": request.persona_name,
                "label": result.get("text", "")[:100],
                "model": model_manager.vlm_model_name,
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Image reaction failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )
