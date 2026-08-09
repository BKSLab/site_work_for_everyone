import logging
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Path, Query, Request, status

from src.core.limiter import limiter
from src.dependencies.jwt import OptionalUserPayloadDep
from src.dependencies.vera import VeraAgentClientDep, VeraPublisherDep
from src.exceptions.services import (
    VeraAgentServiceError,
    VeraPublisherError,
    VeraSessionTokenError,
)
from src.services.vera_session_access import resolve_vera_session_access
from src.schemas.vera import (
    VeraChatHistoryResponseSchema,
    VeraChatRequestSchema,
    VeraCurrentChatSessionResponseSchema,
    VeraFeedbackResponseSchema,
    VeraFeedbackSchema,
    VeraMessageFeedbackResponseSchema,
    VeraMessageFeedbackSchema,
)

router = APIRouter(prefix='/vera', tags=['Vera'])
logger = logging.getLogger(__name__)


@router.get(
    path="/session/current",
    status_code=status.HTTP_200_OK,
    summary="Получить текущую сессию диалога с Верой",
    description=(
        "Для авторизованного пользователя возвращает последнюю активную "
        "сессию. Для анонимного пользователя возвращает session_id=null."
    ),
    response_model=VeraCurrentChatSessionResponseSchema,
    responses={
        429: {"description": "Превышен лимит запросов."},
        502: {"description": "Ошибка соединения с Agent Service."},
        503: {"description": "Agent Service API не настроен."},
        504: {"description": "Agent Service не ответил вовремя."},
    },
)
@limiter.limit("60/minute")
async def get_current_vera_chat_session(
    request: Request,
    user_payload: OptionalUserPayloadDep,
    agent_client: VeraAgentClientDep,
):
    """Определяет сессию на сервере, не доверяя идентификатору клиента."""
    user_id = user_payload.get("sub") if user_payload else None
    if user_id is None:
        return VeraCurrentChatSessionResponseSchema(session_id=None)
    if agent_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent Service API не настроен.",
        )

    try:
        return await agent_client.get_current_chat_session(user_id=user_id)
    except VeraAgentServiceError as error:
        log_method = logger.error if error.status_code >= 500 else logger.warning
        log_method(
            "Не удалось получить текущую сессию Веры: %s",
            error,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


@router.post(
    path="/chat",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Отправить сообщение агенту «Вера»",
    description=(
        "Публикует вопрос пользователя в очередь `agent.requests` "
        "(vera_agent_service). Ответ приходит отдельно через SSE "
        "(`GET /vera/sse/{request_id}`, обслуживается nginx напрямую с "
        "agent_service, не этим эндпоинтом)."
    ),
    responses={
        503: {
            "description": "Ассистент временно недоступен (RabbitMQ недоступен).",
            "content": {
                "application/json": {"example": {"detail": "Ассистент временно недоступен."}}
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {"application/json": {"example": {"detail": "Too Many Requests"}}},
        },
    },
)
@limiter.limit("20/minute")
async def send_message(
    request: Request,
    data: VeraChatRequestSchema,
    user_payload: OptionalUserPayloadDep,
    vera_publisher: VeraPublisherDep,
    anonymous_token: Annotated[
        str | None,
        Header(alias="X-Vera-Session-Token"),
    ] = None,
):
    """Публикует вопрос пользователя в очередь агента «Вера».

    `user_id` в payload очереди — `sub` из верифицированного JWT (email),
    `None` для анонимных запросов. Анонимным запросам сейчас доступна
    только консультация по базе знаний (`kb_search`) — итерация 1.
    """
    if vera_publisher is None:
        logger.warning("Публикация в очередь Веры невозможна — publisher не инициализирован.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ассистент временно недоступен.",
        )

    try:
        access = resolve_vera_session_access(
            session_id=data.session_id,
            user_payload=user_payload,
            anonymous_token=anonymous_token,
        )
    except VeraSessionTokenError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error

    try:
        await vera_publisher.publish_agent_request(
            session_id=data.session_id,
            request_id=data.request_id,
            user_id=access.user_id,
            anonymous_token_hash=access.anonymous_token_hash,
            message=data.message,
        )
    except VeraPublisherError as error:
        logger.error("Публикация вопроса агенту «Вера» не удалась: %s", error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)

    return {"status": "queued"}


@router.get(
    path="/history/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Получить историю диалога с Верой",
    description=(
        "Возвращает сохранённую пользовательскую историю сессии "
        "из Agent Service."
    ),
    response_model=VeraChatHistoryResponseSchema,
    responses={
        403: {"description": "Сессия принадлежит другому владельцу."},
        404: {"description": "Сессия не найдена."},
        429: {"description": "Превышен лимит запросов."},
        502: {"description": "Ошибка соединения с Agent Service."},
        503: {"description": "Agent Service API не настроен."},
        504: {"description": "Agent Service не ответил вовремя."},
    },
)
@limiter.limit("60/minute")
async def get_vera_chat_history(
    request: Request,
    session_id: Annotated[str, Path(min_length=1, max_length=100)],
    user_payload: OptionalUserPayloadDep,
    agent_client: VeraAgentClientDep,
    anonymous_token: Annotated[
        str | None,
        Header(alias="X-Vera-Session-Token"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    before_sequence: Annotated[int | None, Query(ge=1)] = None,
):
    """Получает историю сессии через серверный API Agent Service."""
    if agent_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent Service API не настроен.",
        )

    try:
        access = resolve_vera_session_access(
            session_id=session_id,
            user_payload=user_payload,
            anonymous_token=anonymous_token,
        )
        return await agent_client.get_chat_history(
            session_id,
            user_id=access.user_id,
            anonymous_token_hash=access.anonymous_token_hash,
            limit=limit,
            before_sequence=before_sequence,
        )
    except VeraSessionTokenError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error
    except VeraAgentServiceError as error:
        log_method = logger.error if error.status_code >= 500 else logger.warning
        log_method(
            "Не удалось получить историю диалога Веры: %s",
            error,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        )


@router.put(
    path="/feedback/message",
    status_code=status.HTTP_200_OK,
    summary="Оценить ответ Веры",
    description=(
        "Создаёт или изменяет оценку уже завершённого ответа через "
        "Feedback API Agent Service."
    ),
    response_model=VeraMessageFeedbackResponseSchema,
    responses={
        404: {"description": "Сессия или ответ не найдены."},
        409: {"description": "Ответ относится к другой сессии или не завершён."},
        429: {"description": "Превышен лимит запросов."},
        502: {"description": "Ошибка соединения с Agent Service."},
        503: {"description": "Feedback API не настроен."},
        504: {"description": "Agent Service не ответил вовремя."},
    },
)
@limiter.limit("60/minute")
async def set_vera_message_feedback(
    request: Request,
    data: VeraMessageFeedbackSchema,
    user_payload: OptionalUserPayloadDep,
    agent_client: VeraAgentClientDep,
    anonymous_token: Annotated[
        str | None,
        Header(alias="X-Vera-Session-Token"),
    ] = None,
):
    """Передаёт оценку конкретного ответа в Agent Service."""
    if agent_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис обратной связи не настроен.",
        )

    try:
        access = resolve_vera_session_access(
            session_id=data.session_id,
            user_payload=user_payload,
            anonymous_token=anonymous_token,
        )
        return await agent_client.set_message_feedback(
            data,
            user_id=access.user_id,
            anonymous_token_hash=access.anonymous_token_hash,
        )
    except VeraSessionTokenError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error
    except VeraAgentServiceError as error:
        log_method = logger.error if error.status_code >= 500 else logger.warning
        log_method(
            "Не удалось сохранить оценку ответа Веры: %s",
            error,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        )


@router.post(
    path="/feedback/session",
    status_code=status.HTTP_201_CREATED,
    summary="Сохранить развёрнутый отзыв о сессии с Верой",
    description=(
        "Сохраняет анкету по существующей сессии через Feedback API "
        "Agent Service. SMTP для этого потока не используется."
    ),
    response_model=VeraFeedbackResponseSchema,
    responses={
        404: {"description": "Сессия не найдена."},
        409: {"description": "submission_id относится к другой сессии."},
        429: {"description": "Превышен лимит запросов."},
        502: {"description": "Ошибка соединения с Agent Service."},
        503: {"description": "Feedback API не настроен."},
        504: {"description": "Agent Service не ответил вовремя."},
    },
)
@limiter.limit("10/minute")
async def create_vera_session_feedback(
    request: Request,
    data: VeraFeedbackSchema,
    user_payload: OptionalUserPayloadDep,
    agent_client: VeraAgentClientDep,
    anonymous_token: Annotated[
        str | None,
        Header(alias="X-Vera-Session-Token"),
    ] = None,
):
    """Передаёт развёрнутую анкету в Agent Service."""
    if agent_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис обратной связи не настроен.",
        )

    try:
        access = resolve_vera_session_access(
            session_id=data.session_id,
            user_payload=user_payload,
            anonymous_token=anonymous_token,
        )
        return await agent_client.create_session_feedback(
            data,
            user_id=access.user_id,
            anonymous_token_hash=access.anonymous_token_hash,
        )
    except VeraSessionTokenError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error
    except VeraAgentServiceError as error:
        log_method = logger.error if error.status_code >= 500 else logger.warning
        log_method(
            "Не удалось сохранить отзыв о сессии Веры: %s",
            error,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        )
