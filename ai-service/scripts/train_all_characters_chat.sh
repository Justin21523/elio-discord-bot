#!/bin/bash

##############################################################################
# Train All Elio Film Characters using Chat Base Model
# Strategy: Use pre-trained chat model + character-specific data
# Avoids catastrophic forgetting and reduces training time
##############################################################################

set -e  # Exit on error

echo "🎬 ============================================================"
echo "   Training All Elio Film Characters"
echo "   Base Model: deepseek-ai/deepseek-llm-7b-chat"
echo "   Dataset: 1,185 examples (15 characters)"
echo "============================================================"
echo ""

# Configuration
BASE_MODEL="deepseek-ai/deepseek-llm-7b-chat"
DATASET_PATH="/app/data/training-datasets/complete_elio_film_dataset.jsonl"
OUTPUT_DIR="/app/models/elio_all_characters_chat"
CHECKPOINT_DIR="${OUTPUT_DIR}/checkpoints"

# Check if dataset exists
if [ ! -f "$DATASET_PATH" ]; then
    echo "❌ Error: Dataset not found at $DATASET_PATH"
    echo "Please copy the dataset to the container first:"
    echo "  docker cp data/training-datasets/complete_elio_film_dataset.jsonl elioverse-bot-ai-service-1:/app/data/training-datasets/"
    exit 1
fi

echo "📊 Dataset Information:"
wc -l "$DATASET_PATH"
echo ""

echo "🔧 Training Configuration:"
echo "   LoRA Rank (r): 16"
echo "   LoRA Alpha: 32"
echo "   Batch Size: 2"
echo "   Gradient Accumulation: 8 (effective batch = 16)"
echo "   Learning Rate: 2e-4"
echo "   Epochs: 3"
echo "   Max Length: 1024 tokens"
echo "   Quantization: 4-bit"
echo ""

echo "⏱️  Estimated Training Time: 2-3 hours"
echo "💾 GPU Memory Required: ~12-16GB (with 4-bit)"
echo ""

read -p "Press Enter to start training (or Ctrl+C to cancel)..."

cd /app/scripts

python3 train_sft.py \
  --base_model "$BASE_MODEL" \
  --custom_data "$DATASET_PATH" \
  --output_dir "$OUTPUT_DIR" \
  --lora_r 16 \
  --lora_alpha 32 \
  --batch_size 2 \
  --gradient_accumulation 8 \
  --learning_rate 2e-4 \
  --num_epochs 3 \
  --max_length 1024 \
  --use_4bit \
  --warmup_ratio 0.1 \
  --save_steps 100 \
  --logging_steps 10 \
  --eval_steps 50 \
  --load_best_model_at_end \
  --save_total_limit 3

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ ============================================================"
    echo "   Training Complete!"
    echo "============================================================"
    echo ""
    echo "📁 Model saved to: $OUTPUT_DIR"
    echo ""

    if [ -f "${OUTPUT_DIR}/training_metadata.json" ]; then
        echo "📊 Training Metadata:"
        cat "${OUTPUT_DIR}/training_metadata.json" | python3 -m json.tool
        echo ""
    fi

    echo "🎯 Next Steps:"
    echo "   1. Test the model:"
    echo "      python3 /app/scripts/test_persona_model.py --model $OUTPUT_DIR --persona Glordon"
    echo ""
    echo "   2. Deploy to bot:"
    echo "      - Update config to use fine-tuned model"
    echo "      - Restart Discord bot"
    echo ""
    echo "   3. Verify character personalities:"
    echo "      - Test each character in Discord"
    echo "      - Ensure distinct speaking styles"
else
    echo ""
    echo "❌ ============================================================"
    echo "   Training Failed with exit code: $EXIT_CODE"
    echo "============================================================"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   - Check GPU availability: nvidia-smi"
    echo "   - Check CUDA: python3 -c 'import torch; print(torch.cuda.is_available())'"
    echo "   - Review logs above for errors"
    echo "   - Try reducing batch_size to 1 if OOM"
    exit $EXIT_CODE
fi
