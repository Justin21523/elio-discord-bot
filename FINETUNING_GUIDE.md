# 🎯 End-to-End Fine-Tuning Guide (Manual)

A complete, opinionated guide for dataset selection, training strategies, persona-specific adapters, and best practices. Works locally or inside the `ai-service` container.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Dataset Assessment & Selection](#dataset-assessment--selection)
3. [Training Workflows](#training-workflows)
4. [Persona-Specific Training](#persona-specific-training)
5. [Best Practices & Strategy](#best-practices--strategy)
6. [Post-Training Evaluation](#post-training-evaluation)
7. [FAQ](#faq)
8. [Quick Start Checklist](#quick-start-checklist)

---

## Environment Setup

### 1) GPU & CUDA

```bash
# Check GPU availability
nvidia-smi

# Check CUDA toolchain
nvcc --version
# Expected: CUDA 12.8, GPU e.g. RTX 5080 16GB
```

### 2) Enter the AI Service Container (recommended)

```bash
# Option A: Run inside the container
docker compose exec ai-service bash

# Option B: Run locally (must match container deps)
cd ai-service
source venv/bin/activate   # if you use a venv
```

### 3) Extra Python deps (if needed)

```bash
pip install \
  transformers>=4.36.0 \
  datasets>=2.16.0 \
  peft>=0.8.0 \
  bitsandbytes>=0.42.0 \
  accelerate>=0.25.0 \
  wandb  # optional, for experiment tracking
```

---

## Dataset Assessment & Selection

Below are commonly used conversation datasets available in your warehouse. Ratings reflect typical quality/fit for dialogue.

### 1) OpenAssistant **OASST1** ⭐⭐⭐⭐⭐

* **Path:** `/mnt/ai_warehouse/datasets/OpenAssistant___oasst1`
* **Size:** 84,437 dialogues
* **Lang:** Multilingual (mostly English)
* **Format:** Conversation trees
* **Use:** ✅ general chat, ✅ instruction following, ✅ multi-turn, ❌ role-play depth
  **Recommendation:** Great **base** for general dialogue.

### 2) OpenAssistant **OASST2** ⭐⭐⭐⭐⭐

* **Path:** `/mnt/ai_warehouse/datasets/OpenAssistant___oasst2`
* **Size:** 135k+ dialogues
* **Note:** Improved OASST1; same strengths at larger scale.
  **Recommendation:** **Top choice** for general dialogue.

### 3) **UltraChat** ⭐⭐⭐⭐

* **Path:** `/mnt/ai_warehouse/datasets/stingning___ultrachat`
* **Size:** 1.4M+ (English)
* **Note:** GPT-generated; diverse but uneven quality.
  **Recommendation:** Large-scale pretrain or mixed with OASST.

### 4) **Alpaca / Alpaca-GPT4** ⭐⭐⭐

* **Paths:**
  `/mnt/ai_warehouse/datasets/tatsu-lab___alpaca`
  `/mnt/ai_warehouse/datasets/vicgalle___alpaca-gpt4`
* **Size:** ~52k instructions
* **Use:** ✅ instruction following; ❌ weak multi-turn dialogue.
  **Recommendation:** Supplement only.

### 5) **BELLE (Chinese)** ⭐⭐⭐⭐

* **Paths:**
  `/mnt/ai_warehouse/datasets/BelleGroup___train_0.5_m_cn`
  `/mnt/ai_warehouse/datasets/BelleGroup___train_2_m_cn`
  **Recommendation:** Chinese dialogue capability.

### 6) **Firefly (Chinese)** ⭐⭐⭐⭐

* **Path:** `/mnt/ai_warehouse/datasets/YeungNLP___firefly-train-1.1_m`
  **Recommendation:** Additional Chinese coverage.

---

### Gaps You Must Fill

1. **Role-Play / Persona datasets** ❌
   None of the above provides deep, character-consistent role-play.
   **You need to build this** from:

* Discord logs (user ↔ persona interactions)
* `data/rag-resources/personas/*.md`
* Hand-curated/LLM-generated persona dialogues

2. **Discord chat logs** ❌
   Extract and anonymize real interactions if available.

3. **Project-specific lore (Communiverse)** ❌
   Distill `data/rag-resources/` into training pairs (world/lore, relationships, etc.).

---

## Training Workflows

You can train via **notebooks**, a **Python script**, or a simple **API shim**.

### Option A) Jupyter Notebooks (recommended)

**Step 1: Launch Jupyter**

```bash
# inside container
cd /app
jupyter notebook --ip=0.0.0.0 --port=8888 --no-browser --allow-root

# or via compose
docker compose exec ai-service jupyter notebook --ip=0.0.0.0 --port=8888 --no-browser --allow-root
# open http://localhost:8888
```

**Step 2: Prepare dataset** (e.g., `notebooks/01_dataset_preparation.ipynb`)

```python
from datasets import load_dataset

dataset = load_dataset("OpenAssistant/oasst2", cache_dir="/mnt/ai_warehouse/datasets")

def format_conversation(example):
    # Convert conversation tree to linear text; implement your logic here
    return {"text": "...formatted..."}
# Save processed data
# dataset.save_to_disk("./data/processed/oasst2_formatted")
```

**Step 3: SFT training** (`notebooks/02_model_training_sft.ipynb`)

```python
BASE_MODEL = "deepseek-ai/DeepSeek-V3-Base"

# LoRA
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05

# Training
BATCH_SIZE = 4
GRAD_ACCUM = 4
LEARNING_RATE = 2e-4
NUM_EPOCHS = 3

# Quantization (for 16GB)
USE_4BIT = True   # QLoRA
```

**Step 4: Persona adapters** (`notebooks/04_persona_finetuning.ipynb`)

```python
PERSONAS = ["Elio", "Glordon", "Olga", "Caleb", "Bryce"]

for p in PERSONAS:
    data = load_persona_conversations(p)  # your loader
    train_persona_adapter(
        persona_name=p,
        data=data,
        base_model=BASE_MODEL,
        output_dir=f"./models/persona_adapters/{p}"
    )
```

---

### Option B) Python Script

Create `scripts/train_dialogue.py`:

```python
#!/usr/bin/env python3
import torch
from datasets import load_from_disk
from transformers import (AutoModelForCausalLM, AutoTokenizer, TrainingArguments,
                          Trainer, DataCollatorForLanguageModeling, BitsAndBytesConfig)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

BASE_MODEL = "deepseek-ai/DeepSeek-V3-Base"
DATASET_PATH = "/mnt/ai_warehouse/datasets/OpenAssistant___oasst2"  # preprocessed recommended
OUTPUT_DIR = "./models/dialogue_sft"

LORA_CONFIG = LoraConfig(
    r=16, lora_alpha=32,
    target_modules=["q_proj","v_proj","k_proj","o_proj","gate_proj","up_proj","down_proj"],
    lora_dropout=0.05, bias="none", task_type="CAUSAL_LM"
)

BNB_CONFIG = BitsAndBytesConfig(
    load_in_4bit=True, bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True
)

ARGS = TrainingArguments(
    output_dir=OUTPUT_DIR, num_train_epochs=3,
    per_device_train_batch_size=4, gradient_accumulation_steps=4,
    learning_rate=2e-4, warmup_ratio=0.03,
    fp16=False, gradient_checkpointing=True, optim="paged_adamw_8bit",
    logging_steps=10, save_steps=500, eval_steps=500,
    evaluation_strategy="steps", save_total_limit=3,
    load_best_model_at_end=True, report_to="none"
)

def main():
    tok = AutoTokenizer.from_pretrained(BASE_MODEL)
    if tok.pad_token is None: tok.pad_token = tok.eos_token

    # dataset = load_from_disk(DATASET_PATH)  # use preprocessed train/validation splits

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, quantization_config=BNB_CONFIG, device_map="auto", trust_remote_code=True
    )
    model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LORA_CONFIG)

    collator = DataCollatorForLanguageModeling(tokenizer=tok, mlm=False)
    trainer = Trainer(model=model, args=ARGS,
                      train_dataset=dataset["train"],
                      eval_dataset=dataset["validation"],
                      data_collator=collator)

    trainer.train()
    model.save_pretrained(OUTPUT_DIR); tok.save_pretrained(OUTPUT_DIR)
    print(f"✅ Saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
```

Run:

```bash
python scripts/train_dialogue.py
```

---

### Option C) Simple API Kickoff (stub)

> Useful if you later control training from Discord or a web UI.

```bash
# Discord command (concept)
# /finetune start job_name:dialogue_v1 dataset:oasst2 task_type:dialogue epochs:3

# REST call
curl -X POST http://localhost:8000/finetune/start-training \
  -H "Content-Type: application/json" \
  -d '{
    "job_name": "dialogue_training_v1",
    "base_model": "deepseek-ai/DeepSeek-V3-Base",
    "dataset_path": "/mnt/ai_warehouse/datasets/OpenAssistant___oasst2",
    "task_type": "dialogue",
    "hyperparameters": {
      "num_train_epochs": 3,
      "per_device_train_batch_size": 4,
      "learning_rate": 2e-4
    }
  }'
```

---

## Persona-Specific Training

### Build Persona Datasets

**Step 1: Extract persona facts from RAG resources**

```python
import json

persona_files = {
  "Elio": "data/rag-resources/character_elio_solis.md",
  "Glordon": "data/rag-resources/character_glordon.md",
  "Olga": "data/rag-resources/character_olga_solis.md",
  "Caleb": "data/rag-resources/characters/character_caleb.md",
  "Bryce": "data/rag-resources/character_bryce.md",
}

def extract_traits(text): ...
def extract_style(text): ...

personas = {}
for name, path in persona_files.items():
    with open(path, "r") as f:
        content = f.read()
    personas[name] = {
        "bio": content,
        "traits": extract_traits(content),
        "style": extract_style(content),
    }
```

**Step 2: Generate persona conversations (LLM or human)**

```python
def generate_persona_conversations(name, info, n=100):
    # Prompt-engineer or script LLM to create in-character, multi-turn dialogues
    return [{"messages":[...]} for _ in range(n)]

for name, info in personas.items():
    conv = generate_persona_conversations(name, info)
    with open(f"./data/personas/{name.lower()}_conversations.json", "w") as f:
        json.dump(conv, f, indent=2)
```

**Step 3: Train persona adapters**

```bash
python scripts/train_persona.py --persona Elio --data ./data/personas/elio_conversations.json
```

---

## Best Practices & Strategy

### Recommended Strategy: **Chat Model + Persona Data (single stage)**

Why it’s best:

1. Chat models already know how to converse (instruction-tuned).
2. You focus on **injecting personality**, not reinventing chat ability.
3. Lower risk of **catastrophic forgetting**.
4. Shorter, cheaper, simpler.
5. Best real-world outcomes.

#### Strategy Comparison

| Strategy              | Base                   | Dataset              |     Time |  Cost |   Quality | Verdict           |
| --------------------- | ---------------------- | -------------------- | -------: | ----: | --------: | ----------------- |
| A. Two-stage          | base → chat → persona  | OASST2 + persona     |     6–8h |   $$$ |       ⭐⭐⭐ | ❌ Not recommended |
| B. Mixed single-stage | base → persona (mixed) | OASST2 + persona mix |     4–5h |    $$ |      ⭐⭐⭐⭐ | ⚠️ Second best    |
| **C. Chat + persona** | **chat → persona**     | **persona only**     | **2–3h** | **$** | **⭐⭐⭐⭐⭐** | **✅ Best**        |

#### Implementation (Chat + Persona)

Choose a chat model:

```bash
# A: DeepSeek Chat (recommended)
BASE_MODEL="deepseek-ai/deepseek-llm-7b-chat"

# B: Mistral Instruct
BASE_MODEL="mistralai/Mistral-7B-Instruct-v0.2"

# C: Llama-3 Instruct
BASE_MODEL="meta-llama/Meta-Llama-3-8B-Instruct"
```

Your curated persona data (example):

```
data/training-datasets/
├── elio_synthetic.jsonl
├── glordon_synthetic.jsonl
├── olga_solis_synthetic.jsonl
├── lord_grigon_synthetic.jsonl
├── ambassador_questa_synthetic.jsonl
└── all_characters_synthetic.jsonl
Total: 1,189 examples
```

**Local LoRA (QLoRA) – suggested params**

```json
{
  "base_model": "deepseek-ai/deepseek-llm-7b-chat",
  "lora_r": 16,
  "lora_alpha": 32,
  "batch_size": 2,
  "gradient_accumulation": 8,
  "learning_rate": 2e-4,
  "num_epochs": 3,
  "max_length": 1024,
  "warmup_ratio": 0.1,
  "use_4bit": true
}
```

**OpenAI API (alt)**

```bash
openai api fine_tunes.create \
  -t data/training-datasets/complete_training_set.jsonl \
  -m gpt-4o-mini-2024-07-18 \
  --suffix "characters-v1" \
  --n_epochs 3
# Cost ballpark for ~1.2k examples: ~$15–25
```

### Mixed Dataset Strategy (second best)

If you *must* start from a **base** model:

```bash
# Merge datasets, e.g. 80% OASST2 subset + 20% persona
node scripts/merge-datasets.js \
  --oasst2 data/external/oasst2_subset.jsonl \
  --characters data/training-datasets/complete_training_set.jsonl \
  --output data/training-datasets/mixed_training_set.jsonl \
  --ratio 80:20
```

Train:

```bash
python3 train_sft.py \
  --base_model "deepseek-ai/deepseek-llm-7b-base" \
  --custom_data "/app/data/training-datasets/mixed_training_set.jsonl" \
  --output_dir "/app/models/mixed" \
  --num_epochs 3 \
  --use_4bit
```

### Hardware

* **Minimum:** RTX 3090 24GB (QLoRA 4-bit)
* **Recommended:** RTX 5080 16GB (your setup) ✅
* **Ideal:** A100 40–80GB

---

## Post-Training Evaluation

### 1) General Dialogue

```bash
echo "Hello! How are you today?" | model_inference
# Expect: fluent, natural response ✅
```

### 2) Persona Consistency

```bash
echo "Tell me about your friendship with Elio" | model_inference --persona Glordon
# Expect: Glordon's tone/style and persona facts ✅
```

### 3) Cross-persona Separation

```bash
Q="What do you think about the Communiverse?"
model_inference --persona Glordon "$Q"
model_inference --persona "Lord Grigon" "$Q"
# Expect clearly different voices
```

**Metrics to watch**

* Perplexity (proxy)
* BLEU/ROUGE (limited utility for chat)
* **Human eval** (most important)
* Persona-consistency rubric / scorecards

---

## FAQ

**Q1: Why not just use a bigger model?**
A: 7B chat is often enough:

* Strong dialogue ability
* Learns nuanced personas
* Fast inference
* Reasonable VRAM

**Q2: Quality still not great?**
Priority order:

1. Improve **data quality** (not just quantity)
2. Tune learning rate
3. +epochs (≤5)
4. Only then consider a larger model

**Q3: Separate model per persona?**
A: **No.** A single model can handle many personas:

* Distinguish via persona field or system prompt
* Load LoRA adapters per persona if needed
* Cheaper and easier to maintain

**Q4: Are chat models too “polite”?**
A: Persona data + LoRA adapters will inject character-specific tone; even antagonists keep their voice within safety constraints.

---

## Quick Start Checklist

* [ ] GPU visible (`nvidia-smi`)
* [ ] Inside AI service container (or matching venv)
* [ ] Datasets mounted (`/mnt/ai_warehouse/datasets/`)
* [ ] Choose base model (DeepSeek/Mistral/Llama)
* [ ] Choose dataset (OASST2 recommended for base dialogue)
* [ ] Prepare dataset (`01_dataset_preparation.ipynb`)
* [ ] Train (`02_model_training_sft.ipynb` or script)
* [ ] Evaluate (`05_model_evaluation.ipynb` or CLI)
* [ ] Build persona datasets
* [ ] Train persona adapters and re-evaluate

