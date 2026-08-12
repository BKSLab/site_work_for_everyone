from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

MAX_MESSAGE_LENGTH = 4000
"""Синхронизировано с лимитом agent_service (vera_agent_service/app/messaging/schemas.py)."""


class VeraChatRequestSchema(BaseModel):
    """Схема запроса на публикацию вопроса агенту «Вера»."""
    session_id: str = Field(..., min_length=1, max_length=100)
    replacement_session_id: str = Field(..., min_length=1, max_length=100)
    request_id: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=MAX_MESSAGE_LENGTH)


VeraChatSessionBoundary = Literal["created", "retained", "expired"]


class VeraChatSessionCreateRequestSchema(BaseModel):
    """Запрос явного создания диалога."""

    session_id: str = Field(..., min_length=1, max_length=100)


class VeraChatSessionCreateResponseSchema(BaseModel):
    """Созданная или идемпотентно найденная открытая сессия."""

    session_id: str = Field(..., min_length=1, max_length=100)
    session_ttl_seconds: int = Field(..., ge=1)


class VeraChatSessionCloseResponseSchema(BaseModel):
    """Результат явного закрытия диалога."""

    session_id: str = Field(..., min_length=1, max_length=100)
    closed_at: datetime


class VeraChatSessionResolveRequestSchema(BaseModel):
    """Кандидаты текущей и следующей сессии для server-side resolve."""

    session_id: str = Field(..., min_length=1, max_length=100)
    replacement_session_id: str = Field(..., min_length=1, max_length=100)


class VeraChatSessionResolveResponseSchema(BaseModel):
    """Результат определения серверной границы диалога."""

    session_id: str
    previous_session_id: str | None = None
    boundary: VeraChatSessionBoundary
    session_ttl_seconds: int = Field(..., ge=1)


class VeraChatAcceptedResponseSchema(BaseModel):
    """Квитанция публикации и данные для подключения к SSE-потоку."""

    request_id: str
    stream_ticket: str
    stream_url: str
    session_id: str
    previous_session_id: str | None = None
    boundary: VeraChatSessionBoundary
    session_ttl_seconds: int = Field(..., ge=1)


class VeraChatHistoryTurnResponseSchema(BaseModel):
    """Одна восстановленная реплика диалога."""

    request_id: str
    sequence_number: int
    question: str
    answer: str | None = None
    status: str
    feedback_value: Literal["up", "down"] | None = None
    used_knowledge_base: bool = False
    """Ответ построен на данных базы знаний.

    Схема зеркалит контракт Agent Service и заново сериализует ответ, поэтому
    отсутствующее здесь поле молча пропадёт по дороге к фронтенду. По этому
    признаку клиент показывает под ответом кнопку «Объяснить проще».
    """

    created_at: datetime
    completed_at: datetime | None = None


class VeraChatHistoryResponseSchema(BaseModel):
    """История сессии, полученная из Agent Service."""

    session_id: str
    turns: list[VeraChatHistoryTurnResponseSchema]
    next_before_sequence: int | None = None


class VeraCurrentChatSessionResponseSchema(BaseModel):
    """Текущая сессия авторизованного пользователя."""

    session_id: str | None = None


VeraFeedbackAudience = Literal[
    "seeker",
    "employer",
    "other",
]
VeraMessageFeedbackValue = Literal["up", "down"]


class VeraMessageFeedbackSchema(BaseModel):
    """Оценка одного завершённого ответа Веры."""

    session_id: str = Field(..., min_length=1, max_length=100)
    request_id: str = Field(..., min_length=1, max_length=100)
    value: VeraMessageFeedbackValue


class VeraFeedbackSchema(BaseModel):
    """Развёрнутый отзыв о сессии с ассистентом «Вера»."""

    session_id: str = Field(..., min_length=1, max_length=100)
    submission_id: str = Field(..., min_length=1, max_length=100)
    audience: VeraFeedbackAudience | None = None
    usefulness: int | None = Field(None, ge=1, le=5)
    trust: int | None = Field(None, ge=1, le=5)
    comment: str | None = Field(None, max_length=4000)
    contact_email: EmailStr | None = None


class VeraMessageFeedbackResponseSchema(VeraMessageFeedbackSchema):
    """Ответ Agent Service после создания или изменения оценки."""

    id: str
    review_status: str
    created_at: datetime
    updated_at: datetime


class VeraFeedbackResponseSchema(BaseModel):
    """Ответ Agent Service после сохранения развёрнутого отзыва."""

    id: str
    session_id: str
    submission_id: str
    review_status: str
    created_at: datetime
