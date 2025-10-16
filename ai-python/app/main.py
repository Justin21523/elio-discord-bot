# -*- coding: utf-8 -*-
"""
FastAPI entrypoint for Communiverse Bot's AI sidecar.

Modules:
- /health
- /llm     (chat, generate)
- /rag     (upsert, search, answer)
- /vlm     (caption, vqa)
- /agent   (task orchestration with tools)
- /embeddings (encode)

All code and comments in English only.
"""

from __future__ import annotations

import logging
import os
from typing import Dict

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers_llm import router as llm_router
from .routers_rag import router as rag_router
from .routers_vlm import router as vlm_router
from .routers_agent import router as agent_router
from .routers_embeddings import router as embeddings_router
from .routers_persona import router as persona_router
from .routers_moderation import router as moderation_router
from .routers_persona import router as persona_router
from .routers_moderation import router as moderation_router
from .routers_websearch import router as websearch_router
from .routers_images import router as images_router
from .routers_dataset import router as dataset_router
from .routers_admin import router as admin_router
from .routers_status import router as status_router

# Pull config from core package (uploaded project)
from core.config import get_config
from core.exceptions import MultiModalLabError

logger = logging.getLogger("ai-python.app")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

config = get_config()

# ---- lifespan: replace deprecated app.on_event("startup") ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/Shutdown lifecycle using FastAPI lifespan API.

    Startup:
      - Optionally preload light models to warm tokenizer/model caches.
    Shutdown:
      - Place cleanup logic here if needed in the future.
    """
    # ----- Startup -----
    if getattr(config.features, "preload_models", False):
        logger.info("Preloading models on startup...")
        try:
            # Lazy import to avoid hard dependencies during cold boot
            from core.llm import EnhancedLLMAdapter  # type: ignore
            from core.vlm import VLMEngine  # type: ignore
            from core.rag import get_embedding_manager  # type: ignore

            # Warm-up LLM (very tiny call) – non-blocking if it fails
            try:
                _llm = EnhancedLLMAdapter()
                _ = _llm.chat_completion(
                    messages=[{"role": "user", "content": "ping"}],
                    max_length=8,
                    temperature=0.0,
                )
            except Exception as e:
                logger.warning("LLM warmup skipped: %s", e)

            # We don't preload VLM weights to save VRAM; they will auto-load on first call.
            # VLMEngine is imported above to validate that module is importable.

            # Warm embeddings manager/registry
            try:
                _ = get_embedding_manager()
            except Exception as e:
                logger.warning("Embeddings manager warmup skipped: %s", e)

            logger.info("Preload completed.")
        except Exception as e:
            logger.warning("Preload failed (continuing lazy-load mode): %s", e)

    # yield control to the application (serving requests)
    yield

    # ----- Shutdown -----
    # If you later keep global state or GPU tensors, clean them here.
    # e.g., close db pools, flush traces, etc.
    logger.info("Shutting down ai-python service.")

app = FastAPI(
    title="Communiverse AI Sidecar",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ---- CORS (adjust per need) ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Basic latency logging middleware."""
    from time import perf_counter

    start = perf_counter()
    try:
        response = await call_next(request)
        return response
    finally:
        duration = perf_counter() - start
        logger.info(
            "[HTTP] %s %s %0.3fs", request.method, request.url.path, duration
        )


@app.exception_handler(MultiModalLabError)
async def multimodal_error_handler(_: Request, exc: MultiModalLabError):
    """Uniform error response for core exceptions."""
    return JSONResponse(
        status_code=400,
        content={
            "ok": False,
            "error": {
                "code": "AI_MODEL_ERROR",
                "message": str(exc),
            },
        },
    )

# Mount feature routers
app.include_router(llm_router, prefix="/llm", tags=["llm"])
app.include_router(rag_router, prefix="/rag", tags=["rag"])
app.include_router(vlm_router, prefix="/vlm", tags=["vlm"])
app.include_router(agent_router, prefix="/agent", tags=["agent"])
app.include_router(embeddings_router, prefix="/embeddings", tags=["embeddings"])
app.include_router(llm_router, prefix="/llm", tags=["llm"])
app.include_router(rag_router, prefix="/rag", tags=["rag"])
app.include_router(vlm_router, prefix="/vlm", tags=["vlm"])
app.include_router(agent_router, prefix="/agent", tags=["agent"])
app.include_router(embeddings_router, prefix="/embeddings", tags=["embeddings"])
app.include_router(moderation_router, prefix="/moderation", tags=["moderation"])
app.include_router(persona_router, prefix="/persona", tags=["persona"])
app.include_router(websearch_router, prefix="/web", tags=["web"])
app.include_router(images_router, prefix="/images", tags=["images"])
app.include_router(dataset_router, prefix="/dataset", tags=["dataset"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(status_router, prefix="/status", tags=["status"])



@app.get("/")
def root():
    return {"ok": True, "service": "ai-python", "version": "1.1.0"}

@app.get("/health")
async def health() -> Dict[str, object]:
    """Liveness / readiness endpoint."""
    return {
        "ok": True,
        "service": "communiverse-ai-sidecar",
        "features": {
            "llm": config.features.enable_chat,
            "rag": config.features.enable_rag,
            "vlm": config.features.enable_vqa or config.features.enable_caption,
            "agent": config.features.enable_agent,
        },
    }


