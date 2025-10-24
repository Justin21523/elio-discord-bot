#!/bin/bash

set -e

echo "============================================================"
echo "  SFT Training - Full Multi-Dataset (OASST2 + Alpaca + Custom)"
echo "  Base Model: deepseek-ai/deepseek-llm-7b-chat"
echo "  Total Samples: ~181,762"
echo "============================================================"

BASE_MODEL="deepseek-ai/deepseek-llm-7b-chat"
DATASETS_DIR="/mnt/c/AI_LLM_projects/ai_warehouse/datasets/huggingface"
CUSTOM_DATA="/app/data/training-datasets/complete_elio_film_dataset.jsonl"
OUTPUT_DIR="/app/models/sft_full_multicharacter"

echo ""
echo "Configuration:"
echo "  LoRA Rank: 16"
echo "  LoRA Alpha: 32"
echo "  Batch Size: 2 x 8 = 16 (effective)"
echo "  Learning Rate: 2e-4"
echo "  Epochs: 3"
echo "  Max Length: 1024 tokens"
echo "  Quantization: None (Full Precision FP16)"
echo "  Datasets: OASST2 + Alpaca + Communiverse"
echo ""
echo "Estimated Training:"
echo "  Total Steps: ~34,000"
echo "  Time: 6-8 hours"
echo "  GPU Memory: 14-17GB"
echo ""

cd /app/scripts

python3 train_sft.py \
  --base_model "$BASE_MODEL" \
  --datasets_dir "$DATASETS_DIR" \
  --custom_data "$CUSTOM_DATA" \
  --output_dir "$OUTPUT_DIR" \
  --use_oasst2 \
  --use_alpaca \
  --lora_r 16 \
  --lora_alpha 32 \
  --batch_size 2 \
  --gradient_accumulation 8 \
  --learning_rate 2e-4 \
  --num_epochs 3 \
  --max_length 1024 \
  --no_quantization

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "============================================================"
    echo "  Training Complete!"
    echo "============================================================"
    echo "Model saved to: $OUTPUT_DIR"
else
    echo ""
    echo "============================================================"
    echo "  Training Failed (Exit Code: $EXIT_CODE)"
    echo "============================================================"
    exit $EXIT_CODE
fi
