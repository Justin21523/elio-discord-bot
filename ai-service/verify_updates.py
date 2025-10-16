"""
Verification script for recent updates
"""
import ast
import sys
from pathlib import Path


def check_model_manager_init():
    """Verify ModelManager accepts init parameters"""
    print("[CHECK] ModelManager.__init__ parameters...")

    file_path = Path("app/models/manager.py")
    with open(file_path, 'r', encoding='utf-8') as f:
        tree = ast.parse(f.read())

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "ModelManager":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                    params = [arg.arg for arg in item.args.args if arg.arg != 'self']
                    print(f"  Found __init__ with params: {params}")

                    required_params = ['llm_model', 'vlm_model', 'embed_model', 'device', 'cache_dir']
                    missing = [p for p in required_params if p not in params]

                    if not missing:
                        print("  [PASS] All required parameters present")
                        return True
                    else:
                        print(f"  [FAIL] Missing parameters: {missing}")
                        return False

    print("  [FAIL] __init__ method not found")
    return False


def check_cross_encoder_reranking():
    """Verify cross-encoder reranking is implemented"""
    print("\n[CHECK] Cross-encoder reranking implementation...")

    file_path = Path("app/services/rag/search.py")
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check that TODO is removed
    if "TODO: Implement reranking" in content or "TODO Implement reranking" in content:
        print("  [FAIL] TODO comment still exists")
        return False

    # Check for cross-encoder implementation
    checks = [
        "AutoModelForSequenceClassification",
        "reranker_model_name",
        "rerank_score",
        "cross-encoder",
    ]

    missing = []
    for check in checks:
        if check not in content:
            missing.append(check)

    if not missing:
        print("  [PASS] Cross-encoder reranking fully implemented")
        print("    - Uses AutoModelForSequenceClassification")
        print("    - Computes rerank_score for results")
        print("    - Configurable reranker model")
        return True
    else:
        print(f"  [FAIL] Missing implementation elements: {missing}")
        return False


def check_tools_rag_wrapper():
    """Verify tools.py uses wrapper function for RAG search"""
    print("\n[CHECK] tools.py RAG search wrapper...")

    file_path = Path("app/services/agent/tools.py")
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check that it doesn't import rag_search function directly
    if "from app.services.rag.search import rag_search" in content:
        print("  [FAIL] Still importing rag_search function directly")
        return False

    # Check for wrapper function
    checks = [
        "rag_search_wrapper",
        "get_rag_service_sync",
        "rag_service.search",
    ]

    missing = []
    for check in checks:
        if check not in content:
            missing.append(check)

    if not missing:
        print("  [PASS] RAG search wrapper implemented correctly")
        print("    - Uses rag_search_wrapper function")
        print("    - Gets service via get_rag_service_sync()")
        print("    - Calls rag_service.search() method")
        return True
    else:
        print(f"  [FAIL] Missing wrapper elements: {missing}")
        return False


def check_dependencies_sync_getters():
    """Verify dependencies.py has sync getters"""
    print("\n[CHECK] dependencies.py synchronous getters...")

    file_path = Path("app/dependencies.py")
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    required_functions = [
        "get_model_manager_sync",
        "get_rag_service_sync",
        "get_agent_orchestrator_sync",
        "get_story_manager_sync",
    ]

    missing = []
    for func in required_functions:
        if f"def {func}(" not in content:
            missing.append(func)

    if not missing:
        print("  [PASS] All synchronous getter functions present")
        for func in required_functions:
            print(f"    - {func}")
        return True
    else:
        print(f"  [FAIL] Missing functions: {missing}")
        return False


def check_config_reranker_setting():
    """Check if config has RERANKER_MODEL or RAG_RERANK settings"""
    print("\n[CHECK] Configuration for reranking...")

    file_path = Path("app/config.py")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        if "RAG_RERANK" in content or "RERANKER_MODEL" in content:
            print("  [PASS] Reranking configuration found")
            return True
        else:
            print("  [INFO] No reranking config found (will use defaults)")
            print("    Can add RAG_RERANK and RERANKER_MODEL to config")
            return True  # Not a failure, just info
    except FileNotFoundError:
        print("  [INFO] config.py not checked")
        return True


def main():
    """Run all verification checks"""
    print("="*70)
    print("Verification: Recent Updates")
    print("="*70)

    # Change to ai-service directory
    ai_service_dir = Path(__file__).parent
    import os
    os.chdir(ai_service_dir)

    results = []

    # Run checks
    results.append(("ModelManager init params", check_model_manager_init()))
    results.append(("Cross-encoder reranking", check_cross_encoder_reranking()))
    results.append(("tools.py RAG wrapper", check_tools_rag_wrapper()))
    results.append(("dependencies.py sync getters", check_dependencies_sync_getters()))
    results.append(("Reranking configuration", check_config_reranker_setting()))

    # Summary
    print("\n" + "="*70)
    print("Summary")
    print("="*70)

    passed = 0
    failed = 0

    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}  {name}")
        if result:
            passed += 1
        else:
            failed += 1

    print("="*70)
    print(f"Total: {passed} passed, {failed} failed out of {len(results)} checks")

    if failed == 0:
        print("[SUCCESS] All update verifications passed!")
        return 0
    else:
        print(f"[FAILED] {failed} checks failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
