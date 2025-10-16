import os
import logging
from pathlib import Path
from typing import List, Dict, Any

os.environ.setdefault("TRANSFORMERS_PREFER_SAFETENSORS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import torch  # noqa: E402
from sentence_transformers import SentenceTransformer  # noqa: E402

log = logging.getLogger(__name__)

MODEL_NAME = os.getenv("EMBEDDINGS_MODEL", "BAAI/bge-m3")
CACHE_DIR = Path(os.getenv("SENTENCE_TRANSFORMERS_HOME", "/root/.cache/huggingface/sentence-transformers"))

def _pick_device_safely() -> str:
    # 允許用環境變數強制指定
    forced = os.getenv("EMBEDDING_DEVICE")
    if forced in {"cpu", "cuda"}:
        log.info(f"[emb] Forced device via env EMBEDDING_DEVICE={forced}")
        return forced

    if os.getenv("ENABLE_CUDA", "1") != "1":
        return "cpu"

    if torch.cuda.is_available():
        try:
            maj, minr = torch.cuda.get_device_capability(0)
            name = torch.cuda.get_device_name(0)
            log.info(f"[emb] CUDA available. cap={maj}.{minr} name={name}")
            return "cuda"
        except Exception as e:
            log.warning(f"[emb] CUDA capability check failed, fallback to CPU: {e}")
    return "cpu"


class _EmbState:
    model: SentenceTransformer | None = None
    device: str = "cpu"
    dim: int | None = None
    loaded: bool = False


_state = _EmbState()


def _load_model():
    if _state.loaded and _state.model is not None:
        return

    _state.device = _pick_device_safely()
    try:
        _state.model = SentenceTransformer(MODEL_NAME, device=_state.device, cache_folder=str(CACHE_DIR))
        _state.loaded = True
        _state.dim = _guess_dim()
        log.info(f"[emb] Loaded model={MODEL_NAME} on device={_state.device} dim={_state.dim}")
    except Exception as e:
        msg = str(e).lower()
        if "no kernel image" in msg or "sm_120" in msg or "cuda error" in msg:
            # GPU 編譯不支援（如新卡 sm_120 舊 torch），自動回落 CPU
            log.warning(f"[emb] GPU not supported by this torch build; reloading on CPU. err={e}")
            _state.device = "cpu"
            _state.model = SentenceTransformer(MODEL_NAME, device="cpu", cache_folder=str(CACHE_DIR))
            _state.loaded = True
            _state.dim = _guess_dim()
        else:
            raise


def _guess_dim() -> int | None:
    try:
        emb = _state.model.encode(["probe"], normalize_embeddings=False, convert_to_numpy=True) # type: ignore
        return int(emb.shape[-1])
    except Exception:
        return None


def embed(texts: List[str]) -> Dict[str, Any]:
    _load_model()
    assert _state.model is not None

    try:
        vecs = _state.model.encode(
            texts,
            batch_size=32,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
    except Exception as e:
        # 若 encode 才爆 GPU，同樣回落 CPU 一次
        msg = str(e).lower()
        if _state.device == "cuda" and ("no kernel image" in msg or "sm_120" in msg or "cuda error" in msg):
            log.warning(f"[emb] Encode failed on GPU; retry on CPU. err={e}")
            _state.device = "cpu"
            _state.model = SentenceTransformer(MODEL_NAME, device="cpu", cache_folder=str(CACHE_DIR))
            vecs = _state.model.encode(
                texts,
                batch_size=32,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )
        else:
            raise

    return {
        "device": _state.device,
        "model": MODEL_NAME,
        "dim": _state.dim or int(vecs.shape[-1]),
        "vectors": vecs.tolist(),
    }
