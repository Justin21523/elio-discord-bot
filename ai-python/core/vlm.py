# -*- coding: utf-8 -*-
"""VLM engine (caption + VQA) with graceful fallbacks. English-only code/comments."""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, Optional

from PIL import Image

from .config import get_config

logger = logging.getLogger(__name__)
_cfg = get_config()


class _FallbackVLM:
    def caption(self, image: bytes, max_length: int = 80, num_beams: int = 3, temperature: float = 0.7) -> str:
        try:
            im = Image.open(io.BytesIO(image)).convert("RGB")
            w, h = im.size
            return f"(fallback) An image of size {w}x{h}."
        except Exception:
            return "(fallback) An image."

    def vqa(self, image: bytes, question: str, max_length: int = 128, temperature: float = 0.7) -> str:
        return f"(fallback) I cannot see details, but regarding '{question}', it's not clear."


class VLMEngine:
    """
    Uses HF pipelines if available:
      - blip-image-captioning-base for caption
      - blip-vqa-base for VQA
    Falls back to a simple stub otherwise.
    """

    def __init__(self) -> None:
        self._cap = None
        self._vqa = None
        self._fallback = _FallbackVLM()

    def _ensure_caption(self):
        if self._cap is not None:
            return
        try:
            from transformers import BlipForConditionalGeneration, BlipProcessor
            import torch

            model = BlipForConditionalGeneration.from_pretrained(_cfg.vlm_models.caption_model)
            processor = BlipProcessor.from_pretrained(_cfg.vlm_models.caption_model)
            device = "cuda" if _cfg.vlm_models.device.startswith("cuda") and torch.cuda.is_available() else "cpu"
            model.to(device)# type: ignore

            def _run(image: bytes, max_length=80, num_beams=3, temperature=0.7):
                im = Image.open(io.BytesIO(image)).convert("RGB")
                inputs = processor(images=im, return_tensors="pt").to(device)
                with torch.no_grad():
                    out = model.generate(
                        **inputs, # type: ignore
                        max_new_tokens=max(8, min(128, int(max_length))),
                        num_beams=max(1, int(num_beams)),
                        do_sample=num_beams == 1,
                        temperature=float(temperature),
                    )
                text = processor.decode(out[0], skip_special_tokens=True)
                return text

            self._cap = _run
            logger.info("VLM caption backend loaded: %s", _cfg.vlm_models.caption_model)
        except Exception as e:
            logger.warning("VLM caption load failed, fallback: %s", e)
            self._cap = None

    def _ensure_vqa(self):
        if self._vqa is not None:
            return
        try:
            from transformers import BlipForQuestionAnswering, BlipProcessor
            import torch

            model = BlipForQuestionAnswering.from_pretrained(_cfg.vlm_models.vqa_model)
            processor = BlipProcessor.from_pretrained(_cfg.vlm_models.vqa_model)
            device = "cuda" if _cfg.vlm_models.device.startswith("cuda") and torch.cuda.is_available() else "cpu"
            model.to(device) # type: ignore

            def _run(image: bytes, question: str, max_length=128, temperature=0.7):
                im = Image.open(io.BytesIO(image)).convert("RGB")
                inputs = processor(images=im, text=question, return_tensors="pt").to(device)
                with torch.no_grad():
                    out = model.generate(
                        **inputs, # type: ignore
                        max_new_tokens=max(8, min(64, int(max_length))),
                        do_sample=True,
                        temperature=float(temperature),
                    )
                text = processor.decode(out[0], skip_special_tokens=True)
                return text

            self._vqa = _run
            logger.info("VLM VQA backend loaded: %s", _cfg.vlm_models.vqa_model)
        except Exception as e:
            logger.warning("VLM VQA load failed, fallback: %s", e)
            self._vqa = None

    # ---- public API ----

    def caption(self, image: bytes, max_length: int = 80, num_beams: int = 3, temperature: float = 0.7) -> str:
        self._ensure_caption()
        if self._cap is None:
            return self._fallback.caption(image, max_length=max_length, num_beams=num_beams, temperature=temperature)
        return self._cap(image, max_length=max_length, num_beams=num_beams, temperature=temperature)

    def vqa(self, image: bytes, question: str, max_length: int = 128, temperature: float = 0.7) -> str:
        self._ensure_vqa()
        if self._vqa is None:
            return self._fallback.vqa(image, question, max_length=max_length, temperature=temperature)
        return self._vqa(image, question, max_length=max_length, temperature=temperature)
