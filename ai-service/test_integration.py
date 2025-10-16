"""
Integration test to verify all components work together
"""
import asyncio
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.models.manager import ModelManager
from app.services.rag.search import RAGSearchService
from app.config import settings


async def test_model_manager():
    """Test ModelManager service accessor methods"""
    print("🧪 Testing ModelManager...")

    manager = ModelManager()

    # Test get_llm
    try:
        llm = await manager.get_llm()
        print("✅ get_llm() works - returns LLMService instance")
        assert hasattr(llm, 'generate'), "LLMService should have generate method"
        assert hasattr(llm, 'chat'), "LLMService should have chat method"
    except Exception as e:
        print(f"❌ get_llm() failed: {e}")
        return False

    # Test get_embeddings
    try:
        embeddings = await manager.get_embeddings()
        print("✅ get_embeddings() works - returns EmbeddingsService instance")
        assert hasattr(embeddings, 'embed'), "EmbeddingsService should have embed method"
        assert hasattr(embeddings, 'get_info'), "EmbeddingsService should have get_info method"
    except Exception as e:
        print(f"❌ get_embeddings() failed: {e}")
        return False

    # Test get_vlm
    try:
        vlm = await manager.get_vlm()
        print("✅ get_vlm() works - returns VLMService instance")
        assert hasattr(vlm, 'describe_image'), "VLMService should have describe_image method"
    except Exception as e:
        print(f"❌ get_vlm() failed: {e}")
        return False

    return True


async def test_rag_service():
    """Test RAGSearchService methods"""
    print("\n🧪 Testing RAGSearchService...")

    manager = ModelManager()
    rag = RAGSearchService(
        mongodb_uri=settings.MONGODB_URI,
        db_name=settings.MONGODB_DB,
        model_manager=manager
    )

    # Test insert with correct parameters
    try:
        doc_id = await rag.insert(
            text="Elio is a curious young boy who becomes the Earth's representative to the galaxy.",
            source="test_doc",
            guild_id="test_guild",
            metadata={"type": "character_info"},
            url="https://example.com/elio"
        )
        print(f"✅ insert() works - returned doc_id: {doc_id}")
        assert isinstance(doc_id, str), "doc_id should be a string"
    except Exception as e:
        print(f"❌ insert() failed: {e}")
        return False

    # Test search with correct parameters
    try:
        results = await rag.search(
            query="Who is Elio?",
            top_k=5,
            search_type="semantic",
            guild_id="test_guild"
        )
        print(f"✅ search() works - returned {len(results)} results")

        if results:
            result = results[0]
            required_keys = ['doc_id', 'chunk', 'source', 'score']
            for key in required_keys:
                assert key in result, f"Result should contain '{key}' key"
            print(f"✅ Search result format correct: {list(result.keys())}")
    except Exception as e:
        print(f"❌ search() failed: {e}")
        return False

    # Test get_stats
    try:
        stats = await rag.get_stats()
        print(f"✅ get_stats() works - returned: {stats}")
        assert 'total_documents' in stats, "stats should contain total_documents"
    except Exception as e:
        print(f"❌ get_stats() failed: {e}")
        return False

    return True


async def test_service_signatures():
    """Test that service method signatures match router expectations"""
    print("\n🧪 Testing Service Method Signatures...")

    manager = ModelManager()

    # Test LLMService.generate signature
    try:
        llm = await manager.get_llm()
        import inspect
        sig = inspect.signature(llm.generate)
        params = list(sig.parameters.keys())

        # Check for expected parameters
        assert 'prompt' in params, "generate should have 'prompt' parameter"
        assert 'system' in params, "generate should have 'system' parameter (not system_prompt)"
        assert 'stop' in params, "generate should have 'stop' parameter (not stop_sequences)"
        assert 'max_tokens' in params, "generate should have 'max_tokens' parameter"
        assert 'temperature' in params, "generate should have 'temperature' parameter"

        print(f"✅ LLMService.generate() signature correct: {params}")
    except Exception as e:
        print(f"❌ LLMService.generate() signature check failed: {e}")
        return False

    # Test EmbeddingsService.embed signature
    try:
        embeddings = await manager.get_embeddings()
        sig = inspect.signature(embeddings.embed)
        params = list(sig.parameters.keys())

        assert 'texts' in params, "embed should have 'texts' parameter"
        assert 'lang_hint' in params, "embed should have 'lang_hint' parameter"

        print(f"✅ EmbeddingsService.embed() signature correct: {params}")
    except Exception as e:
        print(f"❌ EmbeddingsService.embed() signature check failed: {e}")
        return False

    # Test VLMService.describe_image signature
    try:
        vlm = await manager.get_vlm()
        sig = inspect.signature(vlm.describe_image)
        params = list(sig.parameters.keys())

        assert 'image_url' in params, "describe_image should have 'image_url' parameter"
        assert 'question' in params, "describe_image should have 'question' parameter (not prompt)"

        print(f"✅ VLMService.describe_image() signature correct: {params}")
    except Exception as e:
        print(f"❌ VLMService.describe_image() signature check failed: {e}")
        return False

    return True


async def main():
    """Run all integration tests"""
    print("="*60)
    print("🚀 Starting Integration Tests")
    print("="*60)

    results = []

    # Run tests
    results.append(await test_model_manager())
    results.append(await test_rag_service())
    results.append(await test_service_signatures())

    # Summary
    print("\n" + "="*60)
    passed = sum(results)
    total = len(results)

    if passed == total:
        print(f"✅ All tests passed! ({passed}/{total})")
        print("="*60)
        return 0
    else:
        print(f"❌ Some tests failed! ({passed}/{total} passed)")
        print("="*60)
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
