from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

from ...services.persona_logic import persona_logic_reply

router = APIRouter(prefix="/persona/logic", tags=["persona-logic"])


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PersonaLogicRequest(BaseModel):
    persona: str = Field(..., description="Persona name")
    message: str = Field(..., description="User message content")
    history: Optional[List[HistoryItem]] = Field(default_factory=list, description="Recent turns for continuity")
    top_k: int = Field(default=5, ge=1, le=10)
    max_len: int = Field(default=60, ge=20, le=120)


@router.post("/reply")
async def logic_reply(req: PersonaLogicRequest):
    result = persona_logic_reply(
        persona=req.persona,
        message=req.message,
        history=req.history or [],
        top_k=req.top_k,
        max_len=req.max_len,
    )
    return {"ok": True, "data": result}
