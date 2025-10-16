"""
Static verification of integration completeness
Checks that all routers, services, and methods are properly connected
"""
import ast
import sys
from pathlib import Path


def check_method_exists(file_path, class_name, method_name):
    """Check if a method exists in a class"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read())

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name == class_name:
                for item in node.body:
                    if isinstance(item, ast.AsyncFunctionDef) and item.name == method_name:
                        return True, item
                    if isinstance(item, ast.FunctionDef) and item.name == method_name:
                        return True, item
        return False, None
    except Exception as e:
        print(f"    Error parsing {file_path}: {e}")
        return False, None


def get_method_params(method_node):
    """Extract parameter names from a method node"""
    if not method_node:
        return []
    return [arg.arg for arg in method_node.args.args if arg.arg != 'self']


def verify_model_manager():
    """Verify ModelManager has required methods"""
    print(" Checking ModelManager...")
    file_path = Path("app/models/manager.py")

    checks = [
        ("get_llm", ["model_name"]),
        ("get_vlm", ["model_name"]),
        ("get_embeddings", ["model_name"]),
    ]

    all_passed = True
    for method_name, expected_params in checks:
        exists, method_node = check_method_exists(file_path, "ModelManager", method_name)
        if exists:
            params = get_method_params(method_node)
            print(f"   ModelManager.{method_name}() exists with params: {params}")
        else:
            print(f"   ModelManager.{method_name}() NOT FOUND")
            all_passed = False

    return all_passed


def verify_llm_service():
    """Verify LLMService has correct method signatures"""
    print("\n Checking LLMService...")
    file_path = Path("app/models/llm.py")

    # Check generate method
    exists, method_node = check_method_exists(file_path, "LLMService", "generate")
    if exists:
        params = get_method_params(method_node)
        print(f"   LLMService.generate() exists with params: {params}")

        # Verify critical parameters
        if 'system' in params and 'prompt' in params and 'stop' in params:
            print(f"   Has 'system' (not 'system_prompt'), 'prompt', 'stop' (not 'stop_sequences')")
        else:
            print(f"    Parameter names might not match router expectations")
            print(f"     Expected: 'system', 'prompt', 'stop'")
    else:
        print(f"   LLMService.generate() NOT FOUND")
        return False

    # Check chat method
    exists, method_node = check_method_exists(file_path, "LLMService", "chat")
    if exists:
        params = get_method_params(method_node)
        print(f"   LLMService.chat() exists with params: {params}")
    else:
        print(f"   LLMService.chat() NOT FOUND")
        return False

    return True


def verify_embeddings_service():
    """Verify EmbeddingsService has correct signatures"""
    print("\n Checking EmbeddingsService...")
    file_path = Path("app/models/embedings.py")

    # Check embed method
    exists, method_node = check_method_exists(file_path, "EmbeddingsService", "embed")
    if exists:
        params = get_method_params(method_node)
        print(f"   EmbeddingsService.embed() exists with params: {params}")

        if 'lang_hint' in params:
            print(f"   Has 'lang_hint' parameter")
        else:
            print(f"    Missing 'lang_hint' parameter")
    else:
        print(f"   EmbeddingsService.embed() NOT FOUND")
        return False

    # Check get_info method
    exists, method_node = check_method_exists(file_path, "EmbeddingsService", "get_info")
    if exists:
        print(f"   EmbeddingsService.get_info() exists")
    else:
        print(f"   EmbeddingsService.get_info() NOT FOUND")
        return False

    return True


def verify_vlm_service():
    """Verify VLMService has correct signatures"""
    print("\n Checking VLMService...")
    file_path = Path("app/models/vlm.py")

    # Check describe_image method
    exists, method_node = check_method_exists(file_path, "VLMService", "describe_image")
    if exists:
        params = get_method_params(method_node)
        print(f"   VLMService.describe_image() exists with params: {params}")

        if 'question' in params:
            print(f"   Has 'question' parameter (not 'prompt')")
        else:
            print(f"    Should have 'question' parameter (not 'prompt')")
    else:
        print(f"   VLMService.describe_image() NOT FOUND")
        return False

    return True


def verify_rag_service():
    """Verify RAGSearchService has all required methods"""
    print("\n Checking RAGSearchService...")
    file_path = Path("app/services/rag/search.py")

    methods_to_check = [
        ("search", ["query", "top_k", "search_type", "guild_id"]),
        ("insert", ["text", "source", "guild_id", "metadata", "url"]),
        ("add_documents", ["documents"]),
        ("delete_document", ["doc_id"]),
        ("get_stats", []),
    ]

    all_passed = True
    for method_name, expected_params in methods_to_check:
        exists, method_node = check_method_exists(file_path, "RAGSearchService", method_name)
        if exists:
            params = get_method_params(method_node)
            print(f"   RAGSearchService.{method_name}() exists with params: {params}")

            # Verify expected parameters are present
            missing_params = [p for p in expected_params if p not in params]
            if missing_params:
                print(f"    Missing expected params: {missing_params}")
        else:
            print(f"   RAGSearchService.{method_name}() NOT FOUND")
            all_passed = False

    # Check for vector store and BM25 classes
    print(f"\n   Checking supporting classes...")
    exists_vector, _ = check_method_exists(file_path, "InMemoryVectorStore", "search")
    exists_bm25, _ = check_method_exists(file_path, "InMemoryBM25Index", "search")

    if exists_vector:
        print(f"   InMemoryVectorStore class exists")
    else:
        print(f"   InMemoryVectorStore class NOT FOUND")
        all_passed = False

    if exists_bm25:
        print(f"   InMemoryBM25Index class exists")
    else:
        print(f"   InMemoryBM25Index class NOT FOUND")
        all_passed = False

    return all_passed


def verify_dependencies():
    """Verify dependencies.py has all required functions"""
    print("\n Checking dependencies.py...")
    file_path = Path("app/dependencies.py")

    functions_to_check = [
        "get_model_manager",
        "get_rag_service",
        "get_agent_orchestrator",
        "get_story_manager",
    ]

    all_passed = True
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read())

        for func_name in functions_to_check:
            exists = any(
                isinstance(node, ast.AsyncFunctionDef) and node.name == func_name
                or isinstance(node, ast.FunctionDef) and node.name == func_name
                for node in ast.walk(tree)
            )
            if exists:
                print(f"   {func_name}() exists")
            else:
                print(f"   {func_name}() NOT FOUND")
                all_passed = False
    except Exception as e:
        print(f"   Error checking dependencies.py: {e}")
        all_passed = False

    return all_passed


def verify_agent_orchestrator():
    """Verify AgentOrchestrator exists"""
    print("\n Checking AgentOrchestrator...")
    file_path = Path("app/services/agent/core.py")

    exists, method_node = check_method_exists(file_path, "AgentOrchestrator", "run")
    if exists:
        params = get_method_params(method_node)
        print(f"   AgentOrchestrator.run() exists with params: {params}")
        return True
    else:
        print(f"   AgentOrchestrator.run() NOT FOUND")
        return False


def main():
    """Run all verification checks"""
    print("="*70)
    print(" Static Integration Verification")
    print("="*70)

    results = []

    # Change to ai-service directory
    ai_service_dir = Path(__file__).parent
    import os
    os.chdir(ai_service_dir)

    # Run all checks
    results.append(("ModelManager", verify_model_manager()))
    results.append(("LLMService", verify_llm_service()))
    results.append(("EmbeddingsService", verify_embeddings_service()))
    results.append(("VLMService", verify_vlm_service()))
    results.append(("RAGSearchService", verify_rag_service()))
    results.append(("Dependencies", verify_dependencies()))
    results.append(("AgentOrchestrator", verify_agent_orchestrator()))

    # Summary
    print("\n" + "="*70)
    print(" Verification Summary")
    print("="*70)

    passed = 0
    failed = 0

    for name, result in results:
        status = " PASS" if result else " FAIL"
        print(f"{status}  {name}")
        if result:
            passed += 1
        else:
            failed += 1

    print("="*70)
    print(f"Total: {passed} passed, {failed} failed out of {len(results)} checks")

    if failed == 0:
        print(" All integration checks passed!")
        return 0
    else:
        print(f" {failed} integration checks failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
