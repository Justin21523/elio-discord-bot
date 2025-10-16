"""
Fine-tuning Trainer - LoRA and QLoRA training
"""

import os
from typing import List, Dict, Any, Optional
from datetime import datetime

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, TaskType
from datasets import load_dataset

from app.config import settings, get_model_id
from app.utils.logger import log_info, log_error


class FineTuner:
    """
    Fine-tuning trainer with LoRA/QLoRA support
    """

    def __init__(self):
        self.training_jobs: Dict[str, Dict[str, Any]] = {}

    async def start_training(
        self,
        job_id: str,
        base_model: str,
        dataset_path: str,
        output_name: str,
        training_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Start a fine-tuning job

        Args:
            job_id: Unique job identifier
            base_model: Base model to fine-tune
            dataset_path: Path to training dataset
            output_name: Name for the fine-tuned model
            training_config: Optional training configuration overrides

        Returns:
            Job status
        """

        log_info(
            "Starting fine-tuning job",
            job_id=job_id,
            base_model=base_model,
            dataset=dataset_path,
        )

        try:
            # Initialize job tracking
            self.training_jobs[job_id] = {
                "job_id": job_id,
                "status": "initializing",
                "base_model": base_model,
                "dataset": dataset_path,
                "output_name": output_name,
                "started_at": datetime.utcnow().isoformat(),
                "progress": 0,
            }

            # Load model and tokenizer
            model_id = get_model_id(base_model)

            log_info("Loading base model", model=model_id)

            tokenizer = AutoTokenizer.from_pretrained(
                model_id, cache_dir=settings.MODEL_CACHE_DIR, trust_remote_code=True
            )

            # Add padding token if not present
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token

            # Load model with quantization if configured
            model_kwargs = {
                "cache_dir": settings.MODEL_CACHE_DIR,
                "trust_remote_code": True,
                "device_map": "auto",
            }

            if settings.USE_4BIT:
                from transformers import BitsAndBytesConfig

                model_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                )
            elif settings.USE_8BIT:
                model_kwargs["load_in_8bit"] = True

            model = AutoModelForCausalLM.from_pretrained(model_id, **model_kwargs)

            # Prepare model for training
            if settings.USE_4BIT or settings.USE_8BIT:
                model = prepare_model_for_kbit_training(model)

            # Configure LoRA
            lora_config = LoraConfig(
                r=training_config.get("lora_r", settings.LORA_R),  # type: ignore
                lora_alpha=training_config.get("lora_alpha", settings.LORA_ALPHA),  # type: ignore
                target_modules=training_config.get(  # type: ignore
                    "lora_target_modules", settings.LORA_TARGET_MODULES.split(",")
                ),
                lora_dropout=training_config.get("lora_dropout", settings.LORA_DROPOUT),  # type: ignore
                bias="none",
                task_type=TaskType.CAUSAL_LM,
            )

            model = get_peft_model(model, lora_config)
            model.print_trainable_parameters()

            # Load dataset
            log_info("Loading dataset", path=dataset_path)

            if dataset_path.endswith(".json") or dataset_path.endswith(".jsonl"):
                dataset = load_dataset("json", data_files=dataset_path)
            else:
                dataset = load_dataset(dataset_path)

            # Tokenize dataset
            def tokenize_function(examples):
                return tokenizer(
                    examples["text"],
                    truncation=True,
                    max_length=512,
                    padding="max_length",
                )

            tokenized_dataset = dataset.map(
                tokenize_function,
                batched=True,
                remove_columns=dataset["train"].column_names,  # type: ignore
            )

            # Data collator
            data_collator = DataCollatorForLanguageModeling(
                tokenizer=tokenizer, mlm=False
            )

            # Training arguments
            output_dir = os.path.join(settings.FINETUNE_OUTPUT_DIR, output_name)

            training_args = TrainingArguments(
                output_dir=output_dir,
                num_train_epochs=training_config.get(  # type: ignore
                    "epochs", settings.FINETUNE_EPOCHS
                ),
                per_device_train_batch_size=training_config.get(  # type: ignore
                    "batch_size", settings.FINETUNE_BATCH_SIZE
                ),
                learning_rate=training_config.get(  # type: ignore
                    "learning_rate", settings.FINETUNE_LEARNING_RATE
                ),
                warmup_steps=training_config.get(  # type: ignore
                    "warmup_steps", settings.FINETUNE_WARMUP_STEPS
                ),
                logging_steps=10,
                save_steps=100,
                eval_strategy=(  # type: ignore
                    "steps" if "validation" in tokenized_dataset else "no"
                ),
                eval_steps=100 if "validation" in tokenized_dataset else None,
                save_total_limit=3,
                fp16=torch.cuda.is_available(),
                gradient_accumulation_steps=4,
                dataloader_num_workers=2,
                load_best_model_at_end=(
                    True if "validation" in tokenized_dataset else False
                ),
                report_to="none",  # Disable wandb, tensorboard, etc.
            )

            # Create trainer
            trainer = Trainer(
                model=model,
                args=training_args,
                train_dataset=tokenized_dataset["train"],
                eval_dataset=tokenized_dataset.get("validation"),  # type: ignore
                data_collator=data_collator,
                tokenizer=tokenizer,  # type: ignore
            )

            # Update job status
            self.training_jobs[job_id]["status"] = "training"

            # Start training
            log_info("Starting training", job_id=job_id)
            trainer.train()

            # Save fine-tuned model
            log_info("Saving fine-tuned model", output_dir=output_dir)
            trainer.save_model(output_dir)
            tokenizer.save_pretrained(output_dir)

            # Update job status
            self.training_jobs[job_id]["status"] = "completed"
            self.training_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
            self.training_jobs[job_id]["output_path"] = output_dir

            log_info("Fine-tuning completed", job_id=job_id)

            return {"success": True, "job_id": job_id, "output_path": output_dir}

        except Exception as e:
            log_error("Fine-tuning failed", job_id=job_id, error=str(e))

            self.training_jobs[job_id]["status"] = "failed"
            self.training_jobs[job_id]["error"] = str(e)

            return {"success": False, "job_id": job_id, "error": str(e)}

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get training job status"""
        return self.training_jobs.get(job_id)

    def list_jobs(self) -> List[Dict[str, Any]]:
        """List all training jobs"""
        return list(self.training_jobs.values())


# Global fine-tuner instance
fine_tuner = FineTuner()
