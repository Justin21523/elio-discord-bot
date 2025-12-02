from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.markov import train_from_corpus, MarkovModel

router = APIRouter(prefix="/markov", tags=["markov"])

# In-memory model cache (CPU-friendly)
MODEL_CACHE = {}


class TrainRequest(BaseModel):
    corpus: list[str]
    order: int = 2
    model_name: str = "default"


class GenerateRequest(BaseModel):
    model_name: str = "default"
    seed: str = ""
    max_len: int = 50
    temperature: float = 1.0
    repetition_penalty: float = 1.1


@router.post("/train")
async def train(req: TrainRequest):
    if not req.corpus:
        raise HTTPException(status_code=400, detail="corpus is empty")
    model = train_from_corpus(req.corpus, req.order)
    MODEL_CACHE[req.model_name] = model
    return {"ok": True, "model": req.model_name, "order": model.order}


@router.post("/generate")
async def generate(req: GenerateRequest):
    model = MODEL_CACHE.get(req.model_name)
    if not model:
        raise HTTPException(status_code=404, detail="model not found, train first")
    text = model.generate(
      seed=req.seed,
      max_len=req.max_len,
      temperature=req.temperature,
      repetition_penalty=req.repetition_penalty,
    )
    return {"ok": True, "data": {"text": text}}
