"""
Model Manager - Handles loading and caching of AI models
"""

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from typing import Optional, Tuple, Dict, Any
import threading
from app.config import settings, get_model_id
from app.utils.logger import log_info, log_error, log_warning
from app.utils.metrics import model_load_duration_seconds, active_models
import time


class ModelManager:
    """
    Manages loading, caching, and lifecycle of AI models
    Thread-safe singleton pattern
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        llm_model: Optional[str] = None,
        vlm_model: Optional[str] = None,
        embed_model: Optional[str] = None,
        device: Optional[str] = None,
        cache_dir: Optional[str] = None,
    ):
        """
        Initialize ModelManager

        Args:
            llm_model: Default LLM model name
            vlm_model: Default VLM model name
            embed_model: Default embeddings model name
            device: Device to use (cuda/mps/cpu)
            cache_dir: Model cache directory
        """
        if self._initialized:
            return

        self.models: Dict[str, Any] = {}
        self.tokenizers: Dict[str, Any] = {}

        # Store model names
        self.llm_model_name = llm_model or settings.LLM_MODEL
        self.vlm_model_name = vlm_model or settings.VLM_MODEL
        self.embed_model_name = embed_model or settings.EMBED_MODEL

        # Store cache dir (override settings if provided)
        if cache_dir:
            settings.MODEL_CACHE_DIR = cache_dir

        # Store device preference
        if device:
            settings.DEVICE = device

        self.device = self._get_device()
        self._initialized = True

        log_info(
            "ModelManager initialized",
            device=str(self.device),
            use_8bit=settings.USE_8BIT,
            use_4bit=settings.USE_4BIT,
            llm_model=self.llm_model_name,
            vlm_model=self.vlm_model_name,
            embed_model=self.embed_model_name,
        )

    def _get_device(self) -> torch.device:
        """Determine the best available device"""
        if settings.DEVICE == "cuda" and torch.cuda.is_available():
            log_info("Using CUDA device", gpu_count=torch.cuda.device_count())
            return torch.device("cuda")
        elif settings.DEVICE == "mps" and torch.backends.mps.is_available():
            log_info("Using MPS (Apple Silicon) device")
            return torch.device("mps")
        else:
            log_warning("Using CPU device - this will be slow!")
            return torch.device("cpu")

    def load_model(self, model_name: str, model_type: str = "llm") -> Tuple[Any, Any]:
        """
        Load a model and its tokenizer

        Args:
            model_name: Model name or alias
            model_type: Type of model (llm, vlm, embeddings)

        Returns:
            Tuple of (model, tokenizer)
        """
        model_id = get_model_id(model_name)
        cache_key = f"{model_type}:{model_id}"

        # Return cached model if available
        if cache_key in self.models:
            log_info("Using cached model", model=model_id, type=model_type)
            return self.models[cache_key], self.tokenizers[cache_key]

        log_info("Loading model", model=model_id, type=model_type)
        start_time = time.time()

        try:
            # Load tokenizer
            tokenizer = AutoTokenizer.from_pretrained(
                model_id, cache_dir=settings.MODEL_CACHE_DIR, trust_remote_code=True
            )

            # Configure model loading parameters
            model_kwargs = {
                "cache_dir": settings.MODEL_CACHE_DIR,
                "trust_remote_code": True,
                "low_cpu_mem_usage": True,
            }

            # Add quantization if enabled and on CUDA
            if self.device.type == "cuda":
                if settings.USE_4BIT:
                    from transformers import BitsAndBytesConfig

                    model_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_compute_dtype=torch.float16,
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_quant_type="nf4",
                    )
                    model_kwargs["device_map"] = "auto"  # Required for quantization
                    log_info("Using 4-bit quantization with device_map=auto")
                elif settings.USE_8BIT:
                    model_kwargs["load_in_8bit"] = True
                    model_kwargs["device_map"] = "auto"  # Required for quantization
                    log_info("Using 8-bit quantization with device_map=auto")
                else:
                    model_kwargs["torch_dtype"] = torch.float16

            # Load model
            if model_type == "vlm" or model_type == "embeddings":
                # VLM and embedding models use AutoModel
                from transformers import AutoModel

                model = AutoModel.from_pretrained(model_id, **model_kwargs)
            else:
                # LLM models use AutoModelForCausalLM
                model = AutoModelForCausalLM.from_pretrained(model_id, **model_kwargs)

            # Move to device if not quantized (quantized models use device_map)
            if not (settings.USE_8BIT or settings.USE_4BIT) and "device_map" not in model_kwargs:
                model = model.to(self.device) # type: ignore

            # Set to eval mode
            model.eval()

            # Cache the model
            self.models[cache_key] = model
            self.tokenizers[cache_key] = tokenizer

            # Update metrics
            active_models.set(len(self.models))
            duration = time.time() - start_time
            model_load_duration_seconds.labels(model_name=model_id).observe(duration)

            log_info(
                "Model loaded successfully",
                model=model_id,
                type=model_type,
                duration_seconds=duration,
                memory_allocated_gb=(
                    torch.cuda.memory_allocated() / 1e9
                    if torch.cuda.is_available()
                    else 0
                ),
            )

            return model, tokenizer

        except Exception as e:
            log_error(
                "Failed to load model", model=model_id, type=model_type, error=str(e)
            )
            raise

    def unload_model(self, model_name: str, model_type: str = "llm"):
        """Unload a model from memory"""
        model_id = get_model_id(model_name)
        cache_key = f"{model_type}:{model_id}"

        if cache_key in self.models:
            del self.models[cache_key]
            del self.tokenizers[cache_key]

            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            active_models.set(len(self.models))
            log_info("Model unloaded", model=model_id, type=model_type)

    def get_model(self, model_name: str, model_type: str = "llm") -> Tuple[Any, Any]:
        """Get a model, loading it if necessary"""
        return self.load_model(model_name, model_type)

    def list_loaded_models(self) -> list:
        """List all currently loaded models"""
        return list(self.models.keys())

    async def get_llm(self, model_name: Optional[str] = None):
        """
        Get LLM service with loaded model

        Args:
            model_name: Optional model name override

        Returns:
            LLM service instance configured with the model
        """
        from app.models.llm import LLMService

        # Store model name for service to use
        if model_name:
            self.llm_model_name = model_name
        elif not hasattr(self, 'llm_model_name'):
            self.llm_model_name = settings.LLM_MODEL

        return LLMService()

    async def get_vlm(self, model_name: Optional[str] = None):
        """
        Get VLM service with loaded model

        Args:
            model_name: Optional model name override

        Returns:
            VLM service instance configured with the model
        """
        from app.models.vlm import VLMService

        # Store model name for service to use
        if model_name:
            self.vlm_model_name = model_name
        elif not hasattr(self, 'vlm_model_name'):
            self.vlm_model_name = settings.VLM_MODEL

        return VLMService()

    async def get_embeddings(self, model_name: Optional[str] = None):
        """
        Get Embeddings service with loaded model

        Args:
            model_name: Optional model name override

        Returns:
            Embeddings service instance configured with the model
        """
        from app.models.embedings import EmbeddingsService

        # Store model name for service to use
        if model_name:
            self.embed_model_name = model_name
        elif not hasattr(self, 'embed_model_name'):
            self.embed_model_name = settings.EMBED_MODEL

        return EmbeddingsService()

    async def cleanup(self):
        """Cleanup resources"""
        log_info("Cleaning up ModelManager")

        # Unload all models
        for key in list(self.models.keys()):
            parts = key.split(":", 1)
            if len(parts) == 2:
                model_type, model_name = parts
                self.unload_model(model_name, model_type)

        # Clear CUDA cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        log_info("ModelManager cleanup completed")


# Global model manager instance
model_manager = ModelManager()
