# -*- coding: utf-8 -*-
"""
Tools registry for the Agent.

Every Tool must implement:
- run(params: Dict[str, Any]) -> ToolResult
- meta() -> Dict[str, Any]
- sanitized_params(params) -> Dict[str, Any]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ToolResult:
    ok: bool
    preview: str = ""
    error: Optional[str] = None
    extra: Dict[str, Any] = None # type: ignore

    def __post_init__(self):
        if self.extra is None:
            self.extra = {}


class Tool:
    name: str = "base"

    def run(self, params: Dict[str, Any]) -> ToolResult:  # noqa: D401
        """Execute tool with params."""
        raise NotImplementedError

    def meta(self) -> Dict[str, Any]:
        return {"name": self.name, "description": ""}

    def sanitized_params(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Hide large/binary fields."""
        out = dict(params)
        for k in list(out.keys()):
            if k in {"image_b64", "image"}:
                out[k] = f"<{k}:{len(str(out[k]))} chars>"
            if isinstance(out[k], str) and len(out[k]) > 400:
                out[k] = out[k][:400] + "...(truncated)"
        return out


# Concrete tools
from .web_search import WebSearchTool  # noqa: E402
from .rag_tool import RagQATool  # noqa: E402
from .moderation import ModerationTool  # noqa: E402
from .persona_compose import PersonaComposeTool  # noqa: E402
from .image_describe import ImageDescribeTool  # noqa: E402

__all__ = [
    "Tool",
    "ToolResult",
    "WebSearchTool",
    "RagQATool",
    "ModerationTool",
    "PersonaComposeTool",
    "ImageDescribeTool",
]
