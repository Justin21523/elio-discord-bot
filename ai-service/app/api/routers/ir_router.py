from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict
from app.services import ir

router = APIRouter(prefix="/ir", tags=["IR"])


class DocItem(BaseModel):
    id: str
    text: str | None = None
    passage: str | None = None


class ClueRequest(BaseModel):
    docs: List[DocItem]
    query: str


class DocRequest(BaseModel):
    docs: List[DocItem]
    query: str


@router.post("/clue")
async def clue_search(req: ClueRequest):
    if not req.docs or not req.query:
        raise HTTPException(status_code=400, detail="docs and query required")
    result = ir.clue_search([d.model_dump() for d in req.docs], req.query, top_k=1)
    return {"ok": True, "data": result}


@router.post("/doc")
async def doc_search(req: DocRequest):
    if not req.docs or not req.query:
        raise HTTPException(status_code=400, detail="docs and query required")
    result = ir.doc_search([d.model_dump() for d in req.docs], req.query, top_k=3)
    return {"ok": True, "data": result}
