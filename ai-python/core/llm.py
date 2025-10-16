# -*- coding: utf-8 -*-
"""Lightweight LLM adapter with graceful fallbacks. English-only code/comments."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from .config import get_config
from .exceptions import MultiModalLabError

logger = logging.getLogger(__name__)
_cfg = get_config()
device = _cfg.resolved_llm_device     # "cuda" or "cpu"
dtype = _cfg.llm_models.dtype         # "auto"/"float16"/"bfloat16"/...

def _concat_chat(messages: List[Dict[str, str]]) -> str:
    """Simple chat-to-prompt concatenation."""
    out = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        out.append(f"{role.upper()}: {content}")
    out.append("ASSISTANT:")
    return "\n".join(out)


class _RuleBasedLLM:
    """Fallback tiny rule-based generator when HF models are unavailable."""

    def chat_completion(self, messages: List[Dict[str, str]], **_: Any) -> Dict[str, Any]:
        last = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last = m.get("content", "")
                break
        reply = f"(fallback) You said: {last[:180]}"
        return {"message": reply, "usage": {"prompt_tokens": len(last.split()), "completion_tokens": len(reply.split())}, "model_used": "rule-based"}

    def generate_text(self, prompt: str, **_: Any) -> str:
        return "(fallback) " + (prompt.strip()[:200] or "Hello.")


class EnhancedLLMAdapter:
    """
    Wraps a local HF transformers text-generation pipeline if available.
    Falls back to a rule-based echo for offline environments.
    """

    def __init__(self) -> None:
        self.model_name = _cfg.llm_models.chat_model
        self.device = _cfg.llm_models.device
        self._backend = None  # lazy
        self._fallback = _RuleBasedLLM()

    # --- internals ---

    def _ensure_backend(self):
        if self._backend is not None:
            return
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
            tok = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=True,
                use_fast=True
            )
            mdl = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                trust_remote_code=True,
                device_map="auto" if device != "cpu" else None,
                torch_dtype="auto" if dtype == "auto" else None,
                low_cpu_mem_usage=True,
            )
            self._backend = pipeline(
                "text-generation",
                model=mdl,
                tokenizer=tok,
                device_map="auto" if device != "cpu" else None,
                torch_dtype="auto" if dtype == "auto" else None,
                return_full_text=False
            )
            logger.info("LLM backend loaded: %s", self.model_name)
        except Exception as e:
            logger.warning("LLM load failed, use fallback: %s", e)
            self._backend = None

    # --- public API ---

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        max_length: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9,
        repetition_penalty: float = 1.05,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self._ensure_backend()
        if self._backend is None:
            return self._fallback.chat_completion(messages, max_length=max_length)

        prompt = _concat_chat(messages)
        try:
            out = self._backend(
                prompt,
                max_new_tokens=max(16, min(1024, int(max_length))),
                do_sample=True,
                temperature=float(temperature),
                top_p=float(top_p),
                repetition_penalty=float(repetition_penalty),
                eos_token_id=None,
            )[0]["generated_text"]
            # take only assistant tail
            resp = out.split("ASSISTANT:")[-1].strip()
            return {
                "message": resp,
                "usage": {"prompt_tokens": len(prompt.split()), "completion_tokens": len(resp.split())},
                "model_used": self.model_name,
            }
        except Exception as e:
            logger.exception("LLM generation failed")
            raise MultiModalLabError(str(e))

    def generate_text(
        self,
        prompt: str,
        max_length: int = 256,
        temperature: float = 0.7,
        top_p: float = 0.9,
        repetition_penalty: float = 1.05,
    ) -> str:
        self._ensure_backend()
        if self._backend is None:
            return self._fallback.generate_text(prompt)

        try:
            out = self._backend(
                prompt,
                max_new_tokens=max(8, min(1024, int(max_length))),
                do_sample=True,
                temperature=float(temperature),
                top_p=float(top_p),
                repetition_penalty=float(repetition_penalty),
                eos_token_id=None,
            )[0]["generated_text"]
            # take the tail beyond prompt
            tail = out[len(prompt):].strip()
            return tail or out
        except Exception as e:
            logger.exception("LLM generate_text failed")
            raise MultiModalLabError(str(e))
