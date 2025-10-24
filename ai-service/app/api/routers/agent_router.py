"""
Agent Router - Multi-step agentic tasks with reasoning, planning, and tool orchestration
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import time
import uuid

from app.models.manager import ModelManager
from app.services.agent.core import AgentOrchestrator
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager, get_agent_orchestrator
from app.services.agent.web_search import web_search_results  # NEW import
from app.config import settings

logger = setup_logger(__name__)
router = APIRouter()


# Request/Response models
class ReasoningRequest(BaseModel):
    problem: str = Field(..., description="Problem to reason about")
    context: Optional[str] = Field(None, description="Additional context")
    reasoning_type: str = Field(
        "chain-of-thought",
        description="Reasoning type: chain-of-thought, tree-of-thought, step-by-step",
    )
    max_steps: int = Field(5, ge=1, le=20)


class ReasoningStep(BaseModel):
    step_number: int
    thought: str
    reasoning: str
    conclusion: Optional[str] = None


class ReasoningResponse(BaseModel):
    ok: bool = True
    data: dict


class TaskPlanningRequest(BaseModel):
    goal: str = Field(..., description="High-level goal to plan for")
    constraints: Optional[List[str]] = Field(
        None, description="Constraints or requirements"
    )
    available_tools: Optional[List[str]] = Field(None, description="Available tools")
    max_tasks: int = Field(10, ge=1, le=50)


class PlannedTask(BaseModel):
    task_id: str
    description: str
    tool: str
    dependencies: List[str] = Field(default_factory=list)
    estimated_duration: Optional[int] = None
    priority: int = Field(1, ge=1, le=5)


class TaskPlanningResponse(BaseModel):
    ok: bool = True
    data: dict


class MultiTaskRequest(BaseModel):
    tasks: List[Dict[str, Any]] = Field(..., description="List of tasks to execute")
    execution_mode: str = Field("sequential", description="sequential or parallel")
    timeout_per_task: int = Field(30, ge=5, le=300)


class MultiTaskResponse(BaseModel):
    ok: bool = True
    data: dict


class WebSearchTaskRequest(BaseModel):
    query: str = Field(..., description="Search query")
    num_results: int = Field(5, ge=1, le=20)
    recency_days: Optional[int] = Field(None, description="Filter by recency")
    domains: Optional[List[str]] = Field(None, description="Limit to specific domains")
    summarize: bool = Field(True, description="Summarize results")


class WebSearchResponse(BaseModel):
    ok: bool = True
    data: dict


class AgentRunRequest(BaseModel):
    kind: str = Field(
        ..., description="Task kind: daily_digest, fact_check, persona_compose, etc."
    )
    params: Dict[str, Any] = Field(default_factory=dict)
    max_steps: int = Field(10, ge=1, le=50)
    timeout_seconds: int = Field(60, ge=10, le=300)


class AgentStep(BaseModel):
    tool: str
    args: Dict[str, Any]
    output: Any
    duration_ms: float


class AgentRunResponse(BaseModel):
    ok: bool = True
    data: dict


# Reasoning endpoint
@router.post("/reasoning", response_model=ReasoningResponse)
async def reasoning_task(
    request: ReasoningRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Perform structured reasoning on a problem
    """
    try:
        logger.info(
            f"[AGENT] Reasoning task: {request.problem[:50]}... (type={request.reasoning_type})"
        )

        llm = await manager.get_llm()

        # Build reasoning prompt based on type
        if request.reasoning_type == "chain-of-thought":
            system_prompt = """You are a logical reasoning assistant. Break down the problem into clear steps.
For each step, explain your thought process and reasoning.
Format your response as:
Step 1: [Thought]
Reasoning: [Explanation]

Step 2: [Thought]
Reasoning: [Explanation]

Final Conclusion: [Answer]"""

        elif request.reasoning_type == "tree-of-thought":
            system_prompt = """You are a reasoning assistant using tree-of-thought approach.
Explore multiple reasoning paths, evaluate each, and select the best.
Show your branching thoughts and why you chose specific paths."""

        else:  # step-by-step
            system_prompt = """You are a step-by-step problem solver.
Break down the problem into sequential steps and solve each systematically."""

        prompt = f"{request.context or ''}\n\nProblem: {request.problem}\n\nLet's think through this step by step:"

        result = await llm.generate(
            system=system_prompt, prompt=prompt, max_tokens=2048, temperature=0.7
        )

        reasoning_text = result.get("text", "")

        # Parse steps (simplified - should use better parsing)
        steps = []
        step_num = 1
        for line in reasoning_text.split("\n"):
            if line.strip().startswith("Step") or line.strip().startswith("Reasoning:"):
                steps.append(
                    {
                        "step_number": step_num,
                        "thought": line.strip(),
                        "reasoning": line.strip(),
                    }
                )
                step_num += 1

        # Extract conclusion
        conclusion = None
        if (
            "conclusion:" in reasoning_text.lower()
            or "answer:" in reasoning_text.lower()
        ):
            conclusion = (
                reasoning_text.split("conclusion:")[-1].split("answer:")[-1].strip()
            )

        logger.info(f"[AGENT] Completed reasoning with {len(steps)} steps")

        return {
            "ok": True,
            "data": {
                "problem": request.problem,
                "reasoning_type": request.reasoning_type,
                "steps": steps,
                "conclusion": conclusion,
                "full_reasoning": reasoning_text,
                "tokens": result.get("usage", {}),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Reasoning task failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


# Task planning endpoint
@router.post("/task-planning", response_model=TaskPlanningResponse)
async def task_planning(
    request: TaskPlanningRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Generate a task plan to achieve a goal
    """
    try:
        logger.info(f"[AGENT] Planning tasks for goal: {request.goal[:50]}...")

        llm = await manager.get_llm()

        tools_info = (
            f"Available tools: {', '.join(request.available_tools)}"
            if request.available_tools
            else ""
        )
        constraints_info = (
            f"Constraints: {', '.join(request.constraints)}"
            if request.constraints
            else ""
        )

        system_prompt = f"""You are a task planning assistant. Break down goals into actionable tasks.
{tools_info}
{constraints_info}

For each task, specify:
1. Task description
2. Which tool to use
3. Dependencies on other tasks
4. Priority (1-5, 5 being highest)
5. Estimated duration in seconds

Return as JSON array:
[{{"task_id": "t1", "description": "...", "tool": "...", "dependencies": [], "priority": 5, "estimated_duration": 30}}]"""

        prompt = f"Goal: {request.goal}\n\nCreate a task plan:"

        result = await llm.generate(
            system=system_prompt, prompt=prompt, max_tokens=2048, temperature=0.5
        )

        # Parse JSON response
        import json

        try:
            plan_text = result.get("text", "")
            # Extract JSON from response
            if "```json" in plan_text:
                plan_text = plan_text.split("```json")[1].split("```")[0]
            elif "```" in plan_text:
                plan_text = plan_text.split("```")[1].split("```")[0]

            tasks = json.loads(plan_text.strip())
        except:
            # Fallback if parsing fails
            tasks = [
                {
                    "task_id": "t1",
                    "description": "Execute goal using available tools",
                    "tool": "llm.generate",
                    "dependencies": [],
                    "priority": 3,
                    "estimated_duration": 30,
                }
            ]

        logger.info(f"[AGENT] Generated plan with {len(tasks)} tasks")

        return {
            "ok": True,
            "data": {
                "goal": request.goal,
                "tasks": tasks,
                "total_tasks": len(tasks),
                "estimated_total_duration": sum(
                    t.get("estimated_duration", 0) for t in tasks
                ),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Task planning failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


# Multi-task execution endpoint
@router.post("/multi-task", response_model=MultiTaskResponse)
async def multi_task_execution(
    request: MultiTaskRequest,
    agent: AgentOrchestrator = Depends(get_agent_orchestrator),
):
    """
    Execute multiple tasks (sequential or parallel)
    """
    try:
        logger.info(
            f"[AGENT] Multi-task execution: {len(request.tasks)} tasks (mode={request.execution_mode})"
        )

        start_time = time.time()
        results = []

        if request.execution_mode == "sequential":
            # Execute tasks one by one
            for i, task in enumerate(request.tasks):
                task_start = time.time()
                try:
                    task_result = await agent.run(
                        kind=task.get("kind", "custom"),
                        params=task.get("params", {}),
                        max_steps=task.get("max_steps", 5),
                        timeout_seconds=request.timeout_per_task,
                    )
                    results.append(
                        {
                            "task_index": i,
                            "status": "success",
                            "result": task_result,
                            "duration_ms": (time.time() - task_start) * 1000,
                        }
                    )
                except Exception as e:
                    results.append(
                        {
                            "task_index": i,
                            "status": "failed",
                            "error": str(e),
                            "duration_ms": (time.time() - task_start) * 1000,
                        }
                    )

        else:  # parallel
            # For parallel execution, would use asyncio.gather
            # Simplified here for demonstration
            import asyncio

            async def execute_task(index, task):
                task_start = time.time()
                try:
                    result = await agent.run(
                        kind=task.get("kind", "custom"),
                        params=task.get("params", {}),
                        max_steps=task.get("max_steps", 5),
                        timeout_seconds=request.timeout_per_task,
                    )
                    return {
                        "task_index": index,
                        "status": "success",
                        "result": result,
                        "duration_ms": (time.time() - task_start) * 1000,
                    }
                except Exception as e:
                    return {
                        "task_index": index,
                        "status": "failed",
                        "error": str(e),
                        "duration_ms": (time.time() - task_start) * 1000,
                    }

            results = await asyncio.gather(
                *[execute_task(i, task) for i, task in enumerate(request.tasks)]
            )

        total_duration = (time.time() - start_time) * 1000

        success_count = sum(1 for r in results if r.get("status") == "success")

        logger.info(
            f"[AGENT] Multi-task completed: {success_count}/{len(results)} succeeded in {total_duration}ms"
        )

        return {
            "ok": True,
            "data": {
                "execution_mode": request.execution_mode,
                "total_tasks": len(request.tasks),
                "successful": success_count,
                "failed": len(results) - success_count,
                "results": results,
                "total_duration_ms": total_duration,
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Multi-task execution failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


# Web search task endpoint
@router.post("/web-search", response_model=WebSearchResponse)
async def web_search_task(
    request: WebSearchTaskRequest,
    manager: ModelManager = Depends(get_model_manager),
):
    """
    Perform web search using Brave API and optionally summarize results.
    """
    try:
        logger.info(
            f"[AGENT] Web search: {request.query!r}, n={request.num_results}, summarize={request.summarize}"
        )

        # 1) Call Brave-backed search (real HTTP)
        results = await web_search_results(
            query=request.query,
            max_results=request.num_results,
            recency_days=request.recency_days,
            domains=request.domains,
            timeout_seconds=float(getattr(settings, "WEB_SEARCH_TIMEOUT", 12.0)),
        )

        # 2) Optional summarization with LLM
        summary: Optional[str] = None
        if request.summarize and results:
            llm = await manager.get_llm()

            combined_text = "\n\n".join(
                [
                    f"[{i+1}] {r['title']}\n{r['snippet']}\nURL: {r['url']}"
                    for i, r in enumerate(results)
                ]
            )

            system_prompt = (
                "You are a research assistant. Summarize the search results concisely into bullet points. "
                "Prefer facts consistent across sources. Include source indices when helpful."
            )
            prompt = f"Query: {request.query}\n\nSearch results:\n{combined_text}\n\nSummary:"

            gen = await llm.generate(
                system=system_prompt,
                prompt=prompt,
                max_tokens=512,
                temperature=0.5,
            )
            summary = (gen or {}).get("text", "").strip() or None

        logger.info(
            f"[AGENT] Web search completed: {len(results)} results (has_summary={summary is not None})"
        )

        return {
            "ok": True,
            "data": {
                "query": request.query,
                "results": results,  # now real results from Brave
                "total_results": len(results),
                "summary": summary,
                "has_summary": summary is not None,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ERR] Web search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


# Main agent run endpoint (enhanced)
@router.post("/run", response_model=AgentRunResponse)
async def agent_run(
    request: AgentRunRequest,
    manager: ModelManager = Depends(get_model_manager),
    agent: AgentOrchestrator = Depends(get_agent_orchestrator),
):
    """
    Execute multi-step agentic task with full orchestration
    """
    try:
        logger.info(f"[AGENT] Running task: {request.kind}")

        result = await agent.run(
            kind=request.kind,
            params=request.params,
            max_steps=request.max_steps,
            timeout_seconds=request.timeout_seconds,
        )

        logger.info(
            f"[AGENT] Completed {request.kind} in {result['durationMs']}ms ({len(result['steps'])} steps)"
        )

        return {"ok": True, "data": result}

    except Exception as e:
        logger.error(f"[ERR] Agent task failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {
                    "code": (
                        "AI_TIMEOUT"
                        if "timeout" in str(e).lower()
                        else "AI_MODEL_ERROR"
                    ),
                    "message": str(e),
                },
            },
        )


class PersonaChallengeRequest(BaseModel):
    persona_name: str = Field(..., description="Persona name")
    messages: List[Dict[str, str]] = Field(..., description="User messages to filter")
    max_replies: int = Field(5, ge=1, le=20)


# Persona challenge endpoint
@router.post("/persona-challenge")
async def persona_challenge(
    request: PersonaChallengeRequest,
    manager: ModelManager = Depends(get_model_manager),
):
    """
    Filter and generate persona responses for challenge game
    """
    try:
        logger.info(
            f"[AGENT] Persona challenge: {request.persona_name} ({len(request.messages)} messages)"
        )

        llm = await manager.get_llm()

        # Filter messages (scoring)
        system_prompt = f"""You are evaluating which messages are directed at {request.persona_name}.
Score each message from 0-10 based on relevance and engagement potential.
Return JSON array: [{{"index": 0, "score": 8, "reason": "..."}}]"""

        filter_result = await llm.generate(
            system=system_prompt,
            prompt=f"Messages:\n"
            + "\n".join([f"{i}. {m['content']}" for i, m in enumerate(request.messages)]),
            max_tokens=1024,
            temperature=0.3,
        )

        # Parse scores
        import json

        try:
            scores = json.loads(filter_result.get("text", "[]"))
        except:
            scores = []

        # Generate replies for top messages
        top_messages = sorted(scores, key=lambda x: x.get("score", 0), reverse=True)[
            :request.max_replies
        ]

        replies = []
        for item in top_messages:
            idx = item.get("index", 0)
            if idx < len(request.messages):
                msg = request.messages[idx]

                reply_result = await llm.generate(
                    system=f"You are {request.persona_name}. Respond naturally and in character.",
                    prompt=f"User said: {msg['content']}\n\nYour response:",
                    max_tokens=256,
                    temperature=0.8,
                )

                replies.append(
                    {
                        "message_index": idx,
                        "user_id": msg.get("user_id"),
                        "reply": reply_result.get("text", "").strip(),
                        "score": item.get("score", 0),
                        "reason": item.get("reason", ""),
                    }
                )

        logger.info(f"[AGENT] Generated {len(replies)} persona replies")

        return {
            "ok": True,
            "data": {
                "persona": request.persona_name,
                "replies": replies,
                "total_evaluated": len(request.messages),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Persona challenge failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )
