#!/bin/bash
# Quick download script for all resources

set -e

echo "================================================"
echo "Downloading ALL Models and Datasets"
echo "This will download ~100GB+ of data"
echo "================================================"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Download all models
echo ""
echo "🤖 Downloading all models..."
python ai-service/scripts/download_models.py --all

# Download all priority 1 & 2 datasets
echo ""
echo "📊 Downloading essential and recommended datasets..."
python ai-service/scripts/download_datasets.py --priority 1
python ai-service/scripts/download_datasets.py --priority 2

echo ""
echo "✅ All downloads complete!"