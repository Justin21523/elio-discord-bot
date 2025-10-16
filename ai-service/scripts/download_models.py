#!/usr/bin/env python3
"""
Optimized Model Download Script with Snapshot Support
Fast downloads using HuggingFace snapshots
"""

import os
import sys
import argparse
from pathlib import Path
from huggingface_hub import snapshot_download, hf_hub_download
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import MODEL_REGISTRY, settings


# Extended model registry with download priorities
DOWNLOAD_MODELS = {
    # LLM Models (Priority 1 - Essential)
    "deepseek-7b": {
        "repo_id": "deepseek-ai/deepseek-llm-7b-chat",
        "type": "llm",
        "priority": 1,
        "size": "~14GB",
    },
    "qwen2.5-7b": {
        "repo_id": "Qwen/Qwen2.5-7B-Instruct",
        "type": "llm",
        "priority": 1,
        "size": "~15GB",
    },
    "llama3.1-8b": {
        "repo_id": "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "type": "llm",
        "priority": 2,
        "size": "~16GB",
        "requires_auth": True,
    },
    "mistral-7b": {
        "repo_id": "mistralai/Mistral-7B-Instruct-v0.3",
        "type": "llm",
        "priority": 2,
        "size": "~14GB",
    },
    # Coding Models
    "deepseek-coder": {
        "repo_id": "deepseek-ai/deepseek-coder-6.7b-instruct",
        "type": "llm",
        "priority": 3,
        "size": "~13GB",
    },
    "qwen2.5-coder": {
        "repo_id": "Qwen/Qwen2.5-Coder-7B-Instruct",
        "type": "llm",
        "priority": 3,
        "size": "~15GB",
    },
    # VLM Models (Priority 2)
    "qwen-vl": {
        "repo_id": "Qwen/Qwen-VL-Chat",
        "type": "vlm",
        "priority": 2,
        "size": "~20GB",
    },
    "llava-next": {
        "repo_id": "llava-hf/llava-v1.6-mistral-7b-hf",
        "type": "vlm",
        "priority": 3,
        "size": "~15GB",
    },
    # Embeddings Models (Priority 1 - Essential)
    "bge-m3": {
        "repo_id": "BAAI/bge-m3",
        "type": "embeddings",
        "priority": 1,
        "size": "~2GB",
    },
    "gte-large-zh": {
        "repo_id": "thenlper/gte-large-zh",
        "type": "embeddings",
        "priority": 2,
        "size": "~700MB",
    },
    "bge-large-en": {
        "repo_id": "BAAI/bge-large-en-v1.5",
        "type": "embeddings",
        "priority": 2,
        "size": "~1.3GB",
    },
    # Reranker (Priority 2)
    "bge-reranker": {
        "repo_id": "BAAI/bge-reranker-base",
        "type": "reranker",
        "priority": 2,
        "size": "~1GB",
    },
}


def download_model_snapshot(
    model_key: str, force: bool = False, use_hf_transfer: bool = True
):
    """
    Download model using snapshot (fastest method)

    Args:
        model_key: Model key from DOWNLOAD_MODELS
        force: Force re-download even if exists
        use_hf_transfer: Use hf_transfer for faster downloads
    """

    if model_key not in DOWNLOAD_MODELS:
        print(f"❌ Unknown model: {model_key}")
        print(f"Available models: {', '.join(DOWNLOAD_MODELS.keys())}")
        return False

    model_info = DOWNLOAD_MODELS[model_key]
    repo_id = model_info["repo_id"]
    model_type = model_info["type"]
    size = model_info.get("size", "unknown")

    print(f"\n{'='*70}")
    print(f"📦 Downloading: {model_key}")
    print(f"   Repository: {repo_id}")
    print(f"   Type: {model_type}")
    print(f"   Size: {size}")
    print(f"{'='*70}\n")

    try:
        cache_dir = settings.MODEL_CACHE_DIR
        os.makedirs(cache_dir, exist_ok=True)

        # Check if model requires authentication
        token = None
        if model_info.get("requires_auth"):
            token = os.getenv("HF_TOKEN") or settings.HF_TOKEN
            if not token:
                print("⚠️  This model requires HuggingFace authentication")
                print("   Set HF_TOKEN environment variable or in .env file")
                return False

        # Enable fast downloads if available
        if use_hf_transfer:
            try:
                import hf_transfer

                os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
                print("🚀 Fast transfer enabled (hf_transfer)")
            except ImportError:
                print(
                    "💡 Install hf_transfer for faster downloads: pip install hf-transfer"
                )

        # Download using snapshot (fastest)
        print("Downloading model files...")
        local_dir = snapshot_download(
            repo_id=repo_id,
            cache_dir=cache_dir,
            token=token,
            resume_download=True,
            local_files_only=False,
            ignore_patterns=["*.msgpack", "*.h5", "*.ot"],  # Skip unnecessary files
        )

        print(f"✅ Model downloaded successfully!")
        print(f"   Location: {local_dir}\n")

        return True

    except Exception as e:
        print(f"❌ Download failed: {str(e)}\n")
        return False


def download_by_priority(priority: int, use_hf_transfer: bool = True):
    """Download all models of a specific priority"""
    models = [
        (key, info)
        for key, info in DOWNLOAD_MODELS.items()
        if info.get("priority") == priority
    ]

    if not models:
        print(f"No models found for priority {priority}")
        return

    print(f"\n{'='*70}")
    print(f"Downloading Priority {priority} Models ({len(models)} models)")
    print(f"{'='*70}\n")

    success_count = 0
    for key, info in models:
        if download_model_snapshot(key, use_hf_transfer=use_hf_transfer):
            success_count += 1

    print(f"\n{'='*70}")
    print(f"Priority {priority} Complete: {success_count}/{len(models)} successful")
    print(f"{'='*70}\n")


def list_models():
    """List all available models"""
    print("\n" + "=" * 70)
    print("Available Models for Download")
    print("=" * 70 + "\n")

    by_priority = {}
    for key, info in DOWNLOAD_MODELS.items():
        priority = info.get("priority", 99)
        if priority not in by_priority:
            by_priority[priority] = []
        by_priority[priority].append((key, info))

    for priority in sorted(by_priority.keys()):
        print(
            f"\n🔷 Priority {priority} {'(Essential)' if priority == 1 else '(Optional)'}"
        )
        print("-" * 70)

        for key, info in by_priority[priority]:
            print(f"  • {key:<20} ({info['type']:<11}) - {info['size']}")
            print(f"    {info['repo_id']}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Fast model download with snapshot support"
    )

    parser.add_argument("--model", type=str, help="Model key to download")

    parser.add_argument(
        "--priority",
        type=int,
        choices=[1, 2, 3],
        help="Download all models of specific priority",
    )

    parser.add_argument(
        "--essential",
        action="store_true",
        help="Download only essential models (priority 1)",
    )

    parser.add_argument("--all", action="store_true", help="Download all models")

    parser.add_argument("--list", action="store_true", help="List available models")

    parser.add_argument(
        "--no-fast-transfer",
        action="store_true",
        help="Disable fast transfer (hf_transfer)",
    )

    args = parser.parse_args()

    use_fast = not args.no_fast_transfer

    if args.list:
        list_models()
        return

    if args.essential:
        download_by_priority(1, use_fast)

    elif args.priority:
        download_by_priority(args.priority, use_fast)

    elif args.all:
        for priority in [1, 2, 3]:
            download_by_priority(priority, use_fast)

    elif args.model:
        download_model_snapshot(args.model, use_hf_transfer=use_fast)

    else:
        parser.print_help()
        print("\n💡 Quick start: python download_models.py --essential")


if __name__ == "__main__":
    main()
