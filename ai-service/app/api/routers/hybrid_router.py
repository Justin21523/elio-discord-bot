"""
Hybrid AI router for ensemble persona responses with bandit learning.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any

from ...services.enhanced_persona_logic import (
    get_enhanced_engine,
    enhanced_persona_logic_reply,
)
from ...services.bandit import get_persona_bandit

router = APIRouter(prefix="/hybrid", tags=["hybrid"])


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class HybridReplyRequest(BaseModel):
    persona: str = Field(..., description="Persona name")
    message: str = Field(..., description="User message content")
    history: Optional[List[HistoryItem]] = Field(default_factory=list)
    user_id: Optional[str] = Field(default=None, description="User ID for CF scoring")
    channel_id: Optional[str] = Field(default=None, description="Channel ID for context")
    top_k: int = Field(default=5, ge=1, le=10)
    max_len: int = Field(default=60, ge=20, le=120)


class BanditUpdateRequest(BaseModel):
    arm: str = Field(..., description="Strategy/arm name")
    reward: float = Field(..., ge=0.0, le=1.0, description="Reward value [0, 1]")


class BanditBatchUpdateRequest(BaseModel):
    updates: List[Dict[str, Any]] = Field(..., description="List of {arm, reward} updates")


class BanditResetRequest(BaseModel):
    arm: Optional[str] = Field(default=None, description="Arm to reset, or all if None")


class StrategyReplyRequest(BaseModel):
    strategy: str = Field(..., description="Strategy name to use")
    persona: str = Field(..., description="Persona name")
    message: str = Field(..., description="User message")
    history: Optional[List[HistoryItem]] = Field(default_factory=list)
    max_len: int = Field(default=60, ge=20, le=120)


@router.post("/reply")
async def hybrid_reply(req: HybridReplyRequest):
    """
    Generate a persona response using the hybrid ensemble system.
    Uses multiple strategies and Thompson Sampling for selection.
    """
    # Convert history to list of dicts
    history = [{"role": h.role, "content": h.content} for h in (req.history or [])]

    result = enhanced_persona_logic_reply(
        persona=req.persona,
        message=req.message,
        history=history,
        top_k=req.top_k,
        max_len=req.max_len,
        user_id=req.user_id,
        channel_id=req.channel_id,
    )

    return {"ok": True, "data": result}


@router.post("/bandit/update")
async def update_bandit(req: BanditUpdateRequest):
    """
    Update a single bandit arm with a reward.
    """
    bandit = get_persona_bandit()
    bandit.update(req.arm, req.reward)

    return {
        "ok": True,
        "data": {
            "arm": req.arm,
            "reward": req.reward,
            "new_weight": bandit.get_weight(req.arm),
        }
    }


@router.post("/bandit/batch-update")
async def batch_update_bandit(req: BanditBatchUpdateRequest):
    """
    Batch update bandit arms from engagement feedback.
    """
    bandit = get_persona_bandit()
    processed = 0

    for update in req.updates:
        arm = update.get("arm") or update.get("strategy")
        reward = update.get("reward", 0.5)

        if arm and arm in bandit.arm_names:
            bandit.update(arm, reward)
            processed += 1

    return {
        "ok": True,
        "data": {
            "processed": processed,
            "total": len(req.updates),
            "weights": bandit.get_all_weights(),
        }
    }


@router.get("/bandit/stats")
async def get_bandit_stats():
    """
    Get current bandit statistics.
    """
    bandit = get_persona_bandit()

    return {
        "ok": True,
        "data": {
            "arms": bandit.arm_names,
            "weights": bandit.get_all_weights(),
            "stats": bandit.get_stats(),
        }
    }


@router.post("/bandit/reset")
async def reset_bandit(req: BanditResetRequest):
    """
    Reset bandit to initial state.
    """
    bandit = get_persona_bandit()
    bandit.reset(req.arm)

    return {
        "ok": True,
        "data": {
            "reset_arm": req.arm or "all",
            "weights": bandit.get_all_weights(),
        }
    }


@router.get("/strategies")
async def get_strategies():
    """
    Get available generation strategies.
    """
    engine = get_enhanced_engine()

    strategies = []
    for name in engine.ensemble.strategies.keys():
        weight = engine.bandit.get_weight(name)
        strategies.append({
            "name": name,
            "weight": round(weight, 4),
            "description": _get_strategy_description(name),
        })

    return {
        "ok": True,
        "data": {
            "strategies": strategies,
        }
    }


@router.post("/reply/strategy")
async def reply_with_strategy(req: StrategyReplyRequest):
    """
    Generate response using a specific strategy (for testing).
    """
    engine = get_enhanced_engine()

    if req.strategy not in engine.ensemble.strategies:
        return {
            "ok": False,
            "error": {
                "code": "INVALID_STRATEGY",
                "message": f"Strategy '{req.strategy}' not found. Available: {list(engine.ensemble.strategies.keys())}",
            }
        }

    # Get HMM state
    mood, topic = engine.hmm_manager.update(req.persona, req.message, [])

    # Build context
    context = {
        "persona": req.persona,
        "message": req.message,
        "history": [{"role": h.role, "content": h.content} for h in (req.history or [])],
        "max_len": req.max_len,
        "mood": mood,
        "topic": topic,
    }

    # Call specific strategy
    generator = engine.ensemble.strategies[req.strategy]
    result = generator(context)

    return {
        "ok": True,
        "data": {
            "text": result.get("text", ""),
            "strategy": req.strategy,
            "confidence": result.get("confidence", 0.0),
            "mood": mood,
            "topic": topic,
            "metadata": result.get("metadata", {}),
        }
    }


@router.get("/stats")
async def get_engine_stats():
    """
    Get comprehensive engine statistics.
    """
    engine = get_enhanced_engine()

    return {
        "ok": True,
        "data": engine.get_stats(),
    }


class CFPreferencesRequest(BaseModel):
    user_id: str = Field(..., description="User ID to get preferences for")
    use_similar_users: bool = Field(default=True, description="Blend with similar users")


class CFUpdateRequest(BaseModel):
    user_id: str = Field(..., description="User ID")
    response_text: str = Field(..., description="Response text to classify")
    engagement: float = Field(..., ge=0.0, le=1.0, description="Engagement score")


@router.post("/cf/preferences")
async def get_cf_preferences(req: CFPreferencesRequest):
    """
    Get CF preferences for a user.
    """
    engine = get_enhanced_engine()
    prefs = engine.response_cf.get_user_preferences(
        req.user_id,
        use_similar_users=req.use_similar_users,
    )

    return {
        "ok": True,
        "data": {
            "user_id": req.user_id,
            "preferences": prefs,
            "recommendations": engine.response_cf.get_style_recommendations(req.user_id),
        }
    }


@router.post("/cf/update")
async def update_cf_preferences(req: CFUpdateRequest):
    """
    Update CF preferences based on engagement.
    """
    engine = get_enhanced_engine()

    # Classify response style
    styles = engine.response_cf.classify_response_style(req.response_text)

    # Update preferences
    engine.response_cf.update(req.user_id, styles, req.engagement)

    return {
        "ok": True,
        "data": {
            "user_id": req.user_id,
            "classified_styles": styles,
            "engagement": req.engagement,
        }
    }


@router.get("/cf/stats")
async def get_cf_stats():
    """
    Get CF system statistics.
    """
    engine = get_enhanced_engine()

    return {
        "ok": True,
        "data": engine.response_cf.get_stats(),
    }


def _get_strategy_description(name: str) -> str:
    """Get human-readable description for a strategy."""
    descriptions = {
        "tfidf_markov": "TF-IDF similarity matching + Markov chain generation",
        "template_fill": "Template-based generation with slot filling",
        "ngram_blend": "N-gram language model with persona vocabulary",
        "retrieval_mod": "Retrieve similar examples and modify them",
    }
    return descriptions.get(name, "Custom strategy")
