# -*- coding: utf-8 -*-
"""
Lightweight moderation tool (heuristics).

This is not a classifier; it uses simple keyword rules to flag obviously unsafe text.
For production, replace with a proper open-source moderation model.
"""

from __future__ import annotations

import re
from typing import Any, Dict

from . import Tool, ToolResult

_BAD_WORDS = [
    "kill", "suicide", "sexual", "nsfw", "porn", "hate", "racist",
    "血腥", "仇恨", "自殺", "成人", "色情",
]


class ModerationTool(Tool):
    name = "moderation"

    def meta(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": "Simple keyword-based moderation (placeholder).",
            "params": {"text": "str"},
        }

    def run(self, params: Dict[str, Any]) -> ToolResult:
        text = str(params.get("text", ""))[:2000].lower()
        if not text:
            return ToolResult(ok=True, preview="empty text", extra={"blocked": False, "score": 0.0})

        score = 0.0
        hit = False
        for w in _BAD_WORDS:
            if re.search(r"\b" + re.escape(w) + r"\b", text, flags=re.IGNORECASE):
                hit = True
                score += 0.5

        blocked = score >= 0.5
        return ToolResult(ok=True, preview=f"blocked={blocked} score={score:.2f}", extra={"blocked": blocked, "score": score})
