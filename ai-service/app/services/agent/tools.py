"""
Agent Tools Registry
"""

from typing import Dict, Any, List, Optional, Callable
from app.utils.logger import log_info


class ToolRegistry:
    """Registry for agent tools"""

    def __init__(self):
        self.tools: Dict[str, Dict[str, Any]] = {}

    async def initialize(self):
        """Initialize all tools"""
        log_info("Initializing agent tools")

        # Register built-in tools
        self._register_builtin_tools()

        log_info("Agent tools initialized", count=len(self.tools))

    def register_tool(
        self,
        name: str,
        description: str,
        function: Callable,
        parameters: Dict[str, Any],
    ):
        """Register a new tool"""
        self.tools[name] = {
            "name": name,
            "description": description,
            "function": function,
            "parameters": parameters,
        }

        log_info("Tool registered", name=name)

    def get_tools(self, tool_names: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get tools by name, or all if None"""
        if tool_names is None:
            return self.tools

        return {name: tool for name, tool in self.tools.items() if name in tool_names}

    def _register_builtin_tools(self):
        """Register built-in tools"""

        # RAG Search Tool - wrapper function for class method
        async def rag_search_wrapper(query: str, top_k: int = 5, **kwargs):
            """Wrapper for RAG search service"""
            # Import here to avoid circular dependency
            from app.dependencies import get_rag_service_sync

            rag_service = get_rag_service_sync()
            if rag_service is None:
                return {"error": "RAG service not initialized"}

            results = await rag_service.search(
                query=query, top_k=top_k, search_type="hybrid"
            )

            # Format results for agent
            formatted = []
            for r in results:
                formatted.append(
                    {
                        "source": r.get("source", "unknown"),
                        "content": r.get("chunk", "")[:300],  # Limit length
                        "score": r.get("score", 0.0),
                        "url": r.get("url"),
                    }
                )

            return {"results": formatted, "count": len(results)}

        self.register_tool(
            name="rag_search",
            description="Search knowledge base for relevant information",
            function=rag_search_wrapper,
            parameters={
                "query": "Search query string",
                "top_k": "Number of results (default: 5)",
            },
        )

        # Web Search Tool
        from app.services.agent.web_search import web_search

        self.register_tool(
            name="web_search",
            description="Search the web for current information",
            function=web_search,
            parameters={
                "query": "Search query",
                "max_results": "Maximum results (default: 5)",
            },
        )

        # Calculator Tool
        self.register_tool(
            name="calculator",
            description="Perform mathematical calculations",
            function=self._calculator,
            parameters={"expression": "Math expression to evaluate"},
        )

    async def _calculator(self, expression: str) -> str:
        """Simple calculator tool"""
        try:
            # Safe evaluation of math expressions
            import ast
            import operator

            # Allowed operations
            ops = {
                ast.Add: operator.add,
                ast.Sub: operator.sub,
                ast.Mult: operator.mul,
                ast.Div: operator.truediv,
                ast.Pow: operator.pow,
                ast.USub: operator.neg,
            }

            def eval_expr(node):
                if isinstance(node, ast.Num):
                    return node.n
                elif isinstance(node, ast.BinOp):
                    return ops[type(node.op)](
                        eval_expr(node.left), eval_expr(node.right)
                    )
                elif isinstance(node, ast.UnaryOp):
                    return ops[type(node.op)](eval_expr(node.operand))
                else:
                    raise ValueError("Unsupported operation")

            node = ast.parse(expression, mode="eval")
            result = eval_expr(node.body)

            return f"Result: {result}"

        except Exception as e:
            return f"Calculation error: {str(e)}"


# Global tool registry
tool_registry = ToolRegistry()
