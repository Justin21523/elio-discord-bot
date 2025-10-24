#!/bin/bash
#
# 完整训练数据准备流程
# Complete Training Data Preparation Workflow
#
# 此脚本自动化以下流程：
# 1. 生成 fandom 第一人称数据（1200 samples）
# 2. 从大量数据集中筛选一般对话数据（300 samples）
# 3. 合并数据集（80% fandom + 20% general）
# 4. 准备用于 fine-tuning
#

set -e  # Exit on error

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  完整训练数据准备流程${NC}"
echo -e "${BLUE}============================================${NC}\n"

# 检查 OpenAI API Key
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  OPENAI_API_KEY not set. Please set it:${NC}"
    echo "export OPENAI_API_KEY='your-key-here'"
    exit 1
fi

# 创建输出目录
mkdir -p data/training

# Step 1: 生成 fandom 第一人称数据
echo -e "\n${GREEN}[Step 1/3] 生成 Fandom 第一人称训练数据...${NC}"
echo -e "${BLUE}预计时间：30-45 分钟${NC}\n"

node scripts/generate-fandom-training-data.js

if [ ! -f "data/training/fandom-first-person-training-data.jsonl" ]; then
    echo -e "${YELLOW}❌ Fandom data generation failed${NC}"
    exit 1
fi

fandom_count=$(wc -l < data/training/fandom-first-person-training-data.jsonl)
echo -e "${GREEN}✅ Generated ${fandom_count} fandom samples${NC}"

# Step 2: 从大量数据集筛选一般对话数据
echo -e "\n${GREEN}[Step 2/3] 筛选高质量一般对话数据...${NC}"
echo -e "${BLUE}从 BelleGroup 0.5M 数据集中智能筛选 300 个样本${NC}\n"

# 使用 BelleGroup 0.5M 中文数据集（质量较高）
BELLE_DATASET="/mnt/c/AI_LLM_projects/ai_warehouse/datasets/BelleGroup___train_0.5_m_cn/default/0.0.0/29c35e9b56c7fc91f04a613ed33896f7a19bad54/BelleGroup___train_0.5_m_cn-train.arrow"

# 由于 arrow 格式需要转换，先尝试找 json 文件
BELLE_JSON=$(find /mnt/c/AI_LLM_projects/ai_warehouse/datasets -name "*.json" | grep -i belle | head -1)

if [ -z "$BELLE_JSON" ]; then
    echo -e "${YELLOW}⚠️  Belle JSON not found, trying Firefly dataset...${NC}"
    FIREFLY_JSON=$(find /mnt/c/AI_LLM_projects/ai_warehouse/datasets -name "*.json" | grep -i firefly | head -1)

    if [ -z "$FIREFLY_JSON" ]; then
        echo -e "${YELLOW}⚠️  No suitable dataset found. Skipping general data selection.${NC}"
        echo -e "${YELLOW}Will use only fandom data for training.${NC}"
        cp data/training/fandom-first-person-training-data.jsonl data/training/final-training-data.jsonl
    else
        python3 scripts/select-quality-general-data.py \
            --dataset "$FIREFLY_JSON" \
            --output data/training/general-conversation-subset.jsonl \
            --count 300 \
            --min-length 10 \
            --max-length 500
    fi
else
    python3 scripts/select-quality-general-data.py \
        --dataset "$BELLE_JSON" \
        --output data/training/general-conversation-subset.jsonl \
        --count 300 \
        --min-length 10 \
        --max-length 500
fi

# Step 3: 合并数据集
echo -e "\n${GREEN}[Step 3/3] 合并数据集...${NC}\n"

if [ -f "data/training/general-conversation-subset.jsonl" ]; then
    cat data/training/fandom-first-person-training-data.jsonl \
        data/training/general-conversation-subset.jsonl \
        > data/training/final-training-data.jsonl

    general_count=$(wc -l < data/training/general-conversation-subset.jsonl)
    total_count=$(wc -l < data/training/final-training-data.jsonl)
    fandom_percent=$((fandom_count * 100 / total_count))
    general_percent=$((general_count * 100 / total_count))

    echo -e "${GREEN}✅ 数据集合并完成！${NC}"
    echo -e "\n${BLUE}📊 最终数据集统计：${NC}"
    echo -e "  Fandom 数据: ${fandom_count} 样本 (${fandom_percent}%)"
    echo -e "  一般对话数据: ${general_count} 样本 (${general_percent}%)"
    echo -e "  总计: ${total_count} 样本"
else
    echo -e "${YELLOW}⚠️  No general data, using only fandom data${NC}"
    total_count=$fandom_count
fi

# 显示输出文件信息
echo -e "\n${GREEN}✅ 训练数据准备完成！${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📁 输出文件：${NC}"
echo -e "  data/training/fandom-first-person-training-data.jsonl (${fandom_count} samples)"
if [ -f "data/training/general-conversation-subset.jsonl" ]; then
    echo -e "  data/training/general-conversation-subset.jsonl (${general_count} samples)"
fi
echo -e "  ${YELLOW}data/training/final-training-data.jsonl (${total_count} samples)${NC} ← 用于 fine-tuning"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 下一步指引
echo -e "${GREEN}📋 下一步：Fine-tuning${NC}"
echo -e "1. 复制数据到 AI warehouse:"
echo -e "   ${BLUE}cp data/training/final-training-data.jsonl \\"
echo -e "      /mnt/c/AI_LLM_projects/ai_warehouse/datasets/elio-fandom-complete.json${NC}\n"
echo -e "2. 运行 fine-tuning:"
echo -e "   ${BLUE}cd ai-service${NC}"
echo -e "   ${BLUE}python scripts/train_sft.py \\"
echo -e "      --dataset /mnt/c/AI_LLM_projects/ai_warehouse/datasets/elio-fandom-complete.json \\"
echo -e "      --output_dir ./models/elio-fandom-complete \\"
echo -e "      --num_epochs 3${NC}\n"

echo -e "${GREEN}🎉 All done!${NC}\n"
