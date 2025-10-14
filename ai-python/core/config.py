# -*- coding: utf-8 -*-
"""Config reader for the AI sidecar. All code/comments in English only."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class Features:
    enable_chat: bool = True
    enable_rag: bool = True
    enable_agent: bool = True
    enable_vqa: bool = True
    enable_caption: bool = True
    preload_models: bool = bool(int(os.getenv("FEATURES__PRELOAD_MODELS", "0")))

# ---------- API misc ----------
@dataclass
class APISettings:
    cors_origins_list: List[str] = field(
        default_factory=lambda: os.getenv("API_CORS_ORIGINS", "*").split(",")
    )
    search_allowlist: List[str] = field(
        default_factory=lambda: [d for d in os.getenv("API_SEARCH_ALLOWLIST", "").split(",") if d]
    )

# ---------- LLM ----------
@dataclass
class LLMModels:
    # Prefer a small local model name; fallback is rule-based
    chat_model: str = field(
        default_factory=lambda: os.getenv("LLM_MODEL")
        or os.getenv("LLM__CHAT_MODEL")
        or os.getenv("LLM_CHAT_MODEL")
        or "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    )
    device: str = field(default_factory=lambda: os.getenv("LLM__DEVICE", os.getenv("LLM_DEVICE", "auto")))
    dtype: str = field(default_factory=lambda: os.getenv("LLM__DTYPE", os.getenv("LLM_DTYPE", "auto")))



# ---------- Embeddings ----------
@dataclass
class EmbeddingsCfg:
    model_name: str = field(default_factory=lambda: os.getenv("EMBED__MODEL", "BAAI/bge-m3"))
    device: str = field(default_factory=lambda: os.getenv("EMBED__DEVICE", "cpu"))

# ---------- VLM ----------
@dataclass
class VLMModels:
    caption_model: str = field(default_factory=lambda: os.getenv("VLM__CAPTION_MODEL", "Salesforce/blip-image-captioning-large"))
    vqa_model: str = field(default_factory=lambda: os.getenv("VLM__VQA_MODEL", "llava-hf/llava-1.5-7b-hf"))
    device: str = field(default_factory=lambda: os.getenv("VLM__DEVICE", "auto"))

# ---------- Mongo/RAG ----------
@dataclass
class MongoCfg:
    uri: str = field(default_factory=lambda: os.getenv("MONGO_URI", ""))
    db: str = field(default_factory=lambda: os.getenv("MONGO_DB", "communiverse"))
    coll_chunks: str = field(default_factory=lambda: os.getenv("MONGO_COLL_RAG", "rag_chunks"))
    coll_docs: str = field(default_factory=lambda: os.getenv("MONGO_COLL_RAG_DOCS", "rag_docs"))
    rag_backend: str = field(default_factory=lambda: os.getenv("RAG__BACKEND", "avs"))
    avs_index: str = field(default_factory=lambda: os.getenv("RAG__AVS_INDEX", "rag_chunks_avs"))
    text_index: str = field(default_factory=lambda: os.getenv("RAG__TEXT_INDEX", "rag_text_search"))


# ---------- Root Config ----------
@dataclass
class Config:
    features: Features = field(default_factory=Features)
    api: APISettings = field(default_factory=APISettings)
    llm_models: LLMModels = field(default_factory=LLMModels)
    embeddings: EmbeddingsCfg = field(default_factory=EmbeddingsCfg)
    vlm_models: VLMModels = field(default_factory=VLMModels)
    mongo: MongoCfg = field(default_factory=MongoCfg)

    # Derived/runtime values
    @property
    def resolved_llm_device(self) -> str:
        """auto -> cuda if available, else cpu"""
        d = (self.llm_models.device or "auto").lower()
        if d != "auto":
            return d
        try:
            import torch  # type: ignore
            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

_SINGLETON: Config | None = None

def get_config() -> Config:
    global _SINGLETON
    if _SINGLETON is None:
        _SINGLETON = Config()
    return _SINGLETON