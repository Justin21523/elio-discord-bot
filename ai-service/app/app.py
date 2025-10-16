"""
AI Microservice for Communiverse Bot
Main application entry point
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.models.manager import ModelManager
from app.services.rag.search import RAGSearchService
from app.services.agent.core import AgentOrchestrator
from app.services.story.manager import StoryManager
from app.utils.logger import setup_logger
from app.dependencies import (
    set_model_manager,
    set_rag_service,
    set_agent_orchestrator,
    set_story_manager,
)

# Import all routers
from app.api.routers import (
    llm_router,
    vlm_router,
    embeddings_router,
    rag_router,
    agent_router,
    story_router,
    finetuning_router,
    moderation_router,
)

# Setup logging
logger = setup_logger(__name__)

# Global instances (for backward compatibility)
model_manager: ModelManager = None  # type: ignore
rag_service: RAGSearchService = None  # type: ignore
agent_orchestrator: AgentOrchestrator = None  # type: ignore
story_manager: StoryManager = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for model loading and cleanup"""
    global model_manager, rag_service, agent_orchestrator, story_manager

    logger.info("[BOOT] Starting AI Microservice...")
    logger.info(f"[BOOT] LLM Model: {settings.LLM_MODEL}")
    logger.info(f"[BOOT] VLM Model: {settings.VLM_MODEL}")
    logger.info(f"[BOOT] Embedding Model: {settings.EMBED_MODEL}")

    try:
        # Initialize model manager
        model_manager = ModelManager(
            llm_model=settings.LLM_MODEL,
            vlm_model=settings.VLM_MODEL,
            embed_model=settings.EMBED_MODEL,
            device=settings.DEVICE,
            cache_dir=settings.MODEL_CACHE_DIR,
        )

        # Preload models based on configuration
        if settings.PRELOAD_LLM:
            logger.info("[BOOT] Preloading LLM...")
            await model_manager.get_llm()

        if settings.PRELOAD_VLM:
            logger.info("[BOOT] Preloading VLM...")
            await model_manager.get_vlm()

        if settings.PRELOAD_EMBEDDINGS:
            logger.info("[BOOT] Preloading Embeddings...")
            await model_manager.get_embeddings()

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

        # Set global dependencies (for backward compatibility)
        set_model_manager(model_manager)
        set_rag_service(rag_service)
        set_agent_orchestrator(agent_orchestrator)
        set_story_manager(story_manager)

        # Store in app state (FastAPI Depends will access these)
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
        if model_manager:
            if hasattr(model_manager, "cleanup"):
                await model_manager.cleanup()
        if rag_service:
            await rag_service.close()
        if story_manager:
            await story_manager.close()
        logger.info("[SHUTDOWN] AI Microservice stopped")


# Create FastAPI app
app = FastAPI(
    title="Communiverse AI Service",
    description="AI Backend for Discord Bot - LLM, VLM, Embeddings, RAG",
    version="1.0.0",
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
                "code": "AI_MODEL_ERROR",
                "message": "Internal server error occurred",
                "details": {"type": type(exc).__name__},
            },
        },
    )


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "ok": True,
        "data": {
            "status": "healthy",
            "llm_model": settings.LLM_MODEL,
            "vlm_model": settings.VLM_MODEL,
            "embed_model": settings.EMBED_MODEL,
            "device": settings.DEVICE,
        },
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Communiverse AI Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "llm": "/llm/*",
            "vlm": "/vlm/*",
            "embed": "/embed/*",
            "rag": "/rag/*",
            "agent": "/agent/*",
            "story": "/story/*",
            "finetune": "/finetune/*",
            "moderation": "/moderation/*",
        },
    }


# Include all routers
app.include_router(llm_router.router, prefix="/llm", tags=["LLM"])
app.include_router(vlm_router.router, prefix="/vlm", tags=["VLM"])
app.include_router(embeddings_router.router, prefix="/embed", tags=["Embeddings"])
app.include_router(rag_router.router, prefix="/rag", tags=["RAG"])
app.include_router(agent_router.router, prefix="/agent", tags=["Agent"])
app.include_router(story_router.router, prefix="/story", tags=["Story"])
app.include_router(finetuning_router.router, prefix="/finetune", tags=["Finetuning"])
app.include_router(moderation_router.router, prefix="/moderation", tags=["Moderation"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
