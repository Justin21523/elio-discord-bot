"""
Story Manager - Interactive storytelling with context management
"""

import os
import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.models.llm import llm_service
from app.config import settings
from app.utils.logger import log_info, log_error


class StorySession:
    """Represents an interactive story session"""

    def __init__(self, session_id: str, user_id: str, persona: str, scenario: str):
        self.session_id = session_id
        self.user_id = user_id
        self.persona = persona
        self.scenario = scenario
        self.history: List[Dict[str, Any]] = []
        self.metadata: Dict[str, Any] = {}
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.save_counter = 0

    def add_interaction(
        self, user_input: str, bot_response: str, action: Optional[str] = None
    ):
        """Add an interaction to the story"""
        self.history.append(
            {
                "timestamp": datetime.utcnow().isoformat(),
                "user": user_input,
                "bot": bot_response,
                "action": action,
            }
        )
        self.updated_at = datetime.utcnow()
        self.save_counter += 1

    def get_context(self, window: int = 10) -> List[Dict[str, Any]]:
        """Get recent conversation context"""
        return self.history[-window:] if len(self.history) > window else self.history

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "persona": self.persona,
            "scenario": self.scenario,
            "history": self.history,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StorySession":
        """Create from dictionary"""
        session = cls(
            session_id=data["session_id"],
            user_id=data["user_id"],
            persona=data["persona"],
            scenario=data["scenario"],
        )
        session.history = data.get("history", [])
        session.metadata = data.get("metadata", {})
        session.created_at = datetime.fromisoformat(data["created_at"])
        session.updated_at = datetime.fromisoformat(data["updated_at"])
        return session


class StoryManager:
    """
    Manages interactive story sessions
    Handles persona interactions, plot development, and context
    """

    def __init__(self):
        self.sessions: Dict[str, StorySession] = {}
        self.storage_path = settings.STORY_DB_PATH

    async def initialize(self):
        """Initialize story manager"""
        log_info("Initializing story manager")

        # Create storage directory
        os.makedirs(self.storage_path, exist_ok=True)

        # Load existing sessions
        await self._load_sessions()

        log_info("Story manager initialized", sessions=len(self.sessions))

    async def create_session(self, user_id: str, persona: str, scenario: str) -> str:
        """Create a new story session"""

        session_id = str(uuid.uuid4())

        session = StorySession(
            session_id=session_id, user_id=user_id, persona=persona, scenario=scenario
        )

        self.sessions[session_id] = session

        # Save session
        await self._save_session(session)

        log_info("Story session created", session_id=session_id, persona=persona)

        return session_id

    async def continue_story(
        self, session_id: str, user_input: str, action: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Continue an interactive story

        Args:
            session_id: Story session ID
            user_input: User's input/dialogue
            action: Optional action (e.g., "hug", "give_item")

        Returns:
            Bot response and updated context
        """

        if session_id not in self.sessions:
            return {"success": False, "error": "Session not found"}

        session = self.sessions[session_id]

        log_info(
            "Continuing story",
            session_id=session_id,
            user_input=user_input[:50],
            action=action,
        )

        try:
            # Build story prompt
            prompt = self._build_story_prompt(
                session=session, user_input=user_input, action=action
            )

            # Generate response
            result = await llm_service.generate(
                prompt=prompt,
                system=self._get_story_system_prompt(session),
                temperature=0.8,  # Higher for creative storytelling
                max_tokens=512,
            )

            bot_response = result.get("text", "")

            # Add to history
            session.add_interaction(user_input, bot_response, action)

            # Auto-save periodically
            if session.save_counter >= settings.STORY_SAVE_INTERVAL:
                await self._save_session(session)
                session.save_counter = 0

            log_info("Story continued", session_id=session_id)

            return {
                "success": True,
                "response": bot_response,
                "session_id": session_id,
                "interaction_count": len(session.history),
            }

        except Exception as e:
            log_error("Story continuation failed", session_id=session_id, error=str(e))
            return {"success": False, "error": str(e)}

    def _build_story_prompt(
        self, session: StorySession, user_input: str, action: Optional[str]
    ) -> str:
        """Build prompt for story continuation"""

        prompt_parts = [f"Scenario: {session.scenario}", "", "Recent conversation:"]

        # Add recent context
        context = session.get_context(settings.STORY_CONTEXT_WINDOW)
        for turn in context:
            prompt_parts.append(f"User: {turn['user']}")
            prompt_parts.append(f"{session.persona}: {turn['bot']}")
            if turn.get("action"):
                prompt_parts.append(f"[Action: {turn['action']}]")

        prompt_parts.append("")
        prompt_parts.append(f"User: {user_input}")

        if action:
            prompt_parts.append(f"[User performs action: {action}]")

        prompt_parts.append(f"{session.persona}:")

        return "\n".join(prompt_parts)

    def _get_story_system_prompt(self, session: StorySession) -> str:
        """Get system prompt for story generation"""
        return f"""You are {session.persona}, engaging in an interactive story.

Rules:
1. Stay in character at all times
2. Respond naturally to user inputs and actions
3. Advance the plot gradually
4. Create engaging, emotional moments
5. Remember previous interactions
6. Keep responses concise (2-4 sentences)
7. React appropriately to user actions

Scenario context: {session.scenario}"""

    async def get_session(self, session_id: str) -> Optional[StorySession]:
        """Get a story session"""
        return self.sessions.get(session_id)

    async def list_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """List all sessions for a user"""
        user_sessions = [
            {
                "session_id": s.session_id,
                "persona": s.persona,
                "scenario": s.scenario,
                "interaction_count": len(s.history),
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
            }
            for s in self.sessions.values()
            if s.user_id == user_id
        ]

        return sorted(user_sessions, key=lambda x: x["updated_at"], reverse=True)

    async def delete_session(self, session_id: str) -> bool:
        """Delete a story session"""
        if session_id not in self.sessions:
            return False

        del self.sessions[session_id]

        # Delete file
        file_path = os.path.join(self.storage_path, f"{session_id}.json")
        if os.path.exists(file_path):
            os.remove(file_path)

        log_info("Story session deleted", session_id=session_id)
        return True

    async def _save_session(self, session: StorySession):
        """Save session to disk"""
        try:
            file_path = os.path.join(self.storage_path, f"{session.session_id}.json")

            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(session.to_dict(), f, ensure_ascii=False, indent=2)

        except Exception as e:
            log_error(
                "Failed to save session", session_id=session.session_id, error=str(e)
            )

    async def _load_sessions(self):
        """Load all sessions from disk"""
        try:
            if not os.path.exists(self.storage_path):
                return

            for filename in os.listdir(self.storage_path):
                if not filename.endswith(".json"):
                    continue

                file_path = os.path.join(self.storage_path, filename)

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    session = StorySession.from_dict(data)
                    self.sessions[session.session_id] = session

                except Exception as e:
                    log_error("Failed to load session", file=filename, error=str(e))

            log_info("Sessions loaded", count=len(self.sessions))

        except Exception as e:
            log_error("Failed to load sessions", error=str(e))

    async def close(self):
        """Close story manager and save all sessions"""
        log_info("Closing story manager")

        for session in self.sessions.values():
            await self._save_session(session)

        log_info("Story manager closed")


# Global story manager
story_manager = StoryManager()
