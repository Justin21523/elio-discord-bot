"""
AI Microservice for Communiverse Bot
Main application entry point

Supports two modes:
- CPU-Only Mode: Traditional ML features (BM25, N-gram, SVM, Naive Bayes, Markov, etc.)
- Full Mode: All features including LLM, VLM, Embeddings (requires GPU)
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.utils.logger import setup_logger

# Setup logging
logger = setup_logger(__name__)

# Global instances
model_manager = None
rag_service = None
agent_orchestrator = None
story_manager = None


def is_cpu_only_mode() -> bool:
    """Check if running in CPU-only mode"""
    return settings.CPU_ONLY or not settings.USE_GPU


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for service initialization"""
    global model_manager, rag_service, agent_orchestrator, story_manager

    cpu_only = is_cpu_only_mode()

    logger.info("[BOOT] Starting AI Microservice...")
    logger.info(f"[BOOT] Mode: {'CPU-Only (Traditional ML)' if cpu_only else 'Full (GPU)'}")
    logger.info(f"[BOOT] Device: {settings.DEVICE}")

    try:
        if cpu_only:
            # CPU-Only Mode: Only load traditional ML services
            logger.info("[BOOT] Initializing CPU-only traditional ML services...")

            # Initialize lightweight services for traditional ML
            from app.services.markov import MarkovModel
            from app.services.persona_logic import PersonaLogicEngine
            # ir.py uses standalone functions, no class to initialize

            app.state.markov_model = MarkovModel()
            app.state.persona_logic_engine = PersonaLogicEngine()

            # Set reference for hot-reload functionality
            from app.api.routers.reload_router import set_persona_logic_engine
            set_persona_logic_engine(app.state.persona_logic_engine)

            # Set placeholders for GPU services
            app.state.model_manager = None
            app.state.rag_service = None
            app.state.agent_orchestrator = None
            app.state.story_manager = None

            logger.info("[BOOT] Traditional ML services initialized")
            logger.info("[BOOT] Available features: BM25, N-gram, Markov, IR, Intent, Sentiment, Persona Logic")

        else:
            # Full Mode: Load all services including GPU-based models
            logger.info("[BOOT] Initializing full AI services (requires GPU)...")

            from app.models.manager import ModelManager
            from app.services.rag.search import RAGSearchService
            from app.services.agent.core import AgentOrchestrator
            from app.services.story.manager import StoryManager
            from app.dependencies import (
                set_model_manager,
                set_rag_service,
                set_agent_orchestrator,
                set_story_manager,
            )

            # Initialize model manager
            model_manager = ModelManager(
                llm_model=settings.LLM_MODEL,
                vlm_model=settings.VLM_MODEL,
                embed_model=settings.EMBED_MODEL,
                device=settings.DEVICE,
                cache_dir=settings.MODEL_CACHE_DIR,
            )

            # Preload models based on configuration
            if settings.PRELOAD_LLM and settings.USE_LLM:
                logger.info("[BOOT] Preloading LLM...")
                model_manager.load_model(settings.LLM_MODEL, "llm")

            if settings.PRELOAD_VLM and settings.USE_VLM:
                logger.info("[BOOT] Preloading VLM...")
                model_manager.load_model(settings.VLM_MODEL, "vlm")

            if settings.PRELOAD_EMBEDDINGS and settings.USE_EMBEDDINGS:
                logger.info("[BOOT] Preloading Embeddings...")
                model_manager.load_model(settings.EMBED_MODEL, "embeddings")

            # Initialize RAG service
            rag_service = RAGSearchService(
                mongodb_uri=settings.MONGODB_URI,
                db_name=settings.MONGODB_DB,
                model_manager=model_manager,
            )

            # Initialize agent orchestrator
            agent_orchestrator = AgentOrchestrator(
                model_manager=model_manager, rag_service=rag_service
            )

            # Initialize story manager
            story_manager = StoryManager()
            await story_manager.initialize()

            # Set global dependencies
            set_model_manager(model_manager)
            set_rag_service(rag_service)
            set_agent_orchestrator(agent_orchestrator)
            set_story_manager(story_manager)

            # Store in app state
            app.state.model_manager = model_manager
            app.state.rag_service = rag_service
            app.state.agent_orchestrator = agent_orchestrator
            app.state.story_manager = story_manager

        logger.info("[BOOT] AI Microservice ready!")
        yield

    except Exception as e:
        logger.error(f"[ERR] Failed to initialize: {e}", exc_info=True)
        raise
    finally:
        # Cleanup
        logger.info("[SHUTDOWN] Cleaning up...")
        if not cpu_only:
            if model_manager and hasattr(model_manager, "cleanup"):
                await model_manager.cleanup()
            if rag_service:
                await rag_service.close()
            if story_manager:
                await story_manager.close()
        logger.info("[SHUTDOWN] AI Microservice stopped")


# Create FastAPI app
app = FastAPI(
    title="Communiverse AI Service",
    description="AI Backend for Discord Bot - Traditional ML + Optional LLM/VLM",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"[ERR] Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "error": {
                "code": "AI_SERVICE_ERROR",
                "message": "Internal server error occurred",
                "details": {"type": type(exc).__name__},
            },
        },
    )


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    cpu_only = is_cpu_only_mode()
    return {
        "ok": True,
        "data": {
            "status": "healthy",
            "mode": "cpu-only" if cpu_only else "full",
            "device": settings.DEVICE,
            "features": {
                "bm25": settings.USE_BM25,
                "ngram": settings.USE_NGRAM,
                "intent": settings.USE_INTENT,
                "sentiment": settings.USE_SENTIMENT,
                "markov": settings.USE_MARKOV,
                "ir": settings.USE_IR,
                "persona_logic": settings.USE_PERSONA_LOGIC,
                "llm": not cpu_only and settings.USE_LLM,
                "vlm": not cpu_only and settings.USE_VLM,
                "embeddings": not cpu_only and settings.USE_EMBEDDINGS,
            },
        },
    }


@app.get("/")
async def root():
    """Root endpoint"""
    cpu_only = is_cpu_only_mode()
    endpoints = {
        "health": "/health",
        "docs": "/docs",
        # Traditional ML endpoints (always available)
        "markov": "/markov/*",
        "ir": "/ir/*",
        "recs": "/recs/*",
        "persona_logic": "/persona-logic/*",
        "hybrid": "/hybrid/*",
        "game_ai": "/game-ai/*",
    }

    if not cpu_only:
        # GPU-based endpoints
        endpoints.update({
            "llm": "/llm/*",
            "vlm": "/vlm/*",
            "embed": "/embed/*",
            "rag": "/rag/*",
            "agent": "/agent/*",
            "story": "/story/*",
            "finetune": "/finetune/*",
            "moderation": "/moderation/*",
            "persona": "/persona/*",
        })

    return {
        "service": "Communiverse AI Service",
        "version": "2.0.0",
        "mode": "cpu-only" if cpu_only else "full",
        "endpoints": endpoints,
    }


# Import and include routers based on mode
# Traditional ML routers (always loaded)
from app.api.routers import (
    markov_router,
    recs_router,
    ir_router,
    persona_logic_router,
    hybrid_router,
    game_ai_router,
    reload_router,
)

app.include_router(markov_router.router, prefix="/markov", tags=["Markov"])
app.include_router(recs_router.router, prefix="/recs", tags=["Recs"])
app.include_router(ir_router.router, prefix="/ir", tags=["IR"])
app.include_router(persona_logic_router.router, tags=["Persona-Logic"])
app.include_router(hybrid_router.router, tags=["Hybrid"])
app.include_router(game_ai_router.router, tags=["Game-AI"])
app.include_router(reload_router.router, tags=["Reload"])

# GPU-based routers (conditionally loaded)
if not is_cpu_only_mode():
    from app.api.routers import (
        llm_router,
        vlm_router,
        embeddings_router,
        rag_router,
        agent_router,
        story_router,
        finetuning_router,
        moderation_router,
        persona_router,
    )

    app.include_router(llm_router.router, prefix="/llm", tags=["LLM"])
    app.include_router(vlm_router.router, prefix="/vlm", tags=["VLM"])
    app.include_router(embeddings_router.router, prefix="/embed", tags=["Embeddings"])
    app.include_router(rag_router.router, prefix="/rag", tags=["RAG"])
    app.include_router(agent_router.router, prefix="/agent", tags=["Agent"])
    app.include_router(story_router.router, prefix="/story", tags=["Story"])
    app.include_router(finetuning_router.router, prefix="/finetune", tags=["Finetuning"])
    app.include_router(moderation_router.router, prefix="/moderation", tags=["Moderation"])
    app.include_router(persona_router.router, prefix="/persona", tags=["Persona"])


# Compatibility endpoints - only available in full mode
if not is_cpu_only_mode():
    @app.post("/v1/generate")
    async def v1_generate(payload: dict = Body(...)):
        """Legacy generate endpoint"""
        if app.state.model_manager is None:
            return JSONResponse(
                status_code=503,
                content={"ok": False, "error": {"code": "SERVICE_UNAVAILABLE", "message": "LLM not available in CPU-only mode"}}
            )
        manager = app.state.model_manager
        llm = await manager.get_llm()
        res = await llm.generate(
            system=payload.get("system_prompt", "") or None,
            prompt=payload.get("prompt", ""),
            max_tokens=int(payload.get("max_tokens", 512)),
            temperature=float(payload.get("temperature", 0.7)),
            top_p=float(payload.get("top_p", 0.9)),
        )
        text = (res or {}).get("text", "")
        usage = (res or {}).get("usage", {})
        return {"text": text, "tokens_used": usage.get("total_tokens", 0)}

    @app.post("/v1/chat")
    async def v1_chat(payload: dict = Body(...)):
        """Legacy chat endpoint"""
        if app.state.model_manager is None:
            return JSONResponse(
                status_code=503,
                content={"ok": False, "error": {"code": "SERVICE_UNAVAILABLE", "message": "LLM not available in CPU-only mode"}}
            )
        manager = app.state.model_manager
        llm = await manager.get_llm()
        system_msg = next(
            (m["content"] for m in payload.get("messages", []) if m.get("role") == "system"),
            None,
        )
        user_concat = "\n".join(
            [m["content"] for m in payload.get("messages", []) if m.get("role") in ("user", "assistant")]
        )
        res = await llm.generate(
            system=system_msg,
            prompt=user_concat,
            model_name=payload.get("model"),
            max_tokens=int(payload.get("max_tokens", 512)),
            temperature=float(payload.get("temperature", 0.7)),
            top_p=float(payload.get("top_p", 0.9)),
        )
        text = (res or {}).get("text", "")
        usage = (res or {}).get("usage", {})
        return {"text": text, "tokens_used": usage.get("total_tokens", 0)}

    @app.post("/v1/vision/describe")
    async def v1_vision_describe(payload: dict = Body(...)):
        """Legacy vision endpoint"""
        if app.state.model_manager is None:
            return JSONResponse(
                status_code=503,
                content={"ok": False, "error": {"code": "SERVICE_UNAVAILABLE", "message": "VLM not available in CPU-only mode"}}
            )
        manager = app.state.model_manager
        vlm = await manager.get_vlm()
        res = await vlm.describe_image(
            image_url=payload.get("image_url"),
            question=payload.get("question") or "Describe the image in detail.",
            max_tokens=int(payload.get("max_tokens", 256)),
        )
        return {
            "description": (res or {}).get("description") or (res or {}).get("text") or "",
            "tags": (res or {}).get("tags", []),
            "tokens_used": (res or {}).get("usage", {}).get("total_tokens", 0),
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
