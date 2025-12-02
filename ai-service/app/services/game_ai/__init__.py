"""
Game AI package for human-like game opponents.
Provides tactical decision making for various minigames.
"""

from .battle_bot import TacticalBattleBot, get_battle_bot
from .pfa_behavior import PFABehaviorModel, PLAYSTYLES
from .error_injector import HumanLikeErrorInjector, create_error_injector

__all__ = [
    "TacticalBattleBot",
    "get_battle_bot",
    "PFABehaviorModel",
    "PLAYSTYLES",
    "HumanLikeErrorInjector",
    "create_error_injector",
]
