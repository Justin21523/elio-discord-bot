#!/bin/bash
# Complete setup script for AI service

set -e

echo "========================================"
echo "Communiverse AI Service Setup"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create directories
echo "📁 Creating directories..."
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse/models
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse/datasets
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse//vector_db
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse//bm25_index
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse//stories
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse/fine_tuned_models
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse/training_data
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse/checkpoints

# Install Python dependencies
echo ""
echo "📦 Installing Python dependencies..."
pip install -r ai-service/requirements.txt

# Optional: Install fast transfer
read -p "Install hf-transfer for faster downloads? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pip install hf-transfer
fi

# Download models
echo ""
echo "🤖 Model Download Options:"
echo "1) Essential only (LLM + Embeddings, ~16GB)"
echo "2) Essential + VLM (~36GB)"
echo "3) All models (~80GB)"
echo "4) Skip model download"
read -p "Choose option (1-4): " model_choice

case $model_choice in
    1)
        python ai-service/scripts/download_models.py --essential
        ;;
    2)
        python sai-service/cripts/download_models.py --priority 1
        python ai-service/scripts/download_models.py --priority 2
        ;;
    3)
        python ai-service/scripts/download_models.py --all
        ;;
    4)
        echo "Skipping model download"
        ;;
esac

# Download datasets
echo ""
echo "📊 Dataset Download Options:"
echo "1) Essential datasets (~500MB)"
echo "2) Popular categories (~5GB)"
echo "3) All datasets (~20GB+)"
echo "4) Skip dataset download"
read -p "Choose option (1-4): " dataset_choice

case $dataset_choice in
    1)
        python ai-service/scripts/download_datasets.py --essential
        ;;
    2)
        python ai-service/scripts/download_datasets.py --priority 1
        python ai-service/scripts/download_datasets.py --priority 2
        ;;
    3)
        for cat in instruction conversation code math chinese roleplay; do
            python ai-service/scripts/download_datasets.py --category $cat
        done
        ;;
    4)
        echo "Skipping dataset download"
        ;;
esac

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure .env file with your settings"
echo "2. Run: docker-compose up -d"
echo "3. Or run: python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"