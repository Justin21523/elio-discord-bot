"""
Advanced AI Agent - Multi-step reasoning with tool usage
"""

import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime

from app.models.llm import llm_service
from app.services.agent.tools import tool_registry
from app.services.agent.reasoning import ReasoningEngine
from app.config import settings
from app.utils.logger import log_info, log_error


class AgentStep:
    """Represents a single step in agent execution"""

    def __init__(
        self,
        step_number: int,
        thought: str,
        action: str,
        action_input: Dict[str, Any],
        observation: str,
        success: bool,
        duration_ms: float,
    ):
        self.step_number = step_number
        self.thought = thought
        self.action = action
        self.action_input = action_input
        self.observation = observation
        self.success = success
        self.duration_ms = duration_ms
        self.timestamp = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_number": self.step_number,
            "thought": self.thought,
            "action": self.action,
            "action_input": self.action_input,
            "observation": self.observation,
            "success": self.success,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp.isoformat(),
        }


class AgentTask:
    """Agent task execution result"""

    def __init__(
        self,
        task_id: str,
        query: str,
        final_answer: str,
        steps: List[AgentStep],
        total_duration_ms: float,
        tokens_used: int,
        success: bool,
    ):
        self.task_id = task_id
        self.query = query
        self.final_answer = final_answer
        self.steps = steps
        self.total_duration_ms = total_duration_ms
        self.tokens_used = tokens_used
        self.success = success
        self.timestamp = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "query": self.query,
            "final_answer": self.final_answer,
            "steps": [step.to_dict() for step in self.steps],
            "total_duration_ms": self.total_duration_ms,
            "tokens_used": self.tokens_used,
            "success": self.success,
            "timestamp": self.timestamp.isoformat(),
        }


class AIAgent:
    """
    Advanced AI Agent with:
    - Multi-step reasoning
    - Tool usage (RAG, web search, etc.)
    - Thought-action-observation loop
    - Parallel tool execution
    """

    def __init__(self):
        self.reasoning_engine = ReasoningEngine()
        self.max_steps = settings.AGENT_MAX_STEPS
        self.max_retries = settings.AGENT_MAX_RETRIES

    async def run(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None,
        available_tools: Optional[List[str]] = None,
    ) -> AgentTask:
        """
        Execute agent task with reasoning and tool usage

        Args:
            query: User query
            context: Additional context
            available_tools: List of tool names to use (None = all tools)

        Returns:
            AgentTask with execution trace
        """
        import time
        import uuid

        task_id = str(uuid.uuid4())
        start_time = time.time()
        steps: List[AgentStep] = []
        total_tokens = 0

        log_info("Agent task started", task_id=task_id, query=query[:100])

        try:
            # Get available tools
            tools = tool_registry.get_tools(available_tools)
            tool_descriptions = self._format_tool_descriptions(tools)

            # Initialize conversation history
            conversation = []

            # Agent loop
            for step_num in range(1, self.max_steps + 1):
                step_start = time.time()

                # Generate thought and action using reasoning
                reasoning_result = await self.reasoning_engine.reason(
                    query=query,
                    context=context or {},
                    conversation_history=conversation,
                    available_tools=tool_descriptions,
                    step_number=step_num,
                )

                thought = reasoning_result.get("thought", "")
                action = reasoning_result.get("action", "")
                action_input = reasoning_result.get("action_input", {})

                log_info(
                    "Agent step reasoning",
                    step=step_num,
                    thought=thought[:100],
                    action=action,
                )

                # Check if agent wants to finish
                if action.lower() == "finish":
                    final_answer = action_input.get("answer", "")
                    step_duration = (time.time() - step_start) * 1000

                    step = AgentStep(
                        step_number=step_num,
                        thought=thought,
                        action="finish",
                        action_input=action_input,
                        observation=final_answer,
                        success=True,
                        duration_ms=step_duration,
                    )
                    steps.append(step)

                    total_duration = (time.time() - start_time) * 1000

                    log_info(
                        "Agent task completed",
                        task_id=task_id,
                        steps=len(steps),
                        duration_ms=total_duration,
                    )

                    return AgentTask(
                        task_id=task_id,
                        query=query,
                        final_answer=final_answer,
                        steps=steps,
                        total_duration_ms=total_duration,
                        tokens_used=total_tokens,
                        success=True,
                    )

                # Execute tool
                try:
                    tool_result = await self._execute_tool(
                        action=action, action_input=action_input, tools=tools
                    )

                    observation = tool_result.get("result", "")
                    success = tool_result.get("success", False)

                except Exception as e:
                    observation = f"Error executing tool: {str(e)}"
                    success = False
                    log_error("Tool execution failed", action=action, error=str(e))

                step_duration = (time.time() - step_start) * 1000

                # Create step
                step = AgentStep(
                    step_number=step_num,
                    thought=thought,
                    action=action,
                    action_input=action_input,
                    observation=observation[:500],  # Truncate long observations
                    success=success,
                    duration_ms=step_duration,
                )
                steps.append(step)

                # Add to conversation history
                conversation.append(
                    {"thought": thought, "action": action, "observation": observation}
                )

            # Max steps reached without finishing
            total_duration = (time.time() - start_time) * 1000

            log_error("Agent max steps reached", task_id=task_id, steps=len(steps))

            return AgentTask(
                task_id=task_id,
                query=query,
                final_answer="Task incomplete: maximum steps reached",
                steps=steps,
                total_duration_ms=total_duration,
                tokens_used=total_tokens,
                success=False,
            )

        except Exception as e:
            log_error("Agent task failed", task_id=task_id, error=str(e))

            total_duration = (time.time() - start_time) * 1000

            return AgentTask(
                task_id=task_id,
                query=query,
                final_answer=f"Task failed: {str(e)}",
                steps=steps,
                total_duration_ms=total_duration,
                tokens_used=total_tokens,
                success=False,
            )

    def _format_tool_descriptions(self, tools: Dict[str, Any]) -> str:
        """Format tool descriptions for the agent"""
        descriptions = []

        for name, tool in tools.items():
            desc = f"- {name}: {tool.get('description', '')}"
            if tool.get("parameters"):
                desc += f"\n  Parameters: {tool['parameters']}"
            descriptions.append(desc)

        return "\n".join(descriptions)

    async def _execute_tool(
        self, action: str, action_input: Dict[str, Any], tools: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a tool and return the result"""

        if action not in tools:
            return {"success": False, "result": f"Unknown tool: {action}"}

        tool = tools[action]
        tool_func = tool.get("function")

        if not tool_func:
            return {"success": False, "result": f"Tool {action} has no function"}

        try:
            result = await tool_func(**action_input)
            return {"success": True, "result": str(result)}
        except Exception as e:
            return {"success": False, "result": f"Tool execution error: {str(e)}"}


class AgentOrchestrator:
    """
    Orchestrates complex agent workflows with RAG integration
    Coordinates between AIAgent, RAG service, and various tools
    """

    def __init__(self, model_manager, rag_service):
        """
        Initialize agent orchestrator

        Args:
            model_manager: ModelManager instance for accessing AI models
            rag_service: RAGSearchService for knowledge retrieval
        """
        self.model_manager = model_manager
        self.rag_service = rag_service
        self.agent = AIAgent()

        log_info("AgentOrchestrator initialized")

    async def run(
        self,
        kind: str,
        params: Dict[str, Any],
        max_steps: int = 10,
        timeout_seconds: int = 60,
    ) -> Dict[str, Any]:
        """
        Run an agent task by kind

        Args:
            kind: Task type (daily_digest, fact_check, persona_compose, etc.)
            params: Task-specific parameters
            max_steps: Maximum reasoning steps
            timeout_seconds: Execution timeout

        Returns:
            Dict with task result, steps, and metrics
        """
        import time

        start_time = time.time()

        log_info(f"AgentOrchestrator running task", kind=kind, max_steps=max_steps)

        try:
            # Route to appropriate handler
            if kind == "daily_digest":
                result = await self._daily_digest(params)
            elif kind == "fact_check":
                result = await self._fact_check(params)
            elif kind == "persona_compose":
                result = await self._persona_compose(params)
            elif kind == "rag_query":
                result = await self._rag_query(params)
            elif kind == "content_discovery":
                result = await self._content_discovery(params)
            elif kind == "custom":
                # General agent execution
                query = params.get("query", "")
                context = params.get("context")
                available_tools = params.get("available_tools")

                agent_result = await self.agent.run(
                    query=query, context=context, available_tools=available_tools
                )

                result = agent_result.to_dict()
            else:
                raise ValueError(f"Unknown task kind: {kind}")

            duration_ms = (time.time() - start_time) * 1000

            log_info(
                f"AgentOrchestrator completed task",
                kind=kind,
                duration_ms=duration_ms,
                success=result.get("success", True),
            )

            return {
                "kind": kind,
                "result": result,
                "durationMs": duration_ms,
                "steps": result.get("steps", []),
                "success": result.get("success", True),
            }

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            log_error(f"AgentOrchestrator task failed", kind=kind, error=str(e))

            return {
                "kind": kind,
                "result": {"error": str(e)},
                "durationMs": duration_ms,
                "steps": [],
                "success": False,
            }

    async def _daily_digest(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Generate daily digest"""
        topics = params.get("topics", [])

        # Use RAG to fetch relevant content
        if self.rag_service and topics:
            search_results = []
            for topic in topics:
                results = await self.rag_service.search(query=topic, top_k=3)
                search_results.extend(results)

        # Compose digest using agent
        query = f"Create a daily digest covering: {', '.join(topics)}"
        agent_result = await self.agent.run(query=query, context={"topics": topics})

        return agent_result.to_dict()

    async def _fact_check(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Fact-check a statement"""
        statement = params.get("statement", "")

        # Search for relevant information
        if self.rag_service:
            rag_results = await self.rag_service.search(query=statement, top_k=5)
            context = {"rag_results": rag_results}
        else:
            context = {}

        # Run fact-checking agent
        query = f"Fact-check this statement: {statement}"
        agent_result = await self.agent.run(query=query, context=context)

        return agent_result.to_dict()

    async def _persona_compose(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Compose message as persona"""
        persona = params.get("persona", "")
        prompt = params.get("prompt", "")
        style = params.get("style", "natural")

        query = f"As {persona}, respond to: {prompt} (Style: {style})"
        agent_result = await self.agent.run(query=query, context={"persona": persona})

        return agent_result.to_dict()

    async def _rag_query(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Query with RAG augmentation"""
        query = params.get("query", "")
        top_k = params.get("top_k", 5)

        # Get RAG results
        if self.rag_service:
            rag_results = await self.rag_service.search(query=query, top_k=top_k)
            context = {"rag_results": rag_results}
        else:
            context = {}

        # Run agent with RAG context
        agent_result = await self.agent.run(query=query, context=context)

        return agent_result.to_dict()

    async def _content_discovery(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Multi-platform content discovery with LLM scoring and diversity ranking

        Args:
            params: Dictionary with:
                - query (str): Search query
                - platforms (List[str], optional): Platforms to search
                - max_results (int, optional): Maximum results
                - content_types (List[str], optional): Desired content types

        Returns:
            Dict with discovery results, diversity score, and platform coverage
        """
        from app.services.agent.content_discovery import ContentDiscoveryOrchestrator
        from app.services.art.deviantart_client import DeviantArtClient
        from app.services.art.tumblr_client import TumblrClient
        from app.config import settings

        query = params.get("query", "")
        platforms = params.get("platforms")
        max_results = params.get("max_results", settings.CONTENT_DISCOVERY_MAX_RESULTS)
        content_types = params.get("content_types")

        log_info("Content discovery started", query=query, platforms=platforms)

        # Initialize art platform clients if credentials available
        deviantart_client = None
        tumblr_client = None

        if settings.DEVIANTART_CLIENT_ID and settings.DEVIANTART_CLIENT_SECRET:
            deviantart_client = DeviantArtClient(
                client_id=settings.DEVIANTART_CLIENT_ID,
                client_secret=settings.DEVIANTART_CLIENT_SECRET
            )
            await deviantart_client.authenticate()

        if settings.TUMBLR_API_KEY:
            tumblr_client = TumblrClient(api_key=settings.TUMBLR_API_KEY)

        # Web search function wrapper (uses existing web search tool)
        async def web_search_wrapper(query: str, max_results: int, domains=None, recency_days=None):
            """Wrapper for web search tool"""
            from app.services.agent.tools import tool_registry

            tools = tool_registry.get_tools(["web_search"])
            web_search_tool = tools.get("web_search")

            if web_search_tool:
                func = web_search_tool.get("function")
                if func:
                    search_params = {"query": query, "max_results": max_results}
                    if domains:
                        search_params["domains"] = domains
                    if recency_days:
                        search_params["recency_days"] = recency_days

                    result = await func(**search_params)
                    return result if isinstance(result, list) else []

            return []

        # Create orchestrator
        orchestrator = ContentDiscoveryOrchestrator(
            deviantart_client=deviantart_client,
            tumblr_client=tumblr_client,
            web_search_func=web_search_wrapper,
            llm_service=llm_service
        )

        # Execute discovery
        try:
            discovery_result = await orchestrator.discover(
                query=query,
                platforms=platforms,
                max_results=max_results,
                content_types=content_types
            )

            log_info(
                "Content discovery completed",
                query=query,
                total_results=discovery_result["total_results"],
                diversity_score=discovery_result["diversity_score"]
            )

            return {
                "success": True,
                "query": discovery_result["query"],
                "results": discovery_result["results"],
                "total_results": discovery_result["total_results"],
                "diversity_score": discovery_result["diversity_score"],
                "platforms_covered": discovery_result["platforms_covered"]
            }

        except Exception as e:
            log_error("Content discovery failed", query=query, error=str(e))
            return {
                "success": False,
                "error": str(e),
                "query": query,
                "results": [],
                "total_results": 0,
                "diversity_score": 0.0,
                "platforms_covered": []
            }
        finally:
            # Clean up clients
            if deviantart_client:
                await deviantart_client.close()
            if tumblr_client:
                await tumblr_client.close()


# Global agent instance
ai_agent = AIAgent()
