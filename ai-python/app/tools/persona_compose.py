# -*- coding: utf-8 -*-
"""
personaCompose tool.

Compose a reply in a particular persona/style using the LLM.
"""

from __future__ import annotations

from typing import Any, Dict

from core.llm import EnhancedLLMAdapter

from . import Tool, ToolResult


class PersonaComposeTool(Tool):
    name = "personaCompose"

    def __init__(self) -> None:
        self._llm = EnhancedLLMAdapter()

    def meta(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": "Compose a short reply in a configured persona/style.",
            "params": {"text": "str", "persona": "{name,style,tone?}", "max_length": "int<=300"},
        }

    def run(self, params: Dict[str, Any]) -> ToolResult:
        text = str(params.get("text", ""))[:800]
        persona = params.get("persona", {"name": "Elio", "style": "playful, supportive"})
        max_length = int(params.get("max_length", 180))

        prompt = (
            f"You are '{persona.get('name','Elio')}', style: {persona.get('style','playful')}. "
            "Write a friendly, concise reply in English+Chinese mix if the user writes Chinese; "
            "keep it supportive and positive, avoid slang that may offend.\n\n"
            f"User said:\n{text}\n\nYour reply (<= {max_length} chars):"
        )
        out = self._llm.generate_text(prompt, max_length=max_length, temperature=0.7)
        return ToolResult(ok=True, preview=out[:120], extra={"output": out})
