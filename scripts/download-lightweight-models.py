#!/usr/bin/env python3
"""
Download lightweight LLM models for 4GB VRAM GPU deployment.
Run this on the target server before starting the AI service.

Usage:
    python3 scripts/download-lightweight-models.py [--model MODEL] [--all]

Models:
    - phi3-mini: Microsoft Phi-3 Mini (recommended for quality)
    - tinyllama: TinyLlama 1.1B (fastest, smallest)
    - qwen25-1.5b: Qwen 2.5 1.5B (good for Chinese)
"""

import argparse
import os
import sys
from pathlib import Path

# Model configurations
MODELS = {
    "phi3-mini": {
        "hf_id": "microsoft/Phi-3-mini-4k-instruct",
        "size": "~2.2GB (FP16) / ~1.5GB (INT4)",
        "recommended": True,
    },
    "tinyllama": {
        "hf_id": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
        "size": "~1.1GB (FP16) / ~0.6GB (INT4)",
        "recommended": False,
    },
    "qwen25-1.5b": {
        "hf_id": "Qwen/Qwen2.5-1.5B-Instruct",
        "size": "~1.5GB (FP16) / ~0.8GB (INT4)",
        "recommended": False,
    },
    "smollm": {
        "hf_id": "HuggingFaceTB/SmolLM-1.7B-Instruct",
        "size": "~1.7GB (FP16) / ~0.9GB (INT4)",
        "recommended": False,
    },
}

# Default cache directory
DEFAULT_CACHE_DIR = os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")


def check_dependencies():
    """Check if required packages are installed."""
    try:
        import torch
        import transformers
        print(f"✓ PyTorch {torch.__version__}")
        print(f"✓ Transformers {transformers.__version__}")

        if torch.cuda.is_available():
            print(f"✓ CUDA available: {torch.cuda.get_device_name(0)}")
            vram = torch.cuda.get_device_properties(0).total_memory // (1024**3)
            print(f"  VRAM: {vram}GB")
        else:
            print("⚠ CUDA not available - will download for CPU use")

        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("  Install with: pip install torch transformers")
        return False


def download_model(model_key: str, cache_dir: str, use_4bit: bool = False):
    """Download a model and its tokenizer."""
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import torch

    if model_key not in MODELS:
        print(f"✗ Unknown model: {model_key}")
        print(f"  Available: {', '.join(MODELS.keys())}")
        return False

    model_info = MODELS[model_key]
    model_id = model_info["hf_id"]

    print(f"\n{'='*60}")
    print(f"Downloading: {model_key}")
    print(f"  HuggingFace ID: {model_id}")
    print(f"  Size: {model_info['size']}")
    print(f"  Cache dir: {cache_dir}")
    print(f"{'='*60}\n")

    try:
        # Download tokenizer
        print("📥 Downloading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            model_id,
            cache_dir=cache_dir,
            trust_remote_code=True,
        )
        print(f"  ✓ Tokenizer ready")

        # Download model
        print("📥 Downloading model weights...")

        model_kwargs = {
            "cache_dir": cache_dir,
            "trust_remote_code": True,
            "low_cpu_mem_usage": True,
        }

        if use_4bit and torch.cuda.is_available():
            try:
                from transformers import BitsAndBytesConfig
                model_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                )
                model_kwargs["device_map"] = "auto"
                print("  Using 4-bit quantization")
            except ImportError:
                print("  ⚠ bitsandbytes not available, downloading FP16")
                model_kwargs["torch_dtype"] = torch.float16
        else:
            model_kwargs["torch_dtype"] = torch.float16

        model = AutoModelForCausalLM.from_pretrained(model_id, **model_kwargs)
        print(f"  ✓ Model downloaded")

        # Test generation
        print("🧪 Testing generation...")
        inputs = tokenizer("Hello, I am", return_tensors="pt")
        if torch.cuda.is_available() and not use_4bit:
            inputs = {k: v.to("cuda") for k, v in inputs.items()}
            model = model.to("cuda")

        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=10, do_sample=False)

        result = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print(f"  ✓ Test output: {result[:50]}...")

        # Cleanup
        del model
        del tokenizer
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        print(f"\n✅ {model_key} downloaded successfully!\n")
        return True

    except Exception as e:
        print(f"\n✗ Failed to download {model_key}: {e}\n")
        return False


def download_sentence_transformers(cache_dir: str):
    """Download sentence-transformers model for embeddings."""
    try:
        from sentence_transformers import SentenceTransformer

        print(f"\n{'='*60}")
        print("Downloading: sentence-transformers (all-MiniLM-L6-v2)")
        print(f"{'='*60}\n")

        model = SentenceTransformer("all-MiniLM-L6-v2", cache_folder=cache_dir)

        # Test
        embeddings = model.encode(["Hello world"])
        print(f"  ✓ Embedding shape: {embeddings.shape}")

        del model
        print(f"\n✅ Sentence transformers ready!\n")
        return True

    except ImportError:
        print("⚠ sentence-transformers not installed")
        return False
    except Exception as e:
        print(f"✗ Failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download lightweight LLM models")
    parser.add_argument(
        "--model", "-m",
        choices=list(MODELS.keys()),
        default="phi3-mini",
        help="Model to download (default: phi3-mini)",
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Download all available models",
    )
    parser.add_argument(
        "--cache-dir", "-c",
        default=str(DEFAULT_CACHE_DIR),
        help=f"Cache directory (default: {DEFAULT_CACHE_DIR})",
    )
    parser.add_argument(
        "--4bit",
        dest="use_4bit",
        action="store_true",
        help="Download and quantize to 4-bit (requires CUDA)",
    )
    parser.add_argument(
        "--embeddings", "-e",
        action="store_true",
        help="Also download sentence-transformers model",
    )

    args = parser.parse_args()

    print("\n🚀 Lightweight Model Downloader for 4GB VRAM GPUs\n")

    # Check dependencies
    if not check_dependencies():
        sys.exit(1)

    # Create cache directory
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n📁 Cache directory: {cache_dir}\n")

    # Download models
    success = True

    if args.all:
        for model_key in MODELS:
            if not download_model(model_key, str(cache_dir), args.use_4bit):
                success = False
    else:
        if not download_model(args.model, str(cache_dir), args.use_4bit):
            success = False

    # Download embeddings if requested
    if args.embeddings:
        if not download_sentence_transformers(str(cache_dir)):
            success = False

    # Summary
    print("\n" + "="*60)
    if success:
        print("✅ All downloads completed successfully!")
        print("\nNext steps:")
        print("  1. Copy cache to server if needed")
        print("  2. Set HF_HOME environment variable")
        print("  3. Start with: docker-compose --profile ai-4gb up -d")
    else:
        print("⚠ Some downloads failed. Check errors above.")
    print("="*60 + "\n")

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
