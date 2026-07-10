from pydantic import BaseModel, Field

MAX_MESSAGE_LENGTH = 4000
"""Синхронизировано с лимитом agent_service (vera_agent_service/app/messaging/schemas.py)."""


class VeraChatRequestSchema(BaseModel):
    """Схема запроса на публикацию вопроса агенту «Вера»."""
    session_id: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=MAX_MESSAGE_LENGTH)
