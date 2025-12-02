"""
Game AI router for human-like game bot decisions.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from ...services.game_ai import (
    TacticalBattleBot,
    get_battle_bot,
    PFABehaviorModel,
    PLAYSTYLES,
    create_error_injector,
)

router = APIRouter(prefix="/game-ai", tags=["game-ai"])

# Cache bots per session
_battle_bots: Dict[str, TacticalBattleBot] = {}


class BattleActionRequest(BaseModel):
    session_id: str = Field(..., description="Game session ID")
    my_hp: int = Field(..., ge=0, le=1000)
    enemy_hp: int = Field(..., ge=0, le=1000)
    available_actions: List[str] = Field(default=['strike', 'guard', 'quick', 'block'])
    cooldowns: Optional[Dict[str, int]] = Field(default=None)
    enemy_last_action: Optional[str] = Field(default=None)
    my_max_hp: int = Field(default=100, ge=1, le=1000)
    enemy_max_hp: int = Field(default=100, ge=1, le=1000)
    playstyle: Optional[str] = Field(default=None, description="Bot playstyle override")
    skill_level: float = Field(default=0.7, ge=0.0, le=1.0)
    inject_errors: bool = Field(default=True, description="Enable human-like errors")


class BattleInitRequest(BaseModel):
    session_id: str = Field(..., description="Game session ID")
    playstyle: Optional[str] = Field(default=None)
    skill_level: float = Field(default=0.7, ge=0.0, le=1.0)
    personality_weight: float = Field(default=0.6, ge=0.0, le=1.0)


class ReactionTimeRequest(BaseModel):
    skill_level: float = Field(default=0.7, ge=0.0, le=1.0)
    is_critical: bool = Field(default=False)
    fatigue_turns: int = Field(default=0, ge=0)


class FlavorTextRequest(BaseModel):
    action: str = Field(..., description="Action taken")
    tendency: str = Field(default="neutral", description="Current behavioral tendency")
    hp_ratio: float = Field(default=1.0, ge=0.0, le=1.0)
    enemy_hp_ratio: float = Field(default=1.0, ge=0.0, le=1.0)
    playstyle: str = Field(default="balanced")


@router.post("/battle/init")
async def init_battle_bot(req: BattleInitRequest):
    """
    Initialize a battle bot for a session.
    """
    bot = get_battle_bot(
        playstyle=req.playstyle,
        skill_level=req.skill_level,
        personality_weight=req.personality_weight,
    )
    _battle_bots[req.session_id] = bot

    return {
        "ok": True,
        "data": {
            "session_id": req.session_id,
            "playstyle": bot.pfa.playstyle,
            "skill_level": bot.skill_level,
            "personality_weight": bot.personality_weight,
        }
    }


@router.post("/battle/action")
async def get_battle_action(req: BattleActionRequest):
    """
    Get next battle action from the AI bot.
    """
    # Get or create bot for session
    bot = _battle_bots.get(req.session_id)
    if not bot:
        bot = get_battle_bot(
            playstyle=req.playstyle,
            skill_level=req.skill_level,
        )
        _battle_bots[req.session_id] = bot

    # Get bot's action decision
    result = bot.select_action(
        my_hp=req.my_hp,
        enemy_hp=req.enemy_hp,
        available_actions=req.available_actions,
        cooldowns=req.cooldowns,
        enemy_last_action=req.enemy_last_action,
        my_max_hp=req.my_max_hp,
        enemy_max_hp=req.enemy_max_hp,
    )

    action = result['action']
    error_info = None

    # Inject human-like errors if enabled
    if req.inject_errors:
        error_injector = create_error_injector(
            skill_level=req.skill_level,
            fatigue_rate=0.02,
            tilt_sensitivity=0.5,
        )

        hp_ratio = req.my_hp / max(1, req.my_max_hp)
        action, error_info = error_injector.inject_errors(
            intended_action=action,
            available_actions=req.available_actions,
            hp_ratio=hp_ratio,
            action_scores=result.get('all_scores'),
        )

    # Generate flavor text
    flavor = _generate_battle_flavor(
        action=action,
        tendency=result['tendency'],
        hp_ratio=req.my_hp / max(1, req.my_max_hp),
        playstyle=bot.pfa.playstyle,
    )

    return {
        "ok": True,
        "data": {
            "action": action,
            "confidence": result['confidence'],
            "tendency": result['tendency'],
            "reasoning": result['reasoning'],
            "flavor_text": flavor,
            "error_info": error_info,
            "playstyle": bot.pfa.playstyle,
        }
    }


@router.post("/battle/end")
async def end_battle_session(session_id: str):
    """
    End a battle session and clean up.
    """
    bot = _battle_bots.pop(session_id, None)
    stats = bot.get_stats() if bot else None

    return {
        "ok": True,
        "data": {
            "session_id": session_id,
            "cleaned_up": bot is not None,
            "final_stats": stats,
        }
    }


@router.get("/battle/stats/{session_id}")
async def get_battle_stats(session_id: str):
    """
    Get statistics for a battle session.
    """
    bot = _battle_bots.get(session_id)
    if not bot:
        return {
            "ok": False,
            "error": {
                "code": "SESSION_NOT_FOUND",
                "message": f"No battle session found: {session_id}",
            }
        }

    return {
        "ok": True,
        "data": bot.get_stats(),
    }


@router.post("/reaction-time")
async def get_reaction_time(req: ReactionTimeRequest):
    """
    Get a human-like reaction time.
    """
    injector = create_error_injector(skill_level=req.skill_level)

    # Simulate fatigue
    for _ in range(req.fatigue_turns):
        injector.update_state()

    reaction_ms = injector.get_reaction_time(is_critical=req.is_critical)

    return {
        "ok": True,
        "data": {
            "reaction_ms": reaction_ms,
            "fatigue_level": injector.fatigue_level,
            "skill_tier": injector.skill_tier,
        }
    }


@router.post("/flavor")
async def generate_flavor_text(req: FlavorTextRequest):
    """
    Generate flavor text for an action.
    """
    flavor = _generate_battle_flavor(
        action=req.action,
        tendency=req.tendency,
        hp_ratio=req.hp_ratio,
        playstyle=req.playstyle,
        enemy_hp_ratio=req.enemy_hp_ratio,
    )

    return {
        "ok": True,
        "data": {
            "flavor_text": flavor,
            "action": req.action,
            "tendency": req.tendency,
        }
    }


@router.get("/playstyles")
async def get_playstyles():
    """
    Get available bot playstyles.
    """
    playstyle_info = []
    for style in PLAYSTYLES:
        pfa = PFABehaviorModel(style)
        config = pfa.PERSONALITIES[style]
        playstyle_info.append({
            "name": style,
            "states": config['states'],
            "initial_state": config['initial'],
            "hp_threshold_retreat": config.get('hp_threshold_retreat', 0.25),
            "description": _get_playstyle_description(style),
        })

    return {
        "ok": True,
        "data": {
            "playstyles": playstyle_info,
        }
    }


def _generate_battle_flavor(
    action: str,
    tendency: str,
    hp_ratio: float,
    playstyle: str,
    enemy_hp_ratio: float = 1.0,
) -> str:
    """Generate contextual flavor text for battle actions."""
    import random

    # Action flavor templates
    action_flavors = {
        'strike': [
            "swings with determination",
            "delivers a solid strike",
            "attacks with focus",
            "goes for a direct hit",
        ],
        'guard': [
            "raises their guard",
            "takes a defensive stance",
            "prepares to block",
            "braces for impact",
        ],
        'quick': [
            "darts in with a quick jab",
            "strikes swiftly",
            "lands a fast attack",
            "moves with speed",
        ],
        'block': [
            "hunkers down behind their shield",
            "goes into full defense",
            "prepares for anything",
            "focuses entirely on blocking",
        ],
        'heavy': [
            "winds up for a massive blow",
            "puts everything into one strike",
            "goes all-in with a power attack",
            "swings with full force",
        ],
        'heal': [
            "takes a moment to recover",
            "focuses on healing",
            "catches their breath",
            "tends to their wounds",
        ],
    }

    # Get base flavor
    flavors = action_flavors.get(action, ["makes a move"])
    flavor = random.choice(flavors)

    # Add context based on HP
    if hp_ratio < 0.2:
        flavor += ", desperately"
    elif hp_ratio < 0.4:
        flavor += ", looking worried"
    elif enemy_hp_ratio < 0.2:
        flavor += ", sensing victory"

    # Add playstyle flavor occasionally
    if random.random() < 0.3:
        playstyle_additions = {
            'aggressive': " with aggressive energy",
            'defensive': " cautiously",
            'balanced': " with calculated precision",
            'chaotic': " unpredictably",
        }
        flavor += playstyle_additions.get(playstyle, "")

    return flavor.capitalize() + "."


def _get_playstyle_description(playstyle: str) -> str:
    """Get description for a playstyle."""
    descriptions = {
        'aggressive': "Favors attacking and applying pressure. Only retreats when critically low on HP.",
        'defensive': "Prefers guarding and waiting for counter opportunities. More cautious with HP.",
        'balanced': "Adapts between offense and defense based on situation. Well-rounded approach.",
        'chaotic': "Completely unpredictable. Equal chance of any action regardless of situation.",
    }
    return descriptions.get(playstyle, "Unknown playstyle")
