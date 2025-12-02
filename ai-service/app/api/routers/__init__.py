"""
API Routers Package
Exposes all route modules for the AI service
"""

from . import llm_router
from . import vlm_router
from . import embeddings_router
from . import rag_router
from . import agent_router
from . import story_router
from . import finetuning_router
from . import moderation_router
from . import markov_router
from . import recs_router
from . import ir_router
from . import persona_logic_router
from . import hybrid_router
from . import game_ai_router

__all__ = [
    "llm_router",
    "vlm_router",
    "embeddings_router",
    "rag_router",
    "agent_router",
    "story_router",
    "finetuning_router",
    "moderation_router",
    "markov_router",
    "recs_router",
    "ir_router",
    "persona_logic_router",
    "hybrid_router",
    "game_ai_router",
]
