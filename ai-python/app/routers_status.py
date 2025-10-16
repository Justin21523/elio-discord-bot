# -*- coding: utf-8 -*-
"""Status & version endpoints."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from core.config import get_config

router = APIRouter()
_cfg = get_config()


@router.get("/version")
def version() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "communiverse-ai-sidecar",
        "version": "0.1.0",
        "features": {
            "llm": _cfg.features.enable_chat,
            "rag": _cfg.features.enable_rag,
            "vlm": _cfg.features.enable_vqa or _cfg.features.enable_caption,
            "agent": _cfg.features.enable_agent,
        },
        "models": {
            "llm": _cfg.llm_models.chat_model,
            "embeddings": _cfg.embeddings.model_name,
        },
    }

@router.get("/health")
def health() -> Dict[str, Any]:
    try:
        import torch  # type: ignore
        cuda_ok = torch.cuda.is_available()
        cuda_count = torch.cuda.device_count() if cuda_ok else 0
        cuda_name = torch.cuda.get_device_name(0) if cuda_ok and cuda_count > 0 else None
        torch_version = torch.__version__
    except Exception as e:
        cuda_ok, cuda_count, cuda_name, torch_version = False, 0, None, f"torch import failed: {e!r}"

    return {
        "ok": True,
        "service": "ai-python",
        "torch": {
            "version": torch_version,
            "cuda_available": cuda_ok,
            "cuda_device_count": cuda_count,
            "cuda_device_0": cuda_name,
        },
        "message": "healthy",
    }

@router.get("/debug/torch")
def debug_torch() -> Dict[str, Any]:
    import torch
    info = {
        "torch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        "current_device": torch.cuda.current_device() if torch.cuda.is_available() else None,
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() and torch.cuda.device_count() > 0 else None,
    }
    return {"ok": True, "torch": info}

@router.get("/debug/faiss")
def debug_faiss() -> Dict[str, Any]:
    try:
        import faiss  # type: ignore
        opts = faiss.get_compile_options()
        return {"ok": True, "faiss_compile_options": opts}
    except Exception as e:
        return {"ok": False, "error": f"faiss import/inspect failed: {e!r}"}


@router.get("/llm/ping")
def llm_ping() -> Dict[str, Any]:
    # Lightweight: only report configured model id; no inference to keep it fast.
    import os
    model_id = os.getenv("LLM_MODEL") or os.getenv("LLM__CHAT_MODEL") or "unset"
    backend = os.getenv("LLM_BACKEND") or os.getenv("AI_BACKEND") or "python"
    return {"ok": True, "backend": backend, "model": model_id}


@router.post("/llm/test")
def llm_test(prompt: str = "Hello, world. Keep it short.") -> Dict[str, Any]:
    """
    Optional smoke test. This tries to run a very small generation.
    If your model is large (e.g., Qwen 7B) on CPU, it can be slow; enable only when needed.
    """
    try:
        from core.llm import EnhancedLLMAdapter  # type: ignore
        adapter = EnhancedLLMAdapter()
        result = adapter.generate_text(prompt, max_length=16, temperature=0.7)
        return {"ok": True, "prompt": prompt, "text": result[:512]}
    except Exception as e:
        return {"ok": False, "error": repr(e)}


@router.get("/llm/check")
def llm_check():
    try:
        from core.llm import EnhancedLLMAdapter  # type: ignore
        llm = EnhancedLLMAdapter()
        llm._ensure_backend()  # force load
        return {"ok": True, "model": llm.model_name, "backend_ready": llm._backend is not None}
    except Exception as e:
        return {"ok": False, "error": repr(e)}
