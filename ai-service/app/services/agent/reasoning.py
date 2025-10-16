"""
Reasoning Engine - Handles agent thought process
"""

from typing import Dict, Any, List
from app.models.llm import llm_service
from app.config import settings


class ReasoningEngine:
    """
    Reasoning engine for AI agent
    Generates thoughts, actions, and action inputs
    """

    async def reason(
        self,
        query: str,
        context: Dict[str, Any],
        conversation_history: List[Dict[str, Any]],
        available_tools: str,
        step_number: int,
    ) -> Dict[str, Any]:
        """
        Generate reasoning for next step

        Returns:
            Dict with thought, action, and action_input
        """

        # Build prompt for reasoning
        prompt = self._build_reasoning_prompt(
            query=query,
            context=context,
            history=conversation_history,
            tools=available_tools,
            step=step_number,
        )

        # Generate reasoning using LLM
        result = await llm_service.generate(
            prompt=prompt,
            system=self._get_system_prompt(),
            temperature=0.3,  # Lower temperature for more focused reasoning
            max_tokens=512,
        )

        # Parse reasoning output
        reasoning_text = result.get("text", "")
        parsed = self._parse_reasoning(reasoning_text)

        return parsed

    def _build_reasoning_prompt(
        self,
        query: str,
        context: Dict[str, Any],
        history: List[Dict[str, Any]],
        tools: str,
        step: int,
    ) -> str:
        """Build prompt for reasoning"""

        prompt_parts = [f"Original Query: {query}", "", f"Step {step}:", ""]

        # Add context if available
        if context:
            prompt_parts.append("Context:")
            for key, value in context.items():
                prompt_parts.append(f"  {key}: {value}")
            prompt_parts.append("")

        # Add conversation history
        if history:
            prompt_parts.append("Previous Steps:")
            for i, entry in enumerate(history[-3:], 1):  # Last 3 steps
                prompt_parts.append(f"Step {i}:")
                prompt_parts.append(f"  Thought: {entry.get('thought', '')}")
                prompt_parts.append(f"  Action: {entry.get('action', '')}")
                prompt_parts.append(
                    f"  Observation: {entry.get('observation', '')[:200]}"
                )
            prompt_parts.append("")

        # Add available tools
        prompt_parts.append("Available Tools:")
        prompt_parts.append(tools)
        prompt_parts.append("")

        prompt_parts.append("What should I do next?")
        prompt_parts.append("")
        prompt_parts.append("Respond in this format:")
        prompt_parts.append("Thought: [your reasoning]")
        prompt_parts.append("Action: [tool name or 'finish']")
        prompt_parts.append("Action Input: [JSON parameters]")

        return "\n".join(prompt_parts)

    def _get_system_prompt(self) -> str:
        """Get system prompt for reasoning"""
        return """You are an AI agent that thinks step-by-step to solve tasks.

For each step:
1. Think carefully about what you know and what you need to find out
2. Choose the best tool to help you
3. Provide appropriate input for that tool

When you have enough information to answer the original query, use the 'finish' action.

Always respond in this exact format:
Thought: [your reasoning about what to do next]
Action: [tool name or 'finish']
Action Input: [JSON object with parameters]

Be concise and focused."""

    def _parse_reasoning(self, text: str) -> Dict[str, Any]:
        """Parse reasoning output into structured format"""
        import json
        import re

        result = {"thought": "", "action": "", "action_input": {}}

        # Extract thought
        thought_match = re.search(
            r"Thought:\s*(.+?)(?=Action:|$)", text, re.DOTALL | re.IGNORECASE
        )
        if thought_match:
            result["thought"] = thought_match.group(1).strip()

        # Extract action
        action_match = re.search(
            r"Action:\s*(.+?)(?=Action Input:|$)", text, re.DOTALL | re.IGNORECASE
        )
        if action_match:
            result["action"] = action_match.group(1).strip()

        # Extract action input
        input_match = re.search(
            r"Action Input:\s*(.+)", text, re.DOTALL | re.IGNORECASE
        )
        if input_match:
            input_text = input_match.group(1).strip()
            try:
                # Try to parse as JSON
                result["action_input"] = json.loads(input_text)
            except json.JSONDecodeError:
                # If not valid JSON, treat as plain text
                result["action_input"] = {"input": input_text}

        return result
