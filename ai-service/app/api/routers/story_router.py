"""
Story Router - Story generation, continuation, character dialogue
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.manager import ModelManager
from app.utils.logger import setup_logger
from app.dependencies import get_model_manager

logger = setup_logger(__name__)
router = APIRouter()


# Request/Response models
class StoryGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Story prompt or theme")
    genre: Optional[str] = Field(None, description="Story genre")
    length: str = Field("medium", description="short, medium, long")
    style: Optional[str] = Field(None, description="Writing style")
    characters: Optional[List[str]] = Field(
        None, description="Character names to include"
    )
    setting: Optional[str] = Field(None, description="Story setting")


class StoryContinueRequest(BaseModel):
    existing_story: str = Field(..., description="Story text so far")
    direction: Optional[str] = Field(None, description="Direction to take the story")
    length: int = Field(500, ge=100, le=2000, description="Words to generate")


class DialogueGenerateRequest(BaseModel):
    characters: List[str] = Field(
        ..., description="Characters in dialogue", min_items=2  # type: ignore
    )
    context: str = Field(..., description="Dialogue context/scenario")
    tone: Optional[str] = Field(None, description="Dialogue tone")
    turns: int = Field(5, ge=2, le=20, description="Number of dialogue exchanges")


class CharacterDevelopRequest(BaseModel):
    character_name: str
    traits: Optional[List[str]] = Field(None, description="Character traits")
    background: Optional[str] = Field(None, description="Character background")
    development_aspect: str = Field(
        "personality", description="personality, backstory, motivations, arc"
    )


class StoryAnalysisRequest(BaseModel):
    story_text: str = Field(..., description="Story to analyze")
    analysis_type: str = Field(
        "structure", description="structure, themes, characters, pacing"
    )


class StoryResponse(BaseModel):
    ok: bool = True
    data: dict


# Endpoints
@router.post("/generate", response_model=StoryResponse)
async def generate_story(
    request: StoryGenerateRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Generate a complete story from prompt
    """
    try:
        logger.info(
            f"[STORY] Generating {request.length} story: {request.prompt[:50]}..."
        )

        llm = await manager.get_llm()

        # Build story generation prompt
        length_tokens = {"short": 500, "medium": 1500, "long": 3000}.get(
            request.length, 1500
        )

        genre_info = f"Genre: {request.genre}" if request.genre else ""
        style_info = f"Writing style: {request.style}" if request.style else ""
        chars_info = (
            f"Characters: {', '.join(request.characters)}" if request.characters else ""
        )
        setting_info = f"Setting: {request.setting}" if request.setting else ""

        system_prompt = f"""You are a creative story writer.
{genre_info}
{style_info}
{chars_info}
{setting_info}

Write an engaging story with:
- Clear narrative structure (beginning, middle, end)
- Vivid descriptions
- Character development
- Engaging dialogue
- Proper pacing"""

        result = await llm.generate(
            system=system_prompt,
            prompt=f"Story prompt: {request.prompt}\n\nStory:",
            max_tokens=length_tokens,
            temperature=0.8,
        )

        story = result.get("text", "").strip()

        # Analyze story (simple metrics)
        word_count = len(story.split())
        paragraph_count = len([p for p in story.split("\n\n") if p.strip()])

        logger.info(
            f"[STORY] Generated story: {word_count} words, {paragraph_count} paragraphs"
        )

        return {
            "ok": True,
            "data": {
                "story": story,
                "prompt": request.prompt,
                "word_count": word_count,
                "paragraph_count": paragraph_count,
                "genre": request.genre,
                "tokens": result.get("usage", {}),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Story generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


@router.post("/continue", response_model=StoryResponse)
async def continue_story(
    request: StoryContinueRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Continue an existing story
    """
    try:
        logger.info(f"[STORY] Continuing story ({len(request.existing_story)} chars)")

        llm = await manager.get_llm()

        direction_info = (
            f"\n\nContinue the story in this direction: {request.direction}"
            if request.direction
            else ""
        )

        system_prompt = f"""You are a story continuation assistant.
Maintain:
- Consistent tone and style
- Character continuity
- Narrative coherence
- Proper pacing"""

        prompt = f"""Existing story:
{request.existing_story}
{direction_info}

Continue the story (approximately {request.length} words):"""

        result = await llm.generate(
            system=system_prompt,
            prompt=prompt,
            max_tokens=request.length * 2,  # Approximate token-to-word ratio
            temperature=0.8,
        )

        continuation = result.get("text", "").strip()

        logger.info(
            f"[STORY] Generated continuation: {len(continuation.split())} words"
        )

        return {
            "ok": True,
            "data": {
                "continuation": continuation,
                "full_story": request.existing_story + "\n\n" + continuation,
                "continuation_word_count": len(continuation.split()),
                "tokens": result.get("usage", {}),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Story continuation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


@router.post("/dialogue", response_model=StoryResponse)
async def generate_dialogue(
    request: DialogueGenerateRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Generate character dialogue
    """
    try:
        logger.info(f"[STORY] Generating dialogue: {request.characters}")

        llm = await manager.get_llm()

        tone_info = f"Tone: {request.tone}" if request.tone else ""

        system_prompt = f"""You are a dialogue writer.
Characters: {', '.join(request.characters)}
{tone_info}

Write natural, character-appropriate dialogue with:
- Distinct character voices
- Natural flow and pacing
- Subtext and emotion
- Proper formatting

Format as:
CHARACTER_NAME: "Dialogue"
CHARACTER_NAME: "Dialogue" """

        prompt = f"""Context: {request.context}

Generate {request.turns} exchanges of dialogue between {' and '.join(request.characters)}:"""

        result = await llm.generate(
            system=system_prompt,
            prompt=prompt,
            max_tokens=request.turns * 150,
            temperature=0.8,
        )

        dialogue = result.get("text", "").strip()

        # Parse dialogue lines
        lines = [line.strip() for line in dialogue.split("\n") if ":" in line]

        logger.info(f"[STORY] Generated {len(lines)} dialogue lines")

        return {
            "ok": True,
            "data": {
                "dialogue": dialogue,
                "lines": lines,
                "characters": request.characters,
                "total_lines": len(lines),
                "tokens": result.get("usage", {}),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Dialogue generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


@router.post("/character-develop", response_model=StoryResponse)
async def develop_character(
    request: CharacterDevelopRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Develop character profile and details
    """
    try:
        logger.info(
            f"[STORY] Developing character: {request.character_name} ({request.development_aspect})"
        )

        llm = await manager.get_llm()

        traits_info = (
            f"Known traits: {', '.join(request.traits)}" if request.traits else ""
        )
        background_info = (
            f"Background: {request.background}" if request.background else ""
        )

        system_prompt = f"""You are a character development specialist.
Character: {request.character_name}
{traits_info}
{background_info}

Develop detailed {request.development_aspect} that is:
- Psychologically consistent
- Narratively compelling
- Unique and memorable
- Suitable for storytelling"""

        prompt = (
            f"Develop the {request.development_aspect} for {request.character_name}:"
        )

        result = await llm.generate(
            system=system_prompt, prompt=prompt, max_tokens=1024, temperature=0.7
        )

        development = result.get("text", "").strip()

        logger.info(
            f"[STORY] Developed {request.development_aspect} for {request.character_name}"
        )

        return {
            "ok": True,
            "data": {
                "character_name": request.character_name,
                "aspect": request.development_aspect,
                "development": development,
                "tokens": result.get("usage", {}),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Character development failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )


@router.post("/analyze", response_model=StoryResponse)
async def analyze_story(
    request: StoryAnalysisRequest, manager: ModelManager = Depends(get_model_manager)
):
    """
    Analyze story structure, themes, etc.
    """
    try:
        logger.info(f"[STORY] Analyzing story ({request.analysis_type})")

        llm = await manager.get_llm()

        analysis_prompts = {
            "structure": "Analyze the narrative structure: exposition, rising action, climax, falling action, resolution.",
            "themes": "Identify and analyze the main themes and motifs in the story.",
            "characters": "Analyze character development, arcs, and relationships.",
            "pacing": "Analyze the pacing: slow/fast sections, tension building, scene transitions.",
        }

        system_prompt = f"""You are a literary analyst.
Focus on {request.analysis_type}.
Provide specific examples and insights."""

        prompt = f"""Story:
{request.story_text}

{analysis_prompts.get(request.analysis_type, 'Analyze this story')}"""

        result = await llm.generate(
            system=system_prompt, prompt=prompt, max_tokens=1024, temperature=0.5
        )

        analysis = result.get("text", "").strip()

        logger.info(f"[STORY] Completed {request.analysis_type} analysis")

        return {
            "ok": True,
            "data": {
                "analysis_type": request.analysis_type,
                "analysis": analysis,
                "story_length": len(request.story_text),
                "tokens": result.get("usage", {}),
            },
        }

    except Exception as e:
        logger.error(f"[ERR] Story analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "AI_MODEL_ERROR", "message": str(e)},
            },
        )
