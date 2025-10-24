"""
Persona Router - Generate persona-styled responses
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.models.manager import ModelManager
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager

logger = setup_logger(__name__)
router = APIRouter()


class PersonaComposeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="User input text")
    persona: dict = Field(..., description="Persona data with name, style, traits")
    max_length: int = Field(180, ge=50, le=500, description="Max response length")
    use_finetuned: bool = Field(True, description="Use fine-tuned character model (default: True)")


class PersonaComposeResponse(BaseModel):
    ok: bool = True
    text: str
    persona_name: str


@router.post("/compose", response_model=PersonaComposeResponse)
async def persona_compose(
    request: PersonaComposeRequest,
    model_manager: ModelManager = Depends(get_model_manager)
):
    """Generate a persona-styled response to user input"""
    try:
        persona_name = request.persona.get("name", "Character")

        # PRIORITY 1: Use rich system_prompt if available (from MongoDB)
        system_prompt = request.persona.get("system_prompt", "")

        if system_prompt:
            # Use the full, rich system prompt from persona database
            # IMPORTANT: Add explicit first-person instruction to prevent third-person responses
            persona_description = system_prompt + f"\n\nIMPORTANT: Always speak in first person (I, me, my), NEVER refer to yourself in third person (he, she, {persona_name})."
            logger.info(f"[PERSONA] Using full system_prompt ({len(system_prompt)} chars) with first-person enforcement")
        else:
            # Fallback: Build basic prompt from traits/likes/dislikes
            traits = request.persona.get("traits", {})
            likes = request.persona.get("likes", [])
            dislikes = request.persona.get("dislikes", [])

            persona_description = f"You are {persona_name}"

            if traits:
                trait_desc = []
                humor = traits.get("humor", 0.5)
                warmth = traits.get("warmth", 0.5)
                discipline = traits.get("discipline", 0.5)

                if humor > 0.7:
                    trait_desc.append("playful and funny")
                elif humor < 0.3:
                    trait_desc.append("serious")

                if warmth > 0.7:
                    trait_desc.append("warm and caring")
                elif warmth < 0.3:
                    trait_desc.append("reserved")

                if discipline > 0.7:
                    trait_desc.append("disciplined and organized")
                elif discipline < 0.3:
                    trait_desc.append("relaxed and spontaneous")

                if trait_desc:
                    persona_description += f", a {', '.join(trait_desc)} character"

            if likes:
                persona_description += f". You love: {', '.join(likes[:3])}"

            if dislikes:
                persona_description += f". You dislike: {', '.join(dislikes[:2])}"

            persona_description += f". Respond naturally in character to the user's message in 1-3 sentences (max {request.max_length} chars)."
            persona_description += f"\n\nIMPORTANT: Always speak in first person (I, me, my), NEVER refer to yourself in third person (he, she, {persona_name})."

        logger.info(f"[PERSONA] Composing response as {persona_name}")

        # Generate response using fine-tuned model for better character accuracy
        llm = await model_manager.get_llm()

        result = await llm.generate(
            system=persona_description,
            prompt=request.text,
            max_tokens=request.max_length // 2,  # Rough token estimate
            temperature=0.8,
            use_finetuned=request.use_finetuned,  # Use fine-tuned character model
        )

        response_text = result.get("text", "").strip()

        if not response_text:
            response_text = f"*{persona_name} looks thoughtful but doesn't say anything*"

        logger.info(f"[PERSONA] Generated {len(response_text)} chars")

        return {
            "ok": True,
            "text": response_text,
            "persona_name": persona_name
        }

    except Exception as e:
        logger.error(f"[ERR] Persona compose failed: {e}", exc_info=True)
        raise HTTPException(
            500,
            {
                "ok": False,
                "error": {
                    "code": "AI_MODEL_ERROR",
                    "message": f"Persona compose failed: {str(e)}"
                }
            }
        )
