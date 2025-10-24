"""
AI Service Configuration - Complete
"""

import os
from typing import List, Literal, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # ===== Service =====
    SERVICE_NAME: str = Field(default="communiverse-ai-service", env="SERVICE_NAME")  # type: ignore
    SERVICE_VERSION: str = Field(default="2.0.0", env="SERVICE_VERSION")  # type: ignore
    HOST: str = Field(default="0.0.0.0", env="HOST")  # type: ignore
    PORT: int = Field(default=8000, env="PORT")  # type: ignore
    LOG_LEVEL: str = Field(default="info", env="LOG_LEVEL")  # type: ignore
    DEBUG: bool = Field(default=True, env="DEBUG")  # type: ignore

    # ===== Models / Cache / Device =====
    LLM_MODEL: str = Field(default="deepspek", env="LLM_MODEL")  # type: ignore
    VLM_MODEL: str = Field(default="qwen-v1", env="VLM_MODEL")  # type: ignore
    EMBED_MODEL: str = Field(default="BAAI/bge-m3", env="EMBED_MODEL")  # type: ignore
    MODEL_CACHE_DIR: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/models", env="MODEL_CACHE_DIR")  # type: ignore
    DEVICE: str = Field(default="cuda", env="DEVICE")  # type: ignore
    HF_TOKEN: str = Field(default="", env="HF_TOKEN")  # type: ignore

    # ===== CORS / Preload =====
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"], env="CORS_ORIGINS"  # type: ignore
    )
    PRELOAD_LLM: bool = Field(default=False, env="PRELOAD_LLM")  # type: ignore
    PRELOAD_VLM: bool = Field(default=False, env="PRELOAD_VLM")  # type: ignore
    PRELOAD_EMBEDDINGS: bool = Field(default=False, env="PRELOAD_EMBEDDINGS")  # type: ignore

    # ===== Hardware =====
    USE_8BIT: bool = Field(default=True, env="USE_8BIT")  # type: ignore
    USE_4BIT: bool = Field(default=False, env="USE_4BIT")  # type: ignore
    MAX_MEMORY_GB: Optional[int] = Field(default=None, env="MAX_MEMORY_GB")  # type: ignore

    # ===== Generation Defaults (OPTIMIZED) =====
    DEFAULT_MAX_TOKENS: int = Field(default=2048, env="DEFAULT_MAX_TOKENS")  # type: ignore
    DEFAULT_TEMPERATURE: float = Field(default=0.75, env="DEFAULT_TEMPERATURE")  # type: ignore
    DEFAULT_TOP_P: float = Field(default=0.92, env="DEFAULT_TOP_P")  # type: ignore

    # ===== Performance =====
    MAX_BATCH_SIZE: int = Field(default=8, env="MAX_BATCH_SIZE")  # type: ignore
    MODEL_LOAD_TIMEOUT: int = Field(default=300, env="MODEL_LOAD_TIMEOUT")  # type: ignore
    GENERATION_TIMEOUT: int = Field(default=60, env="GENERATION_TIMEOUT")  # type: ignore

    # ===== API / Metrics =====
    API_KEY: Optional[str] = Field(default=None, env="API_KEY")  # type: ignore
    METRICS_ENABLED: bool = Field(default=True, env="METRICS_ENABLED")  # type: ignore
    METRICS_PORT: int = Field(default=9091, env="METRICS_PORT")  # type: ignore

    # ===== Rate Limiting (new scheme) =====
    RATE_LIMIT_ENABLED: bool = Field(default=True, env="RATE_LIMIT_ENABLED")  # type: ignore
    RATE_LIMIT_REQUESTS: int = Field(default=100, env="RATE_LIMIT_REQUESTS")  # type: ignore
    RATE_LIMIT_WINDOW: int = Field(default=60, env="RATE_LIMIT_WINDOW")  # type: ignore

    # ===== Agent (consolidated) =====
    AGENT_MAX_STEPS: int = Field(default=10, env="AGENT_MAX_STEPS")  # type: ignore
    AGENT_MAX_RETRIES: int = Field(default=3, env="AGENT_MAX_RETRIES")  # type: ignore
    AGENT_TIMEOUT: int = Field(default=60, env="AGENT_TIMEOUT")  # type: ignore
    AGENT_REASONING_ENABLED: bool = Field(default=True, env="AGENT_REASONING_ENABLED")  # type: ignore
    AGENT_PARALLEL_TOOLS: bool = Field(default=True, env="AGENT_PARALLEL_TOOLS")  # type: ignore

    # ===== RAG / Vector / BM25 / Hybrid =====
    VECTOR_DB_PATH: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/vector_db", env="VECTOR_DB_PATH")  # type: ignore
    VECTOR_DIM: int = Field(default=1024, env="VECTOR_DIM")  # type: ignore
    VECTOR_METRIC: Literal["cosine", "euclidean", "dot"] = Field(
        default="cosine", env="VECTOR_METRIC"  # type: ignore
    )

    BM25_INDEX_PATH: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/bm25_index", env="BM25_INDEX_PATH")  # type: ignore
    BM25_K1: float = Field(default=1.2, env="BM25_K1")  # type: ignore
    BM25_B: float = Field(default=0.75, env="BM25_B")  # type: ignore

    HYBRID_ALPHA: float = Field(default=0.5, env="HYBRID_ALPHA")  # type: ignore

    # Search parameters (OPTIMIZED)
    RAG_TOP_K: int = Field(default=10, env="RAG_TOP_K")  # type: ignore
    RAG_MMR_SCORE: float = Field(default=0.5, env="RAG_MMR_SCORE")  # type: ignore
    RAG_RERANK: bool = Field(default=False, env="RAG_RERANK")  # type: ignore
    RAG_RERANK_MODEL: str = Field(
        default="BAAI/bge-reranker-base", env="RAG_RERANK_MODEL"  # type: ignore
    )

    # ===== Story（如使用到） =====
    STORY_DB_PATH: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/stories", env="STORY_DB_PATH")  # type: ignore
    STORY_SEARCH_ENABLED: bool = Field(default=False, env="STORY_SEARCH_ENABLED")  # type: ignore
    STORY_CONTEXT_WINDOW: int = Field(default=10, env="STORY_CONTEXT_WINDOW")  # type: ignore
    STORY_SAVE_INTERVAL: int = Field(default=1, env="STORY_SAVE_INTERVAL")  # type: ignore

    # ===== MongoDB =====
    MONGODB_URI: str = Field(default="mongodb://localhost:27017", env="MONGODB_URI")  # type: ignore
    MONGODB_DB: str = Field(default="communiverse_bot", env="MONGODB_DB")  # type: ignore

    # ===== Fine-tuning =====
    FINETUNE_OUTPUT_DIR: str = Field(
        default="/mnt/c/AI_LLM_projects/ai_warehouse/fine_tuned_models", env="FINETUNE_OUTPUT_DIR"  # type: ignore
    )
    TRAINING_DATA_DIR: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/training_data", env="TRAINING_DATA_DIR")  # type: ignore
    FINETUNE_DATA_DIR: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/fine_tuned_data", env="FINETUNE_DATA_DIR")  # type: ignore
    FINETUNE_CHECKPOINT_DIR: str = Field(
        default="./checkpoints", env="FINETUNE_CHECKPOINT_DIR"  # type: ignore
    )

    FINETUNE_BATCH_SIZE: int = Field(default=4, env="FINETUNE_BATCH_SIZE")  # type: ignore
    FINETUNE_LEARNING_RATE: float = Field(default=2e-4, env="FINETUNE_LEARNING_RATE")  # type: ignore
    FINETUNE_EPOCHS: int = Field(default=3, env="FINETUNE_EPOCHS")  # type: ignore
    FINETUNE_WARMUP_STEPS: int = Field(default=100, env="FINETUNE_WARMUP_STEPS")  # type: ignore

    # LoRA
    LORA_R: int = Field(default=8, env="LORA_R")  # type: ignore
    LORA_ALPHA: int = Field(default=32, env="LORA_ALPHA")  # type: ignore
    LORA_DROPOUT: float = Field(default=0.05, env="LORA_DROPOUT")  # type: ignore
    LORA_TARGET_MODULES: str = Field(default="q_proj,v_proj", env="LORA_TARGET_MODULES")  # type: ignore

    # Dataset / Token
    HFX_TOKEN: Optional[str] = Field(default=None, env="HFX_TOKEN")  # type: ignore
    DATASET_CACHE_DIR: str = Field(default="/mnt/c/AI_LLM_projects/ai_warehouse/datasets", env="DATASET_CACHE_DIR")  # type: ignore

    # ===== Fine-Tuned Model =====
    FINETUNED_MODEL_ENABLED: bool = Field(default=True, env="FINETUNED_MODEL_ENABLED")  # type: ignore
    FINETUNED_BASE_MODEL: str = Field(default="deepseek-ai/deepseek-llm-7b-chat", env="FINETUNED_BASE_MODEL")  # type: ignore
    FINETUNED_ADAPTER_PATH: str = Field(
        default="/mnt/c/web-projects/elioverse-bot/models/sft_lora_balanced",
        env="FINETUNED_ADAPTER_PATH"
    )  # type: ignore
    FINETUNED_USE_FOR_PERSONAS: bool = Field(default=True, env="FINETUNED_USE_FOR_PERSONAS")  # type: ignore

    # ===== Web Search (consolidated) =====
    WEB_SEARCH_ENABLED: bool = Field(default=True, env="WEB_SEARCH_ENABLED")  # type: ignore
    WEB_SEARCH_API_KEY: str = Field(default="", env="WEB_SEARCH_API_KEY")  # type: ignore
    WEB_SEARCH_MAX_RESULTS: int = Field(default=5, env="WEB_SEARCH_MAX_RESULTS")  # type: ignore
    WEB_SEARCH_TIMEOUT: int = Field(default=10, env="WEB_SEARCH_TIMEOUT")  # type: ignore
    BRAVE_API_KEY: Optional[str] = Field(default=None, env="BRAVE_API_KEY")  # type: ignore

    # >>> pydantic v2 settings config <<<
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",  # ignore other uninitialized .env variables ()Extra inputs are not permitted）
    )


settings = Settings()

# Model Registry
MODEL_REGISTRY = {
    # LLM Models
    "deepseek": "deepseek-ai/deepseek-llm-7b-chat",
    "deepseek-coder": "deepseek-ai/deepseek-coder-6.7b-instruct",
    "llama3": "meta-llama/Meta-Llama-3-8B-Instruct",
    "llama3.1": "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "qwen25": "Qwen/Qwen2.5-7B-Instruct",
    "qwen25-coder": "Qwen/Qwen2.5-Coder-7B-Instruct",
    "mistral": "mistralai/Mistral-7B-Instruct-v0.2",
    # VLM Models
    "qwen-vl": "Qwen/Qwen-VL-Chat",
    "llava-next": "llava-hf/llava-v1.6-mistral-7b-hf",
    # Embeddings Models
    "bge-m3": "BAAI/bge-m3",
    "gte-large-zh-en": "thenlper/gte-large-zh",
    "e5-large-v2": "intfloat/e5-large-v2",
    "bge-large-en": "BAAI/bge-large-en-v1.5",
}


def get_model_id(alias: str) -> str:
    """Get HuggingFace model ID from alias"""
    return MODEL_REGISTRY.get(alias, alias)
