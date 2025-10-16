"""
Embeddings Router - Text vectorization endpoints
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.models.manager import ModelManager
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager

logger = setup_logger(__name__)
router = APIRouter()


class EmbedTextRequest(BaseModel):
    texts: List[str] = Field(..., min_items=1)  # type: ignore
    lang_hint: Optional[str] = None
    normalize: bool = True


class EmbedTextResponse(BaseModel):
    ok: bool = True
    data: dict


@router.post("/text", response_model=EmbedTextResponse)
async def embed_text(
    request: EmbedTextRequest, model_manager: ModelManager = Depends(get_model_manager)
):
    """Generate embeddings for input texts"""
    try:
        logger.info(f"[EMBED] Embedding {len(request.texts)} texts")

        embeddings_model = await model_manager.get_embeddings()

        result = await embeddings_model.embed(
            texts=request.texts, lang_hint=request.lang_hint  # type: ignore
        )

        vectors = result.get("vectors", [])
        dim = result.get("dim", 0)

        if request.normalize and vectors:
            import numpy as np

            vectors = [(np.array(v) / np.linalg.norm(v)).tolist() for v in vectors]

        return {
            "ok": True,
            "data": {
                "vectors": vectors,
                "dim": dim,
                "model": model_manager.embed_model_name,
                "count": len(vectors),
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Embedding generation failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.get("/model-info")
async def get_model_info(model_manager: ModelManager = Depends(get_model_manager)):
    """Get embeddings model information"""
    try:
        embeddings_model = await model_manager.get_embeddings()
        info = await embeddings_model.get_info()

        return {
            "ok": True,
            "data": {
                "model": model_manager.embed_model_name,
                "dimension": info.get("dim", 0),
                "max_length": info.get("max_length", 512),
                "supports_multilingual": info.get("multilingual", False),
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Model info failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )
