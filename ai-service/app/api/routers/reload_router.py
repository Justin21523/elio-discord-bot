"""
Model Hot-Reload Router
Allows triggering model reloads when training data is updated
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reload", tags=["reload"])


class ReloadRequest(BaseModel):
    """Request body for reload endpoint"""
    service: str = "all"  # "persona_logic", "markov", "all"
    force: bool = False


class ReloadResponse(BaseModel):
    """Response from reload endpoint"""
    success: bool
    message: str
    reloaded_services: list[str]


# Reference to the PersonaLogic engine (set by main app)
_persona_logic_engine = None


def set_persona_logic_engine(engine):
    """Set the PersonaLogic engine reference for hot-reload"""
    global _persona_logic_engine
    _persona_logic_engine = engine
    logger.info("[Reload] PersonaLogic engine reference set")


@router.post("/models", response_model=ReloadResponse)
async def reload_models(request: ReloadRequest):
    """
    Hot-reload ML models with updated training data.

    - **service**: Which service to reload ("persona_logic", "markov", "all")
    - **force**: Force reload even if no new data detected

    Returns list of successfully reloaded services.
    """
    reloaded = []

    try:
        if request.service in ("persona_logic", "all"):
            if _persona_logic_engine is None:
                raise HTTPException(
                    status_code=500,
                    detail="PersonaLogic engine not initialized"
                )

            # Reload the corpus and rebuild models
            logger.info("[Reload] Reloading PersonaLogic corpus...")
            _persona_logic_engine.corpus = _persona_logic_engine._load_corpus()
            _persona_logic_engine.models = _persona_logic_engine._build_models()

            # Log statistics
            total_samples = sum(len(s) for s in _persona_logic_engine.corpus.values())
            logger.info(f"[Reload] PersonaLogic reloaded: {total_samples} samples")
            reloaded.append("persona_logic")

        if request.service in ("markov", "all"):
            # Markov models are rebuilt as part of PersonaLogic
            if "persona_logic" not in reloaded:
                logger.info("[Reload] Markov models are rebuilt with PersonaLogic")
            reloaded.append("markov")

        return ReloadResponse(
            success=True,
            message=f"Successfully reloaded {len(reloaded)} services",
            reloaded_services=reloaded
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Reload] Error reloading models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def reload_status():
    """
    Get status of loaded models.

    Returns information about currently loaded models and their statistics.
    """
    status = {
        "persona_logic": {
            "loaded": _persona_logic_engine is not None,
            "personas": 0,
            "total_samples": 0
        }
    }

    if _persona_logic_engine is not None:
        status["persona_logic"]["personas"] = len(_persona_logic_engine.corpus)
        status["persona_logic"]["total_samples"] = sum(
            len(s) for s in _persona_logic_engine.corpus.values()
        )
        status["persona_logic"]["persona_stats"] = {
            k: len(v) for k, v in _persona_logic_engine.corpus.items()
            if k != "default"
        }

    return status
