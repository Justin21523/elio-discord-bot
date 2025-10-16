"""
Embeddings Service - Generate vector embeddings for text
"""

import torch
import torch.nn.functional as F
from typing import List, Dict, Any
from app.models.manager import model_manager
from app.config import settings
from app.utils.logger import log_info, log_error


class EmbeddingsService:
    """Service for generating text embeddings"""

    async def embed(self, texts: List[str], model_name: str = None, lang_hint: str = None) -> Dict[str, Any]:  # type: ignore
        """
        Generate embeddings for a list of texts

        Args:
            texts: List of texts to embed
            model_name: Embeddings model to use

        Returns:
            Dictionary with vectors and metadata
        """
        model_name = model_name or settings.EMBED_MODEL

        try:
            log_info(
                "Embeddings generation started", model=model_name, text_count=len(texts)
            )

            # Load model and tokenizer
            model, tokenizer = model_manager.get_model(model_name, "embeddings")

            # Tokenize
            inputs = tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )

            # Move to device
            device = next(model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}

            # Generate embeddings
            with torch.no_grad():
                outputs = model(**inputs)

                # Mean pooling
                embeddings = self._mean_pooling(
                    outputs.last_hidden_state, inputs["attention_mask"]
                )

                # Normalize embeddings
                embeddings = F.normalize(embeddings, p=2, dim=1)

            # Convert to list
            vectors = embeddings.cpu().numpy().tolist()
            dim = embeddings.shape[1]

            log_info(
                "Embeddings generated successfully",
                model=model_name,
                text_count=len(texts),
                dimension=dim,
            )

            return {"vectors": vectors, "dim": dim, "model": model_name}

        except Exception as e:
            log_error("Embeddings generation failed", model=model_name, error=str(e))
            raise

    async def get_info(self) -> Dict[str, Any]:
        """Get embeddings model information"""
        return {
            "dim": 1024,  # BGE-M3 dimension
            "max_length": 512,
            "multilingual": True,
        }

    def _mean_pooling(
        self, token_embeddings: torch.Tensor, attention_mask: torch.Tensor
    ) -> torch.Tensor:
        """
        Mean pooling with attention mask

        Args:
            token_embeddings: Token-level embeddings
            attention_mask: Attention mask

        Returns:
            Pooled embeddings
        """
        input_mask_expanded = (
            attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        )

        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)

        return sum_embeddings / sum_mask


# Global embeddings service instance
embeddings_service = EmbeddingsService()
