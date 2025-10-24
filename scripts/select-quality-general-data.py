#!/usr/bin/env python3
"""
Intelligent Dataset Filtering - Select high-quality general conversation samples
从大量数据集中智能筛选高质量一般对话样本

Filtering Strategy:
1. Diversity - Topic and sentence structure diversity
2. Quality - Appropriate length, naturalness
3. Deduplication - Avoid repetitive samples
4. Relevance - Prioritize conversational scenarios

Usage:
    python scripts/select-quality-general-data.py \\
        --dataset /path/to/large/dataset.json \\
        --output data/training/general-conversation-subset.jsonl \\
        --count 300
"""

import json
import argparse
import random
from pathlib import Path
from typing import List, Dict, Set
from collections import defaultdict
import hashlib
import re

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    import pyarrow.ipc as ipc
    ARROW_AVAILABLE = True
except ImportError:
    ARROW_AVAILABLE = False

try:
    from datasets import Dataset
    DATASETS_AVAILABLE = True
except ImportError:
    DATASETS_AVAILABLE = False


class QualitySelector:
    """智能质量筛选器"""

    def __init__(self, target_count: int = 300, min_length: int = 10, max_length: int = 500):
        self.target_count = target_count
        self.min_length = min_length
        self.max_length = max_length
        self.seen_hashes: Set[str] = set()
        self.topic_counts: Dict[str, int] = defaultdict(int)

    def compute_hash(self, text: str) -> str:
        """计算文本hash用于去重"""
        normalized = re.sub(r'\s+', ' ', text.lower().strip())
        return hashlib.md5(normalized.encode()).hexdigest()

    def extract_topic(self, text: str) -> str:
        """Simple topic extraction (keyword-based) - English version"""
        topics = {
            'greeting': ['hello', 'hi', 'hey', 'good morning', 'good evening', 'greetings'],
            'emotion': ['feel', 'feeling', 'happy', 'sad', 'excited', 'worried', 'love', 'hate'],
            'learning': ['study', 'learn', 'homework', 'school', 'course', 'education', 'teach'],
            'work': ['work', 'job', 'office', 'business', 'career', 'company', 'employee'],
            'life': ['life', 'daily', 'home', 'friend', 'family', 'living', 'routine'],
            'hobby': ['hobby', 'game', 'music', 'movie', 'sport', 'entertainment', 'fun'],
            'advice': ['how', 'should', 'advise', 'suggest', 'recommend', 'help', 'what if'],
            'story': ['story', 'experience', 'once', 'happened', 'remember', 'used to'],
            'science': ['science', 'research', 'explain', 'why', 'theory', 'study', 'data'],
            'creative': ['write', 'create', 'design', 'imagine', 'build', 'make', 'art'],
        }

        text_lower = text.lower()
        for topic, keywords in topics.items():
            if any(kw in text_lower for kw in keywords):
                return topic

        return 'other'

    def score_quality(self, example: Dict) -> float:
        """
        质量评分算法

        评分标准：
        1. 长度适中 (0-30分)
        2. 对话自然性 (0-30分)
        3. 话题多样性 (0-20分)
        4. 句式丰富度 (0-20分)
        """
        score = 0.0

        # 提取对话内容
        messages = example.get('messages', [])
        if not messages:
            return 0.0

        # 合并所有对话内容
        full_text = ' '.join([msg.get('content', '') for msg in messages])
        text_length = len(full_text)

        # 1. 长度评分 (0-30)
        if self.min_length <= text_length <= self.max_length:
            # 理想长度 50-200
            if 50 <= text_length <= 200:
                score += 30
            elif 20 <= text_length <= 300:
                score += 20
            else:
                score += 10
        else:
            return 0.0  # 长度不符合，直接淘汰

        # 2. 对话自然性 (0-30)
        # 检查是否有问答结构
        has_question = any('?' in msg.get('content', '') or '吗' in msg.get('content', '') or '呢' in msg.get('content', '') for msg in messages)
        has_answer = len(messages) >= 2

        if has_question and has_answer:
            score += 15

        # 检查是否有情感表达
        emotion_words = ['喜欢', '讨厌', '开心', '难过', '高兴', '担心', '希望', '想', 'love', 'hate', 'happy', 'sad', 'hope', 'want']
        if any(word in full_text.lower() for word in emotion_words):
            score += 10

        # 检查是否有礼貌用语
        polite_words = ['请', '谢谢', '对不起', '抱歉', 'please', 'thank', 'sorry']
        if any(word in full_text.lower() for word in polite_words):
            score += 5

        # 3. 话题多样性 (0-20)
        topic = self.extract_topic(full_text)
        topic_count = self.topic_counts.get(topic, 0)

        # 惩罚重复话题
        if topic_count == 0:
            score += 20
        elif topic_count < 10:
            score += 15
        elif topic_count < 30:
            score += 10
        else:
            score += 5

        # 4. 句式丰富度 (0-20)
        # 检查标点符号多样性
        punctuations = set(re.findall(r'[,.!?;，。！？；、]', full_text))
        if len(punctuations) >= 3:
            score += 20
        elif len(punctuations) >= 2:
            score += 15
        else:
            score += 10

        return score

    def is_duplicate(self, text: str) -> bool:
        """检查是否重复"""
        text_hash = self.compute_hash(text)
        if text_hash in self.seen_hashes:
            return True
        self.seen_hashes.add(text_hash)
        return False

    def select_samples(self, dataset: List[Dict]) -> List[Dict]:
        """从数据集中智能选择样本"""
        print(f"📊 Processing {len(dataset)} samples...")

        # Step 1: 过滤基本质量
        candidates = []
        for example in dataset:
            messages = example.get('messages', [])
            if not messages:
                continue

            full_text = ' '.join([msg.get('content', '') for msg in messages])

            # 去重
            if self.is_duplicate(full_text):
                continue

            # 评分
            score = self.score_quality(example)
            if score > 0:
                candidates.append((score, example, full_text))

        print(f"✅ After quality filtering: {len(candidates)} candidates")

        # Step 2: 按分数排序
        candidates.sort(key=lambda x: x[0], reverse=True)

        # Step 3: 多样性选择
        selected = []
        topic_balance = defaultdict(int)

        for score, example, full_text in candidates:
            if len(selected) >= self.target_count:
                break

            topic = self.extract_topic(full_text)

            # 平衡话题分布
            if topic_balance[topic] < self.target_count // 6:  # 每个话题最多占1/6
                selected.append(example)
                topic_balance[topic] += 1
                self.topic_counts[topic] += 1
            elif len(selected) < self.target_count * 0.9:  # 90%之前严格平衡
                continue
            else:  # 最后10%放宽限制
                selected.append(example)
                topic_balance[topic] += 1
                self.topic_counts[topic] += 1

        print(f"✅ Selected {len(selected)} diverse samples")
        print("\n📊 Topic distribution:")
        for topic, count in sorted(topic_balance.items(), key=lambda x: x[1], reverse=True):
            print(f"  {topic}: {count} samples")

        return selected


def load_dataset(dataset_path: Path) -> List[Dict]:
    """加载数据集（支持 JSON, JSONL, 和 Arrow）"""
    print(f"📂 Loading dataset from: {dataset_path}")

    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    data = []

    if dataset_path.suffix == '.arrow':
        # Arrow format (try Hugging Face datasets library first, then PyArrow)
        print("📦 Reading Arrow file...")

        # Try Hugging Face datasets library (best for HF Arrow files)
        datasets_success = False
        if DATASETS_AVAILABLE:
            try:
                print("   Using Hugging Face datasets library...")
                ds = Dataset.from_file(str(dataset_path))
                total_rows = len(ds)
                sample_size = min(50000, total_rows)
                print(f"   Arrow file has {total_rows} rows, sampling {sample_size}...")

                # Sample if needed
                if total_rows > sample_size:
                    indices = random.sample(range(total_rows), sample_size)
                    ds = ds.select(indices)

                data = list(ds)
                datasets_success = True
            except Exception as e:
                print(f"   datasets library failed ({e}), trying PyArrow...")

        # Fallback to PyArrow
        if not datasets_success:
            if not ARROW_AVAILABLE:
                raise ImportError("PyArrow is required to read .arrow files. Install with: pip install pyarrow")

            # Try IPC format first (common for .arrow files)
            try:
                with pa.memory_map(str(dataset_path), 'r') as source:
                    reader = ipc.open_file(source)
                    table = reader.read_all()
            except Exception as e:
                # If IPC fails, try Parquet
                print(f"   IPC format failed ({e}), trying Parquet...")
                try:
                    table = pq.read_table(str(dataset_path))
                except Exception as e2:
                    raise ValueError(f"Could not read Arrow file as IPC or Parquet: {e2}")

            # Convert to list of dicts (sample first 50000 to avoid memory issues)
            total_rows = table.num_rows
            sample_size = min(50000, total_rows)
            print(f"   Arrow file has {total_rows} rows, sampling {sample_size}...")

            # Convert to pandas for easier manipulation, then to dict
            df = table.to_pandas()
            if len(df) > sample_size:
                df = df.sample(n=sample_size, random_state=42)

            data = df.to_dict('records')

    elif dataset_path.suffix == '.jsonl':
        # JSONL format - one JSON per line
        with open(dataset_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    data.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    print(f"⚠️  Skipping invalid JSON at line {line_num}")
    else:
        # JSON format
        with open(dataset_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        # Handle different dataset formats
        if isinstance(raw_data, list):
            data = raw_data
        elif isinstance(raw_data, dict):
            # Try common keys
            for key in ['data', 'examples', 'conversations', 'messages']:
                if key in raw_data and isinstance(raw_data[key], list):
                    data = raw_data[key]
                    break

    print(f"✅ Loaded {len(data)} samples")
    return data


def normalize_format(examples: List[Dict]) -> List[Dict]:
    """统一数据格式为 messages 格式"""
    normalized = []

    for ex in examples:
        # 如果已经是 messages 格式
        if 'messages' in ex:
            normalized.append(ex)
            continue

        # 转换其他格式
        messages = []

        # Format 1: instruction + input + output (Belle/Alpaca style)
        if 'instruction' in ex:
            system_content = ex.get('instruction', '')
            user_content = ex.get('input', '')
            assistant_content = ex.get('output', '')

            if system_content:
                messages.append({'role': 'system', 'content': system_content})
            if user_content:
                messages.append({'role': 'user', 'content': user_content})
            if assistant_content:
                messages.append({'role': 'assistant', 'content': assistant_content})

        # Format 2: prompt + response (Dolly style)
        elif 'prompt' in ex and 'response' in ex:
            messages = [
                {'role': 'user', 'content': ex['prompt']},
                {'role': 'assistant', 'content': ex['response']}
            ]

        # Format 3: question + answer
        elif 'question' in ex and 'answer' in ex:
            messages = [
                {'role': 'user', 'content': ex['question']},
                {'role': 'assistant', 'content': ex['answer']}
            ]

        if messages:
            normalized.append({'messages': messages})

    return normalized


def main():
    parser = argparse.ArgumentParser(description='Intelligent dataset filtering for general conversation samples')
    parser.add_argument('--dataset', type=str, required=True, help='Path to large dataset (JSON or JSONL)')
    parser.add_argument('--output', type=str, required=True, help='Output path for selected samples (JSONL)')
    parser.add_argument('--count', type=int, default=300, help='Number of samples to select (default: 300)')
    parser.add_argument('--min-length', type=int, default=10, help='Minimum text length (default: 10)')
    parser.add_argument('--max-length', type=int, default=500, help='Maximum text length (default: 500)')

    args = parser.parse_args()

    print("🎯 INTELLIGENT DATASET FILTERING")
    print(f"Target count: {args.count}")
    print(f"Length range: {args.min_length}-{args.max_length}\n")

    # Load dataset
    dataset = load_dataset(Path(args.dataset))

    # Normalize format
    print("\n🔄 Normalizing dataset format...")
    dataset = normalize_format(dataset)

    # Select samples
    print("\n🧠 Applying intelligent selection algorithm...")
    selector = QualitySelector(
        target_count=args.count,
        min_length=args.min_length,
        max_length=args.max_length
    )
    selected = selector.select_samples(dataset)

    # Save output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        for example in selected:
            f.write(json.dumps(example, ensure_ascii=False) + '\n')

    print(f"\n✅ SUCCESS! Saved {len(selected)} samples to {output_path}")


if __name__ == '__main__':
    main()
