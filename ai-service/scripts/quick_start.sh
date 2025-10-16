#!/bin/bash
# Quick start with minimal downloads

set -e

echo "========================================"
echo "Quick Start - Essential Only"
echo "========================================"
echo ""

# Essential models (~16GB)
echo "📥 Downloading essential models..."
python scripts/download_models.py --model qwen2.5-7b
python scripts/download_models.py --model bge-m3

# Essential datasets (~500MB)
echo ""
echo "📥 Downloading essential datasets..."
python scripts/download_datasets.py --dataset alpaca
python scripts/download_datasets.py --dataset belle-cn
python scripts/download_datasets.py --dataset code-alpaca

echo ""
echo "✅ Quick start complete!"
echo "Run: docker-compose up -d"