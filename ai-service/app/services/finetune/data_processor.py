"""
Data Processor - Process and format datasets for fine-tuning
"""

import json
import os
from typing import List, Dict, Any, Optional
from datasets import Dataset

from app.config import settings
from app.utils.logger import log_info, log_error


class DataProcessor:
    """
    Process various dataset formats for fine-tuning
    Supports: instruction, conversation, completion formats
    """

    @staticmethod
    def process_instruction_dataset(
        input_path: str,
        output_path: str,
        instruction_key: str = "instruction",
        input_key: str = "input",
        output_key: str = "output",
    ) -> bool:
        """
        Process instruction-following dataset

        Format:
        {
            "instruction": "...",
            "input": "...",
            "output": "..."
        }

        Converts to:
        {
            "text": "### Instruction: ...\n### Input: ...\n### Response: ..."
        }
        """

        try:
            log_info("Processing instruction dataset", input=input_path)

            with open(input_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            processed = []

            for item in data:
                instruction = item.get(instruction_key, "")
                input_text = item.get(input_key, "")
                output_text = item.get(output_key, "")

                # Format as instruction-following text
                text_parts = [f"### Instruction:\n{instruction}"]

                if input_text:
                    text_parts.append(f"\n### Input:\n{input_text}")

                text_parts.append(f"\n### Response:\n{output_text}")

                processed.append({"text": "".join(text_parts)})

            # Save processed dataset
            with open(output_path, "w", encoding="utf-8") as f:
                for item in processed:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")

            log_info(
                "Instruction dataset processed",
                input=input_path,
                output=output_path,
                samples=len(processed),
            )

            return True

        except Exception as e:
            log_error("Failed to process instruction dataset", error=str(e))
            return False

    @staticmethod
    def process_conversation_dataset(
        input_path: str, output_path: str, format_type: str = "chatml"
    ) -> bool:
        """
        Process conversation dataset

        Format:
        {
            "conversations": [
                {"role": "user", "content": "..."},
                {"role": "assistant", "content": "..."}
            ]
        }
        """

        try:
            log_info("Processing conversation dataset", input=input_path)

            with open(input_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            processed = []

            for item in data:
                conversations = item.get("conversations", [])

                if format_type == "chatml":
                    # ChatML format
                    text_parts = []
                    for msg in conversations:
                        role = msg.get("role", "user")
                        content = msg.get("content", "")
                        text_parts.append(f"<|im_start|>{role}\n{content}<|im_end|>")

                    text = "\n".join(text_parts)

                elif format_type == "alpaca":
                    # Alpaca format
                    text_parts = []
                    for i, msg in enumerate(conversations):
                        role = msg.get("role", "user")
                        content = msg.get("content", "")

                        if role == "user":
                            prefix = "### Human:" if i > 0 else "### Instruction:"
                        else:
                            prefix = "### Assistant:"

                        text_parts.append(f"{prefix}\n{content}")

                    text = "\n\n".join(text_parts)

                else:
                    # Simple format
                    text_parts = []
                    for msg in conversations:
                        role = msg.get("role", "user")
                        content = msg.get("content", "")
                        text_parts.append(f"{role.capitalize()}: {content}")

                    text = "\n".join(text_parts)

                processed.append({"text": text})

            # Save processed dataset
            with open(output_path, "w", encoding="utf-8") as f:
                for item in processed:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")

            log_info(
                "Conversation dataset processed",
                output=output_path,
                samples=len(processed),
            )

            return True

        except Exception as e:
            log_error("Failed to process conversation dataset", error=str(e))
            return False

    @staticmethod
    def split_dataset(
        input_path: str, train_path: str, val_path: str, split_ratio: float = 0.9
    ) -> bool:
        """Split dataset into train and validation sets"""

        try:
            log_info("Splitting dataset", input=input_path, ratio=split_ratio)

            with open(input_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            total = len(lines)
            train_size = int(total * split_ratio)

            train_data = lines[:train_size]
            val_data = lines[train_size:]

            # Save splits
            with open(train_path, "w", encoding="utf-8") as f:
                f.writelines(train_data)

            with open(val_path, "w", encoding="utf-8") as f:
                f.writelines(val_data)

            log_info(
                "Dataset split complete",
                train_samples=len(train_data),
                val_samples=len(val_data),
            )

            return True

        except Exception as e:
            log_error("Failed to split dataset", error=str(e))
            return False

    @staticmethod
    def validate_dataset(file_path: str) -> Dict[str, Any]:
        """Validate dataset format and quality"""

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            total_samples = len(lines)
            valid_samples = 0
            errors = []

            for i, line in enumerate(lines[:100]):  # Check first 100
                try:
                    data = json.loads(line)

                    if "text" not in data:
                        errors.append(f"Line {i+1}: Missing 'text' field")
                    elif not data["text"].strip():
                        errors.append(f"Line {i+1}: Empty text")
                    else:
                        valid_samples += 1

                except json.JSONDecodeError:
                    errors.append(f"Line {i+1}: Invalid JSON")

            return {
                "valid": len(errors) == 0,
                "total_samples": total_samples,
                "checked_samples": min(100, total_samples),
                "valid_samples": valid_samples,
                "errors": errors[:10],  # Return first 10 errors
            }

        except Exception as e:
            return {"valid": False, "error": str(e)}


# Global data processor
data_processor = DataProcessor()
