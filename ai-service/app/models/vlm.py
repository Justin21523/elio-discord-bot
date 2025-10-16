"""
VLM Service - Vision-Language Model for image understanding
"""

import torch
from PIL import Image
import requests
from io import BytesIO
from typing import Optional, Dict, Any, List
from app.models.manager import model_manager
from app.config import settings
from app.utils.logger import log_info, log_error
from app.utils.metrics import tokens_generated_total


class VLMService:
    """Service for image understanding using VLM models"""

    async def describe_image(
        self,
        image_url: str,
        question: str = "Describe this image in detail.",
        model_name: Optional[str] = None,
        max_tokens: int = 512,
    ) -> Dict[str, Any]:
        """
        Describe an image

        Args:
            image_url: URL or data URI of the image
            question: Question or instruction about the image
            model_name: VLM model to use
            max_tokens: Maximum tokens to generate

        Returns:
            Dictionary with 'text' key containing description and 'usage' metadata
        """
        model_name = model_name or settings.VLM_MODEL
        prompt = question

        try:
            log_info("VLM description started", model=model_name, prompt=prompt[:100])

            # Load image
            image = self._load_image(image_url)

            # Load model and tokenizer
            model, tokenizer = model_manager.get_model(model_name, "vlm")

            # Process based on model type
            if "qwen" in model_name.lower():
                result = await self._process_qwen_vl(
                    model, tokenizer, image, prompt, max_tokens
                )
            elif "llava" in model_name.lower():
                result = await self._process_llava(
                    model, tokenizer, image, prompt, max_tokens
                )
            else:
                raise ValueError(f"Unsupported VLM model: {model_name}")

            log_info(
                "VLM description completed",
                model=model_name,
                tokens_used=result.get("tokens_used", 0),
            )

            return result

        except Exception as e:
            log_error("VLM description failed", model=model_name, error=str(e))
            raise

    def _load_image(self, image_url: str) -> Image.Image:
        """Load image from URL or data URI"""
        try:
            if image_url.startswith("data:"):
                # Handle data URI
                import base64

                header, encoded = image_url.split(",", 1)
                image_data = base64.b64decode(encoded)
                image = Image.open(BytesIO(image_data))
            else:
                # Handle HTTP URL
                response = requests.get(image_url, timeout=10)
                response.raise_for_status()
                image = Image.open(BytesIO(response.content))

            # Convert to RGB if needed
            if image.mode != "RGB":
                image = image.convert("RGB")

            return image

        except Exception as e:
            log_error("Failed to load image", error=str(e))
            raise

    async def _process_qwen_vl(
        self,
        model: Any, tokenizer: Any, image: Image.Image, prompt: str, max_tokens: int
    ) -> Dict[str, Any]:
        """Process image with Qwen-VL model"""
        from transformers import AutoProcessor

        # Qwen-VL specific processing
        processor = AutoProcessor.from_pretrained(
            "Qwen/Qwen-VL-Chat", trust_remote_code=True
        )

        # Prepare inputs
        query = tokenizer.from_list_format([{"image": image}, {"text": prompt}])

        inputs = processor(query, return_tensors="pt")
        device = next(model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}

        # Generate
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=max_tokens)

        # Decode
        response = processor.decode(outputs[0], skip_special_tokens=True)

        tokens_used = len(outputs[0])
        tokens_generated_total.labels(model_type="vlm").inc(tokens_used)

        return {
            "text": response,
            "usage": {"total_tokens": tokens_used},
            "model": "qwen-vl",
        }

    async def _process_llava(
        self,
        model: Any, tokenizer: Any, image: Image.Image, prompt: str, max_tokens: int
    ) -> Dict[str, Any]:
        """Process image with LLaVA model"""
        from transformers import CLIPImageProcessor

        # LLaVA specific processing
        image_processor = CLIPImageProcessor.from_pretrained(
            "openai/clip-vit-large-patch14"
        )

        # Prepare image
        image_tensor = image_processor(images=image, return_tensors="pt")[
            "pixel_values"
        ]

        # Prepare text
        conversation = [{"role": "user", "content": f"<image>\n{prompt}"}]

        text = tokenizer.apply_chat_template(
            conversation, tokenize=False, add_generation_prompt=True
        )

        inputs = tokenizer(text, return_tensors="pt")

        # Move to device
        device = next(model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        image_tensor = image_tensor.to(device)

        # Generate
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                images=image_tensor,
                max_new_tokens=max_tokens,
                do_sample=True,
                temperature=0.7,
            )

        # Decode
        response = tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True
        ).strip()

        tokens_used = len(outputs[0])
        tokens_generated_total.labels(model_type="vlm").inc(tokens_used)

        return {
            "text": response,
            "usage": {"total_tokens": tokens_used},
            "model": "llava-next",
        }


# Global VLM service instance
vlm_service = VLMService()
