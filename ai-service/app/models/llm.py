"""
LLM Service - Text generation using various LLM models
"""

import torch
from typing import List, Optional, Dict, Any
from app.models.manager import model_manager
from app.config import settings
from app.utils.logger import log_info, log_error
from app.utils.metrics import tokens_generated_total


class LLMService:
    """Service for text generation using LLM models"""

    async def generate(
        self,
        prompt: str = "",
        system: Optional[str] = None,
        model_name: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        top_p: float = 0.9,
        stop: Optional[List[str]] = None,
        use_finetuned: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate text completion

        Args:
            prompt: Input prompt
            system: System prompt (optional)
            model_name: Model to use (defaults to configured LLM_MODEL)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            top_p: Nucleus sampling parameter
            stop: Stop sequences
            use_finetuned: Use fine-tuned character model (default: False)

        Returns:
            Dictionary with generated text and metadata including 'text' and 'usage'
        """
        model_name = model_name or settings.LLM_MODEL
        system_prompt = system or ""
        stop_sequences = stop

        try:
            log_info(
                "LLM generation started",
                model=model_name,
                prompt_length=len(prompt),
                max_tokens=max_tokens,
                use_finetuned=use_finetuned,
            )

            # Load model and tokenizer
            # Use fine-tuned model if requested and enabled
            if use_finetuned and settings.FINETUNED_MODEL_ENABLED:
                from app.models.finetuned import finetuned_model_manager

                try:
                    model, tokenizer = finetuned_model_manager.get_model()
                    log_info("Using fine-tuned character model")
                except Exception as e:
                    log_error("Failed to load fine-tuned model, falling back to base", error=str(e))
                    model, tokenizer = model_manager.get_model(model_name, "llm")
            else:
                model, tokenizer = model_manager.get_model(model_name, "llm")

            # Format prompt based on model type
            formatted_prompt = self._format_prompt(
                prompt, system_prompt, model_name, tokenizer
            )

            # Tokenize input
            inputs = tokenizer(
                formatted_prompt, return_tensors="pt", truncation=True, max_length=4096
            )

            # Move to device
            device = next(model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}

            # Generate
            with torch.no_grad():
                gen_kwargs = {
                    **inputs,
                    "max_new_tokens": max_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "do_sample": temperature > 0,
                    "pad_token_id": tokenizer.pad_token_id,
                    "eos_token_id": tokenizer.eos_token_id,
                }

                # Try to add stop_strings if supported (transformers 4.40+)
                # Don't add if empty to avoid model validation errors
                # Note: DeepSeek and some models don't support stop_strings
                # We skip it for now to avoid validation errors

                outputs = model.generate(**gen_kwargs)

            # Decode output
            generated_ids = outputs[0][inputs["input_ids"].shape[1] :]
            generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)

            # Clean up output
            generated_text = generated_text.strip()

            # Calculate tokens used
            tokens_used = len(outputs[0])
            tokens_generated_total.labels(model_type="llm").inc(tokens_used)

            log_info(
                "LLM generation completed",
                model=model_name,
                tokens_used=tokens_used,
                output_length=len(generated_text),
            )

            return {
                "text": generated_text,
                "usage": {
                    "prompt_tokens": inputs["input_ids"].shape[1],
                    "completion_tokens": len(generated_ids),
                    "total_tokens": tokens_used,
                },
                "model": model_name,
            }

        except Exception as e:
            log_error("LLM generation failed", model=model_name, error=str(e))
            raise

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model_name: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        top_p: float = 0.9,
        stop_sequences: List[str] = None,  # type: ignore
    ) -> Dict[str, Any]:
        """
        Generate chat completion

        Args:
            messages: List of message dicts with 'role' and 'content'
            model_name: Model to use
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            top_p: Nucleus sampling parameter
            stop_sequences: Stop sequences

        Returns:
            Dictionary with generated text and metadata
        """
        model_name = model_name or settings.LLM_MODEL

        try:
            log_info("LLM chat started", model=model_name, message_count=len(messages))

            # Load model and tokenizer
            model, tokenizer = model_manager.get_model(model_name, "llm")

            # Format chat messages
            formatted_prompt = LLMService._format_chat_messages(
                messages=messages, tokenizer=tokenizer
            )

            # Use generate method
            result = await self.generate(
                prompt=formatted_prompt,
                model_name=model_name,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stop=stop_sequences,
            )

            return result

        except Exception as e:
            log_error("LLM chat failed", model=model_name, error=str(e))
            raise

    def _format_prompt(
        self, prompt: str, system_prompt: str, model_name: str, tokenizer: Any
    ) -> str:
        """Format prompt based on model type"""

        # Check if tokenizer has chat template
        if hasattr(tokenizer, "chat_template") and tokenizer.chat_template:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            return tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )

        # Fallback: Simple concatenation
        if system_prompt:
            return f"{system_prompt}\n\n{prompt}"
        return prompt

    @staticmethod
    def _format_chat_messages(messages: List[Dict[str, str]], tokenizer: Any) -> str:
        """Format chat messages for the model"""

        # Use tokenizer's chat template if available
        if hasattr(tokenizer, "chat_template") and tokenizer.chat_template:
            return tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )

        # Fallback: Simple formatting
        formatted = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            formatted.append(f"{role.capitalize()}: {content}")

        return "\n".join(formatted)


# Global LLM service instance
llm_service = LLMService()
