"""
Reranker - Cross-encoder model for result reranking
Improves search quality by computing direct query-document relevance
"""

from typing import List, Tuple, Dict, Any, Optional
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

from app.utils.logger import log_info, log_error


class Reranker:
    """
    Cross-encoder reranker for search results
    Uses transformer models to compute accurate query-document relevance scores
    """

    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        cache_dir: str = "./models",
    ):
        """
        Initialize reranker

        Args:
            model_name: Hugging Face model identifier
            cache_dir: Directory to cache model files
        """
        self.model_name = model_name
        self.cache_dir = cache_dir
        self.model = None
        self.tokenizer = None
        self.device = None
        self.initialized = False

    async def initialize(self):
        """Load reranker model"""
        if self.initialized:
            return

        try:
            log_info("Loading reranker model", model=self.model_name)

            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name, cache_dir=self.cache_dir
            )

            self.model = AutoModelForSequenceClassification.from_pretrained(
                self.model_name, cache_dir=self.cache_dir
            )

            # Set device
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                log_info("Using CUDA for reranking")
            else:
                self.device = torch.device("cpu")
                log_info("Using CPU for reranking")

            self.model = self.model.to(self.device)
            self.model.eval()

            self.initialized = True
            log_info("Reranker model loaded successfully")

        except Exception as e:
            log_error("Failed to load reranker", error=str(e))
            self.initialized = False

    async def rerank(
        self, pairs: List[Tuple[str, str]], top_k: Optional[int] = None
    ) -> List[float]:
        """
        Rerank query-document pairs using cross-encoder

        Args:
            pairs: List of (query, document) tuples
            top_k: Optional number of top results to return

        Returns:
            List of relevance scores (or indices if top_k specified)
        """
        if not self.initialized:
            await self.initialize()

        if not self.model:
            # Return dummy scores if reranker not available
            log_error("Reranker not initialized, returning dummy scores")
            return [0.5] * len(pairs)

        try:
            # Tokenize all pairs at once (batch processing)
            inputs = self.tokenizer(  # type: ignore
                pairs,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )

            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Get relevance scores
            with torch.no_grad():
                outputs = self.model(**inputs)
                scores = outputs.logits.squeeze(-1)

            # Convert to list
            scores_list = scores.cpu().tolist()

            # Ensure list format even for single item
            if not isinstance(scores_list, list):
                scores_list = [scores_list]

            return scores_list

        except Exception as e:
            log_error("Reranking failed", error=str(e))
            return [0.5] * len(pairs)

    async def rerank_results(
        self, query: str, results: List[Dict[str, Any]], top_k: int
    ) -> List[Dict[str, Any]]:
        """
        Rerank search results and return top_k

        Args:
            query: Original search query
            results: List of search results with 'chunk' or 'content' field
            top_k: Number of top results to return

        Returns:
            Reranked list of results with added 'rerank_score' field
        """
        if not results:
            return results

        # Prepare query-document pairs
        pairs = []
        for result in results:
            chunk = result.get("chunk", result.get("content", ""))
            pairs.append((query, chunk))

        # Get reranking scores
        scores = await self.rerank(pairs)

        # Attach scores to results
        for i, result in enumerate(results):
            result["rerank_score"] = float(scores[i])
            result["original_score"] = result.get("score", 0.0)

        # Sort by rerank score
        reranked = sorted(results, key=lambda x: x.get("rerank_score", 0), reverse=True)

        # Return top_k
        return reranked[:top_k]

    async def close(self):
        """Cleanup resources"""
        if self.model:
            del self.model
            self.model = None
        if self.tokenizer:
            del self.tokenizer
            self.tokenizer = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        log_info("Reranker closed")
