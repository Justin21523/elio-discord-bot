#!/usr/bin/env python3
"""
Simplified SFT Training Script
Run this directly in the ai-service container or locally with GPU
"""

import os
import sys

# CRITICAL: Disable PyTorch compile to avoid slow worker overhead
os.environ["TORCH_COMPILE_DISABLE"] = "1"
os.environ["TORCHINDUCTOR_MAX_WORKERS"] = "0"

import torch
import json
import argparse
from pathlib import Path
from datasets import load_dataset, load_from_disk, concatenate_datasets
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
    EarlyStoppingCallback,
    BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, TaskType

def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune LLM with LoRA/QLoRA")

    # Model and data
    parser.add_argument("--base_model", type=str, default="deepseek-ai/deepseek-llm-7b-base",
                       help="Base model to fine-tune")
    parser.add_argument("--datasets_dir", type=str, default="/mnt/c/AI_LLM_projects/ai_warehouse/datasets",
                       help="Directory containing HuggingFace datasets")
    parser.add_argument("--custom_data", type=str, default="/mnt/c/web-projects/elioverse-bot/data/training-datasets/communiverse_training.jsonl",
                       help="Path to custom training data (JSONL)")
    parser.add_argument("--output_dir", type=str, default="../models/sft_lora_communiverse",
                       help="Output directory for model")

    # LoRA config
    parser.add_argument("--lora_r", type=int, default=16, help="LoRA rank")
    parser.add_argument("--lora_alpha", type=int, default=32, help="LoRA alpha")
    parser.add_argument("--lora_dropout", type=float, default=0.05, help="LoRA dropout")

    # Training config
    parser.add_argument("--batch_size", type=int, default=2, help="Per-device batch size")
    parser.add_argument("--gradient_accumulation", type=int, default=8, help="Gradient accumulation steps")
    parser.add_argument("--learning_rate", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--num_epochs", type=int, default=3, help="Number of epochs")
    parser.add_argument("--max_length", type=int, default=2048, help="Max sequence length")

    # Optimization
    parser.add_argument("--use_4bit", action="store_true", default=True, help="Use 4-bit quantization")
    parser.add_argument("--use_8bit", action="store_true", help="Use 8-bit quantization")
    parser.add_argument("--no_quantization", action="store_true", help="Disable quantization")

    # Dataset selection
    parser.add_argument("--use_oasst2", action="store_true", default=False)
    parser.add_argument("--use_alpaca", action="store_true", default=False)
    parser.add_argument("--use_firefly", action="store_true", default=False)
    parser.add_argument("--max_samples", type=int, default=None, help="Limit total samples for testing")
    parser.add_argument("--oasst2_samples", type=int, default=None, help="Number of OASST2 samples to use")
    parser.add_argument("--alpaca_samples", type=int, default=None, help="Number of Alpaca samples to use")

    return parser.parse_args()

def format_example(example, dataset_name=""):
    """Format different dataset types to unified format"""
    # ChatML / Messages format (OpenAI-style)
    if 'messages' in example:
        messages = example['messages']
        text_parts = []
        for msg in messages:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            if role == 'system':
                text_parts.append(f"### System:\\n{content}")
            elif role == 'user':
                text_parts.append(f"### User:\\n{content}")
            elif role == 'assistant':
                text_parts.append(f"### Assistant:\\n{content}")
        text = "\\n\\n".join(text_parts)

    # Alpaca format
    elif 'instruction' in example and 'output' in example:
        instruction = example['instruction']
        input_text = example.get('input', '')
        output = example['output']

        if input_text:
            text = f"### Instruction:\\n{instruction}\\n\\n### Input:\\n{input_text}\\n\\n### Response:\\n{output}"
        else:
            text = f"### Instruction:\\n{instruction}\\n\\n### Response:\\n{output}"

    # OASST2 format
    elif 'text' in example and dataset_name == 'oasst2':
        text = example['text']

    # Firefly format
    elif 'input' in example and 'target' in example:
        text = f"### Instruction:\\n{example['input']}\\n\\n### Response:\\n{example['target']}"

    # Communiverse custom format
    elif 'persona' in example and 'dialogue' in example:
        text = f"### Character: {example['persona']}\\n\\n{example['dialogue']}"

    # Already formatted
    elif 'text' in example:
        text = example['text']
    else:
        text = str(example)

    return {"text": text}

def load_and_prepare_datasets(args):
    """Load and combine multiple datasets"""
    all_datasets = []
    stats = {}

    # Load OASST2
    if args.use_oasst2:
        try:
            print("Loading OASST2...")
            # Try loading from arrow files
            oasst2_base = os.path.join(args.datasets_dir, "OpenAssistant___oasst2/default/0.0.0/179dd21fc55192153d94adb0e0ce8f69e222bf75")
            oasst2_train_arrow = os.path.join(oasst2_base, "oasst2-train.arrow")

            if os.path.exists(oasst2_train_arrow):
                from datasets import Dataset as DatasetClass
                train_ds = DatasetClass.from_file(oasst2_train_arrow)
            else:
                ds = load_dataset("OpenAssistant/oasst2")
                train_ds = ds['train']

            train_ds = train_ds.map(lambda x: format_example(x, 'oasst2'))

            # Sample if oasst2_samples is set
            if args.oasst2_samples and len(train_ds) > args.oasst2_samples:
                import random
                random.seed(42)
                indices = random.sample(range(len(train_ds)), args.oasst2_samples)
                original_len = len(train_ds)
                train_ds = train_ds.select(indices)
                print(f"  ✓ OASST2: {len(train_ds):,} samples (sampled from {original_len:,})")
            else:
                print(f"  ✓ OASST2: {len(train_ds):,} samples")

            all_datasets.append(train_ds)
            stats['oasst2'] = len(train_ds)
        except Exception as e:
            print(f"  ✗ Failed: {e}")

    # Load Alpaca
    if args.use_alpaca:
        try:
            print("Loading Alpaca...")
            # Try loading from arrow files
            alpaca_base = os.path.join(args.datasets_dir, "tatsu-lab___alpaca/default/0.0.0/dce01c9b08f87459cf36a430d809084718273017")
            alpaca_train_arrow = os.path.join(alpaca_base, "alpaca-train.arrow")

            if os.path.exists(alpaca_train_arrow):
                from datasets import Dataset as DatasetClass
                train_ds = DatasetClass.from_file(alpaca_train_arrow)
            else:
                # Try to find any arrow file in the directory
                import glob
                arrow_files = glob.glob(os.path.join(alpaca_base, "*-train.arrow"))
                if arrow_files:
                    from datasets import Dataset as DatasetClass
                    train_ds = DatasetClass.from_file(arrow_files[0])
                else:
                    ds = load_dataset("tatsu-lab/alpaca")
                    train_ds = ds['train']

            train_ds = train_ds.map(lambda x: format_example(x, 'alpaca'))

            # Sample if alpaca_samples is set
            if args.alpaca_samples and len(train_ds) > args.alpaca_samples:
                import random
                random.seed(42)
                indices = random.sample(range(len(train_ds)), args.alpaca_samples)
                original_len = len(train_ds)
                train_ds = train_ds.select(indices)
                print(f"  ✓ Alpaca: {len(train_ds):,} samples (sampled from {original_len:,})")
            else:
                print(f"  ✓ Alpaca: {len(train_ds):,} samples")

            all_datasets.append(train_ds)
            stats['alpaca'] = len(train_ds)
        except Exception as e:
            print(f"  ✗ Failed: {e}")

    # Load Firefly
    if args.use_firefly:
        try:
            print("Loading Firefly...")
            firefly_path = os.path.join(args.datasets_dir, "YeungNLP___firefly-train-1.1_m")
            if os.path.exists(firefly_path):
                ds = load_from_disk(firefly_path)
            else:
                ds = load_dataset("YeungNLP/firefly-train-1.1_m")

            train_ds = ds['train'].map(lambda x: format_example(x, 'firefly'))
            # Limit Firefly to 50k samples
            if len(train_ds) > 50000:
                train_ds = train_ds.select(range(50000))
            all_datasets.append(train_ds)
            stats['firefly'] = len(train_ds)
            print(f"  ✓ Firefly: {len(train_ds):,} samples")
        except Exception as e:
            print(f"  ✗ Failed: {e}")

    # Load custom Communiverse data
    if os.path.exists(args.custom_data):
        try:
            print("Loading Communiverse custom data...")
            ds = load_dataset('json', data_files=args.custom_data)
            train_ds = ds['train'].map(lambda x: format_example(x, 'communiverse'))
            all_datasets.append(train_ds)
            stats['communiverse'] = len(train_ds)
            print(f"  ✓ Communiverse: {len(train_ds):,} samples")
        except Exception as e:
            print(f"  ✗ Failed: {e}")

    if len(all_datasets) == 0:
        raise ValueError("No datasets loaded! Check your paths and configuration.")

    # Combine and split
    print(f"\\nCombining {len(all_datasets)} datasets...")
    combined = concatenate_datasets(all_datasets)
    combined = combined.shuffle(seed=42)

    # Train/val split
    split = combined.train_test_split(test_size=0.05, seed=42)
    train_dataset = split['train']
    val_dataset = split['test']

    # Apply sample limits if testing
    if args.max_samples:
        train_dataset = train_dataset.select(range(min(args.max_samples, len(train_dataset))))
        val_samples = min(args.max_samples // 20, len(val_dataset))
        val_dataset = val_dataset.select(range(val_samples))

    print(f"\\n{'='*60}")
    print("DATASET SUMMARY")
    print(f"{'='*60}")
    for name, count in stats.items():
        print(f"{name:20s}: {count:>10,} samples")
    print(f"{'='*60}")
    print(f"{'Total':20s}: {len(combined):>10,} samples")
    print(f"{'Training':20s}: {len(train_dataset):>10,} samples")
    print(f"{'Validation':20s}: {len(val_dataset):>10,} samples")
    print(f"{'='*60}\\n")

    return train_dataset, val_dataset, stats

def tokenize_dataset(dataset, tokenizer, max_length):
    """Tokenize dataset for causal language modeling"""
    def tokenize_function(examples):
        tokenized = tokenizer(
            examples['text'],
            truncation=True,
            max_length=max_length,
            padding='max_length',  # Pad to max_length for consistent batch sizes
            return_tensors=None
        )
        tokenized['labels'] = tokenized['input_ids'].copy()
        return tokenized

    return dataset.map(
        tokenize_function,
        batched=True,
        remove_columns=dataset.column_names,
        desc="Tokenizing"
    )

def main():
    args = parse_args()

    # Handle quantization flags
    if args.no_quantization:
        args.use_4bit = False
        args.use_8bit = False
    elif args.use_8bit:
        args.use_4bit = False

    print("="*60)
    print("SFT TRAINING WITH LORA/QLORA")
    print("="*60)
    print(f"Base model:      {args.base_model}")
    print(f"Output dir:      {args.output_dir}")
    print(f"Quantization:    {'4-bit' if args.use_4bit else '8-bit' if args.use_8bit else 'None'}")
    print(f"LoRA rank:       {args.lora_r}")
    print(f"Batch size:      {args.batch_size} x {args.gradient_accumulation} = {args.batch_size * args.gradient_accumulation}")
    print(f"Learning rate:   {args.learning_rate}")
    print(f"Epochs:          {args.num_epochs}")
    print("="*60 + "\\n")

    # Check GPU
    if not torch.cuda.is_available():
        print("⚠️  WARNING: No GPU detected! Training will be extremely slow.")
        print("   Consider using Google Colab or a cloud GPU instance.\\n")
    else:
        print(f"✓ GPU: {torch.cuda.get_device_name(0)}")
        print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB\\n")

    # Load datasets
    train_dataset, val_dataset, dataset_stats = load_and_prepare_datasets(args)

    # Load tokenizer
    print(f"Loading tokenizer from {args.base_model}...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id
    print(f"✓ Tokenizer loaded (vocab size: {len(tokenizer):,})\\n")

    # Tokenize datasets
    print("Tokenizing datasets...")
    tokenized_train = tokenize_dataset(train_dataset, tokenizer, args.max_length)
    tokenized_val = tokenize_dataset(val_dataset, tokenizer, args.max_length)
    print(f"✓ Tokenization complete\\n")

    # Load model
    print(f"Loading model: {args.base_model}")
    model_kwargs = {"trust_remote_code": True, "use_cache": False}

    if args.use_4bit:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True
        )
        model_kwargs["quantization_config"] = bnb_config
        print("  Using 4-bit quantization (QLoRA)")
    elif args.use_8bit:
        model_kwargs["load_in_8bit"] = True
        print("  Using 8-bit quantization")

    model = AutoModelForCausalLM.from_pretrained(args.base_model, **model_kwargs)

    if args.use_4bit or args.use_8bit:
        model = prepare_model_for_kbit_training(model)

    print(f"✓ Model loaded ({model.num_parameters() / 1e9:.2f}B parameters)\\n")

    # Apply LoRA
    print("Configuring LoRA...")
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM
    )

    model = get_peft_model(model, lora_config)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"✓ LoRA applied")
    print(f"  Trainable parameters: {trainable:,} ({100 * trainable / total:.2f}%)\\n")

    # Training arguments
    os.makedirs(args.output_dir, exist_ok=True)
    total_steps = (len(tokenized_train) // (args.batch_size * args.gradient_accumulation)) * args.num_epochs

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        warmup_ratio=0.03,
        weight_decay=0.01,
        max_grad_norm=1.0,
        lr_scheduler_type="cosine",

        # Optimization
        fp16=not args.use_4bit,
        gradient_checkpointing=False,  # Disabled for speed
        optim="paged_adamw_8bit" if args.use_4bit else "adamw_torch",

        # Logging and saving
        logging_steps=10,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=2,
        eval_strategy="steps",
        eval_steps=100,
        load_best_model_at_end=False,  # Disabled for speed
        metric_for_best_model="eval_loss",

        report_to="none",
        remove_unused_columns=False,
    )

    # Data collator
    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_train,
        eval_dataset=tokenized_val,
        data_collator=data_collator,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)]
    )

    # Train
    print("="*60)
    print("STARTING TRAINING")
    print("="*60)
    print(f"Total steps: {total_steps:,}")
    print(f"Estimated time: {total_steps * 2 / 3600:.1f} hours\\n")

    train_result = trainer.train()

    print("\\n" + "="*60)
    print("TRAINING COMPLETED")
    print("="*60)
    print(f"Time:        {train_result.metrics['train_runtime'] / 3600:.2f} hours")
    print(f"Train loss:  {train_result.metrics['train_loss']:.4f}")
    print("="*60 + "\\n")

    # Evaluate
    eval_results = trainer.evaluate()
    print("EVALUATION RESULTS")
    print("="*60)
    for key, value in eval_results.items():
        print(f"{key:25s}: {value:.4f}")
    print("="*60 + "\\n")

    # Save
    model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    # Save metadata
    metadata = {
        "base_model": args.base_model,
        "datasets": dataset_stats,
        "lora_config": {"r": args.lora_r, "alpha": args.lora_alpha, "dropout": args.lora_dropout},
        "training_config": {
            "learning_rate": args.learning_rate,
            "epochs": args.num_epochs,
            "batch_size": args.batch_size * args.gradient_accumulation,
            "quantization": "4-bit" if args.use_4bit else "8-bit" if args.use_8bit else "none"
        },
        "results": {
            "train_loss": float(train_result.metrics['train_loss']),
            "eval_loss": float(eval_results['eval_loss']),
            "runtime_hours": float(train_result.metrics['train_runtime'] / 3600)
        }
    }

    with open(os.path.join(args.output_dir, 'training_metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\\n✅ All outputs saved to: {args.output_dir}")
    print("\\nTo use the model:")
    print(f"  1. Load adapters: model = PeftModel.from_pretrained(base_model, '{args.output_dir}')")
    print(f"  2. Or merge: model.merge_and_unload() then save")

if __name__ == "__main__":
    main()
