# -*- coding: utf-8 -*-
"""
imageDescribe tool.

Accepts a base64-encoded image and returns a caption using VLMEngine.
"""

from __future__ import annotations

import base64
from typing import Any, Dict

from core.vlm import VLMEngine

from . import Tool, ToolResult


class ImageDescribeTool(Tool):
    name = "imageDescribe"

    def __init__(self) -> None:
        self._vlm = VLMEngine()

    def meta(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": "Generate an image caption from a base64-encoded image.",
            "params": {"image_b64": "str(base64)", "max_length": "int<=120"},
        }

    def run(self, params: Dict[str, Any]) -> ToolResult:
        b64 = str(params.get("image_b64", ""))
        if not b64:
            return ToolResult(ok=False, error="image_b64 missing")
        try:
            img_bytes = base64.b64decode(b64, validate=True)
        except Exception:
            return ToolResult(ok=False, error="invalid base64 image")

        max_length = int(params.get("max_length", 80))
        caption = self._vlm.caption(image=img_bytes, max_length=max_length, num_beams=3, temperature=0.7)  # type: ignore
        return ToolResult(ok=True, preview=caption[:120], extra={"caption": caption})
