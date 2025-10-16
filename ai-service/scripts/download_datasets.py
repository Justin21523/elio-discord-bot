#!/usr/bin/env python3
"""
Comprehensive Dataset Download Script
Fast downloads with snapshot support, multiple categories
"""

import os
import sys
import argparse
import json
from pathlib import Path
from huggingface_hub import snapshot_download
from datasets import load_dataset

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings


# Comprehensive dataset registry with categories
DATASET_REGISTRY = {
    # ========================================================================
    # INSTRUCTION FOLLOWING (通用指令跟随)
    # ========================================================================
    "alpaca": {
        "repo_id": "tatsu-lab/alpaca",
        "category": "instruction",
        "description": "52K instruction-following dataset",
        "size": "~25MB",
        "language": "en",
        "priority": 1,
    },
    "alpaca-gpt4": {
        "repo_id": "vicgalle/alpaca-gpt4",
        "category": "instruction",
        "description": "GPT-4 generated Alpaca (higher quality)",
        "size": "~50MB",
        "language": "en",
        "priority": 1,
    },
    "databricks-dolly": {
        "repo_id": "databricks/databricks-dolly-15k",
        "category": "instruction",
        "description": "15K human-generated instruction pairs",
        "size": "~13MB",
        "language": "en",
        "priority": 2,
    },
    "open-orca": {
        "repo_id": "Open-Orca/OpenOrca",
        "category": "instruction",
        "description": "Large-scale instruction tuning dataset",
        "size": "~3GB",
        "language": "en",
        "priority": 3,
    },
    # ========================================================================
    # CONVERSATION (对话)
    # ========================================================================
    "oasst1": {
        "repo_id": "OpenAssistant/oasst1",
        "category": "conversation",
        "description": "Open Assistant conversation trees",
        "size": "~170MB",
        "language": "multilingual",
        "priority": 1,
    },
    "oasst2": {
        "repo_id": "OpenAssistant/oasst2",
        "category": "conversation",
        "description": "Open Assistant v2 (improved)",
        "size": "~200MB",
        "language": "multilingual",
        "priority": 1,
    },
    "ultrachat": {
        "repo_id": "stingning/ultrachat",
        "category": "conversation",
        "description": "1.4M multi-turn conversations",
        "size": "~2GB",
        "language": "en",
        "priority": 2,
    },
    "sharegpt": {
        "repo_id": "anon8231489123/ShareGPT_Vicuna_unfiltered",
        "category": "conversation",
        "description": "ShareGPT conversations",
        "size": "~500MB",
        "language": "en",
        "priority": 2,
    },
    # ========================================================================
    # CODE (代码)
    # ========================================================================
    "code-alpaca": {
        "repo_id": "sahil2801/CodeAlpaca-20k",
        "category": "code",
        "description": "20K code instruction pairs",
        "size": "~12MB",
        "language": "code",
        "priority": 1,
    },
    "code-feedback": {
        "repo_id": "m-a-p/CodeFeedback-Filtered-Instruction",
        "category": "code",
        "description": "High-quality code instructions with feedback",
        "size": "~150MB",
        "language": "code",
        "priority": 1,
    },
    "evol-codealpaca": {
        "repo_id": "theblackcat102/evol-codealpaca-v1",
        "category": "code",
        "description": "Evolved code instructions",
        "size": "~80MB",
        "language": "code",
        "priority": 2,
    },
    "python-code": {
        "repo_id": "iamtarun/python_code_instructions_18k_alpaca",
        "category": "code",
        "description": "18K Python code instructions",
        "size": "~10MB",
        "language": "code",
        "priority": 2,
    },
    # ========================================================================
    # MATH (数学)
    # ========================================================================
    "metamath": {
        "repo_id": "meta-math/MetaMathQA",
        "category": "math",
        "description": "395K math problems with solutions",
        "size": "~250MB",
        "language": "en",
        "priority": 1,
    },
    "gsm8k": {
        "repo_id": "gsm8k",
        "category": "math",
        "description": "Grade school math problems",
        "size": "~5MB",
        "language": "en",
        "priority": 1,
    },
    "math-dataset": {
        "repo_id": "competition_math",
        "category": "math",
        "description": "Competition-level math problems",
        "size": "~50MB",
        "language": "en",
        "priority": 2,
    },
    # ========================================================================
    # CHINESE (中文)
    # ========================================================================
    "belle-cn": {
        "repo_id": "BelleGroup/train_0.5M_CN",
        "category": "chinese",
        "description": "500K Chinese instructions",
        "size": "~300MB",
        "language": "zh",
        "priority": 1,
    },
    "belle-2m": {
        "repo_id": "BelleGroup/train_2M_CN",
        "category": "chinese",
        "description": "2M Chinese instructions",
        "size": "~1.2GB",
        "language": "zh",
        "priority": 2,
    },
    "chinese-llama": {
        "repo_id": "hfl/chinese-alpaca-plus-7b",
        "category": "chinese",
        "description": "Chinese Alpaca instruction data",
        "size": "~100MB",
        "language": "zh",
        "priority": 2,
    },
    "firefly-cn": {
        "repo_id": "YeungNLP/firefly-train-1.1M",
        "category": "chinese",
        "description": "1.1M Chinese NLP tasks",
        "size": "~600MB",
        "language": "zh",
        "priority": 2,
    },
    # ========================================================================
    # ROLEPLAY / CHARACTER (角色扮演)
    # ========================================================================
    "airoboros": {
        "repo_id": "jondurbin/airoboros-gpt4-1.4.1",
        "category": "roleplay",
        "description": "GPT-4 roleplay and creative writing",
        "size": "~150MB",
        "language": "en",
        "priority": 1,
    },
    "character-ai": {
        "repo_id": "Norquinal/GPT4-LLM-Cleaned",
        "category": "roleplay",
        "description": "Character conversation dataset",
        "size": "~200MB",
        "language": "en",
        "priority": 2,
    },
    "pippa": {
        "repo_id": "PygmalionAI/PIPPA",
        "category": "roleplay",
        "description": "Personal interaction pairs for AI",
        "size": "~500MB",
        "language": "en",
        "priority": 2,
    },
    # ========================================================================
    # CREATIVE WRITING (创意写作)
    # ========================================================================
    "writingprompts": {
        "repo_id": "euclaise/writingprompts",
        "category": "creative",
        "description": "Creative writing prompts and stories",
        "size": "~1GB",
        "language": "en",
        "priority": 2,
    },
    "gutenberg": {
        "repo_id": "sedthh/gutenberg_english",
        "category": "creative",
        "description": "Project Gutenberg books",
        "size": "~4GB",
        "language": "en",
        "priority": 3,
    },
    "storywriter": {
        "repo_id": "Writer/storywriter",
        "category": "creative",
        "description": "Story writing dataset",
        "size": "~100MB",
        "language": "en",
        "priority": 2,
    },
    # ========================================================================
    # QUESTION ANSWERING (问答)
    # ========================================================================
    "squad-v2": {
        "repo_id": "squad_v2",
        "category": "qa",
        "description": "Stanford Question Answering Dataset",
        "size": "~50MB",
        "language": "en",
        "priority": 1,
    },
    "natural-questions": {
        "repo_id": "natural_questions",
        "category": "qa",
        "description": "Google Natural Questions",
        "size": "~40GB",
        "language": "en",
        "priority": 3,
    },
    "trivia-qa": {
        "repo_id": "trivia_qa",
        "category": "qa",
        "description": "Trivia question-answer pairs",
        "size": "~2GB",
        "language": "en",
        "priority": 2,
    },
    # ========================================================================
    # SUMMARIZATION (摘要)
    # ========================================================================
    "cnn-dailymail": {
        "repo_id": "cnn_dailymail",
        "category": "summarization",
        "description": "News article summarization",
        "size": "~1GB",
        "language": "en",
        "priority": 2,
    },
    "xsum": {
        "repo_id": "xsum",
        "category": "summarization",
        "description": "Extreme summarization dataset",
        "size": "~250MB",
        "language": "en",
        "priority": 2,
    },
    "reddit-tifu": {
        "repo_id": "reddit_tifu",
        "category": "summarization",
        "description": "Reddit TIFU summarization",
        "size": "~100MB",
        "language": "en",
        "priority": 3,
    },
    # ========================================================================
    # TRANSLATION (翻译)
    # ========================================================================
    "wmt19": {
        "repo_id": "wmt19",
        "category": "translation",
        "description": "WMT19 translation dataset",
        "size": "~5GB",
        "language": "multilingual",
        "priority": 3,
    },
    "opus-100": {
        "repo_id": "Helsinki-NLP/opus-100",
        "category": "translation",
        "description": "100 language pairs",
        "size": "~3GB",
        "language": "multilingual",
        "priority": 3,
    },
    "flores": {
        "repo_id": "facebook/flores",
        "category": "translation",
        "description": "Low-resource translation",
        "size": "~50MB",
        "language": "multilingual",
        "priority": 2,
    },
}


def download_dataset_snapshot(
    dataset_key: str, output_dir: str = None, sample_size: int = None  # type: ignore
):
    """
    Download dataset using fast snapshot method
    """

    if dataset_key not in DATASET_REGISTRY:
        print(f"❌ Unknown dataset: {dataset_key}")
        return False

    info = DATASET_REGISTRY[dataset_key]
    repo_id = info["repo_id"]

    print(f"\n{'='*70}")
    print(f"📦 Downloading: {dataset_key}")
    print(f"   Repository: {repo_id}")
    print(f"   Category: {info['category']}")
    print(f"   Language: {info['language']}")
    print(f"   Size: {info['size']}")
    print(f"{'='*70}\n")

    try:
        if output_dir is None:
            output_dir = settings.FINETUNE_DATA_DIR

        os.makedirs(output_dir, exist_ok=True)
        cache_dir = settings.DATASET_CACHE_DIR
        os.makedirs(cache_dir, exist_ok=True)

        # Download dataset
        print("Downloading dataset...")
        dataset = load_dataset(repo_id, cache_dir=cache_dir, trust_remote_code=True)

        # Get train split
        if "train" in dataset:
            data = dataset["train"]
        else:
            split_name = list(dataset.keys())[0]  # type: ignore
            data = dataset[split_name]  # type: ignore

        print(f"✓ Total samples: {len(data):,}")  # type: ignore

        # Sample if requested
        if sample_size and sample_size < len(data):  # type: ignore
            data = data.shuffle(seed=42).select(range(sample_size))  # type: ignore
            print(f"✓ Sampled to: {len(data):,}")

        # Save to JSONL
        output_file = os.path.join(output_dir, f"{dataset_key}.jsonl")

        print(f"Saving to {output_file}...")
        with open(output_file, "w", encoding="utf-8") as f:
            for item in data:
                f.write(json.dumps(dict(item), ensure_ascii=False) + "\n")

        print(f"✅ Dataset downloaded and saved!\n")
        return True

    except Exception as e:
        print(f"❌ Download failed: {str(e)}\n")
        return False


def download_by_category(category: str):
    """Download all datasets in a category"""
    datasets = [
        (key, info)
        for key, info in DATASET_REGISTRY.items()
        if info["category"] == category
    ]

    if not datasets:
        print(f"No datasets found for category: {category}")
        return

    print(f"\n{'='*70}")
    print(f"Downloading {category.upper()} datasets ({len(datasets)} total)")
    print(f"{'='*70}\n")

    success = 0
    for key, info in datasets:
        if download_dataset_snapshot(key):
            success += 1

    print(f"\n{'='*70}")
    print(f"Category {category}: {success}/{len(datasets)} successful")
    print(f"{'='*70}\n")


def list_datasets():
    """List all datasets by category"""
    print("\n" + "=" * 70)
    print("Available Datasets by Category")
    print("=" * 70 + "\n")

    categories = {}
    for key, info in DATASET_REGISTRY.items():
        cat = info["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append((key, info))

    for cat in sorted(categories.keys()):
        datasets = categories[cat]
        print(f"\n🗂️  {cat.upper()} ({len(datasets)} datasets)")
        print("-" * 70)

        for key, info in datasets:
            lang_icon = "🇨🇳" if info["language"] == "zh" else "🌐"
            priority_icon = "⭐" * info.get("priority", 3)
            print(f"  {lang_icon} {key:<25} {priority_icon}")
            print(f"     {info['description']}")
            print(f"     Size: {info['size']}, Repo: {info['repo_id']}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Download datasets for fine-tuning")

    parser.add_argument("--dataset", type=str, help="Dataset key to download")

    parser.add_argument(
        "--category",
        type=str,
        choices=[
            "instruction",
            "conversation",
            "code",
            "math",
            "chinese",
            "roleplay",
            "creative",
            "qa",
            "summarization",
            "translation",
        ],
        help="Download all datasets in category",
    )

    parser.add_argument(
        "--priority",
        type=int,
        choices=[1, 2, 3],
        help="Download datasets by priority level",
    )

    parser.add_argument(
        "--essential",
        action="store_true",
        help="Download essential datasets (priority 1)",
    )

    parser.add_argument(
        "--sample-size", type=int, help="Limit dataset size (for testing)"
    )

    parser.add_argument(
        "--list", action="store_true", help="List all available datasets"
    )

    args = parser.parse_args()

    if args.list:
        list_datasets()
        return

    if args.essential or args.priority == 1:
        datasets = [k for k, v in DATASET_REGISTRY.items() if v.get("priority") == 1]
        print(f"Downloading {len(datasets)} essential datasets...\n")
        for ds in datasets:
            download_dataset_snapshot(ds, sample_size=args.sample_size)

    elif args.priority:
        datasets = [
            k for k, v in DATASET_REGISTRY.items() if v.get("priority") == args.priority
        ]
        print(f"Downloading {len(datasets)} priority {args.priority} datasets...\n")
        for ds in datasets:
            download_dataset_snapshot(ds, sample_size=args.sample_size)

    elif args.category:
        download_by_category(args.category)

    elif args.dataset:
        download_dataset_snapshot(args.dataset, sample_size=args.sample_size)

    else:
        parser.print_help()
        print("\n💡 Quick start: python download_datasets.py --essential")


if __name__ == "__main__":
    main()
