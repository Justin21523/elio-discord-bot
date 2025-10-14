import os
import httpx
from typing import List, Dict, Any, Optional, Literal

BackendType = Literal["tgi", "hf-endpoint"]

class TGIClient:
    """
    Minimal TGI client (Text Generation Inference).
    Assumes server exposes /v1/chat/completions (OpenAI compat) or /generate.
    Prefer OpenAI compat for future-proofing.
    """
    def __init__(self, base_url: str, model: Optional[str] = None, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.client = httpx.Client(timeout=timeout)

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.7, max_tokens: int = 512) -> str:
        # Try OpenAI-compatible path first
        url = f"{self.base_url}/v1/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        r = self.client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]

class HFHostedClient:
    """
    Hugging Face Inference Endpoints/Inference API client for chat-like calls.
    For Inference Endpoints that expose text-generation, we simulate a simple prompt join.
    """
    def __init__(self, api_url: str, hf_token: str, timeout: float = 30.0):
        self.api_url = api_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {hf_token}", "Content-Type": "application/json"}
        self.client = httpx.Client(timeout=timeout)

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.7, max_tokens: int = 512) -> str:
        # Simple prompt concat (system + user/assistant turns)
        prompt = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            prompt.append(f"{role.upper()}: {content}")
        full = "\n".join(prompt) + "\nASSISTANT:"

        payload = {
            "inputs": full,
            "parameters": {"max_new_tokens": max_tokens, "temperature": temperature, "return_full_text": False},
        }
        r = self.client.post(self.api_url, headers=self.headers, json=payload)
        r.raise_for_status()
        data = r.json()

        # Inference API returns list of generated_text
        if isinstance(data, list) and len(data) > 0 and "generated_text" in data[0]:
            return data[0]["generated_text"]
        # Inference Endpoints often return dict with "generated_text"
        if isinstance(data, dict) and "generated_text" in data:
            return data["generated_text"]
        return str(data)
