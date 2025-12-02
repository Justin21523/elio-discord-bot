from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services import recs
from app.services import recs_cf

router = APIRouter(prefix="/recs", tags=["Recs"])


class RecsRequest(BaseModel):
  user_id: str
  guild_id: Optional[str] = None
  top_k: int = 3


@router.post("/games")
async def recommend_games(req: RecsRequest):
  if not req.user_id:
    raise HTTPException(status_code=400, detail="user_id required")
  cf = recs_cf.recommend_games_cf(req.user_id, req.guild_id, req.top_k)
  if cf:
    return {"ok": True, "data": {"recommendations": cf, "strategy": "cf"}}
  result = recs.recommend_games(req.user_id, req.guild_id, req.top_k)
  return {"ok": True, "data": {"recommendations": result, "strategy": "popularity"}}
