import logging
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Header, HTTPException, Path, Query, Request, status
from fastapi.responses import JSONResponse

from src.core.limiter import limiter
from src.dependencies.jwt import OptionalUserPayloadDep
from src.dependencies.vera import (
    VeraAgentClientDep,
    VeraPublisherDep,
    VeraStreamTicketIssuerDep,
)
from src.exceptions.services import (
    VeraAgentServiceError,
    VeraPublisherError,
    VeraSessionTokenError,
    VeraStreamTicketServiceError,
)
from src.services.vera_session_access import (
    VeraSessionLifecycleAccess,
    resolve_vera_session_access,
    resolve_vera_session_lifecycle_access,
)
from src.schemas.vera import (
    VeraChatAcceptedResponseSchema,
    VeraChatHistoryResponseSchema,
    VeraChatRequestSchema,
    VeraChatSessionResolveRequestSchema,
    VeraChatSessionResolveResponseSchema,
    VeraCurrentChatSessionResponseSchema,
    VeraFeedbackResponseSchema,
    VeraFeedbackSchema,
    VeraMessageFeedbackResponseSchema,
    VeraMessageFeedbackSchema,
)

router = APIRouter(prefix='/vera', tags=['Vera'])
logger = logging.getLogger(__name__)


def _get_effective_anonymous_token_hash(
    boundary: str,
    access: VeraSessionLifecycleAccess,
) -> str | None:
    """Выбирает owner hash, сохранённый Agent Service для effective session."""
    if boundary == "expired":
        return access.replacement_anonymous_token_hash
    if boundary == "retained":
        return access.refreshed_anonymous_token_hash
    if access.user_id is not None:
        return None
    return access.anonymous_token_hash


def _lifecycle_error_response(
    *,
    status_code: int,
    detail: str,
    resolved_session: VeraChatSessionResolveResponseSchema,
    publish_state: str | None = None,
) -> JSONResponse:
    """Возвращает ошибку после resolve вместе с уже принятой границей.

    BFF обязан обновить owner-cookie даже когда ticket или Rabbit publish
    завершились ошибкой: lifecycle-транзакция Agent Service к этому моменту
    уже зафиксирована и не может быть откатана backend'ом сайта.
    """
    content = {
        "detail": detail,
        **resolved_session.model_dump(mode="json"),
    }
    if publish_state is not None:
        content["publish_state"] = publish_state
    return JSONResponse(
        status_code=status_code,
        content=content,
    )


def _not_published_error_response(
    *,
    status_code: int,
    detail: str,
) -> JSONResponse:
    """Помечает отказ, после которого Rabbit publish точно не начинался."""
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": detail,
            "publish_state": "not_published",
        },
    )


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
    path="/session/resolve",
    status_code=status.HTTP_200_OK,
    summary="Определить активную сессию диалога с Верой",
    description=(
        "Проверяет owner-token текущей и replacement-сессии, затем передаёт "
        "Agent Service право определить серверную границу диалога."
    ),
    operation_id="resolveVeraChatSession",
    response_description="Эффективная сессия и причина выбранной границы.",
    response_model=VeraChatSessionResolveResponseSchema,
    responses={
        401: {"description": "Подписанный токен сессии не прошёл проверку."},
        403: {"description": "Сессия принадлежит другому владельцу."},
        409: {"description": "Replacement session ID уже занят."},
        429: {"description": "Превышен лимит запросов."},
        502: {"description": "Ошибка соединения с Agent Service."},
        503: {"description": "Agent Service API не настроен."},
        504: {"description": "Agent Service не ответил вовремя."},
    },
)
@limiter.limit("60/minute")
async def resolve_vera_chat_session(
    request: Request,
    data: VeraChatSessionResolveRequestSchema,
    user_payload: OptionalUserPayloadDep,
    agent_client: VeraAgentClientDep,
    anonymous_token: Annotated[str, Header(alias="X-Vera-Session-Token")],
    refreshed_anonymous_token: Annotated[
        str,
        Header(alias="X-Vera-Refreshed-Session-Token"),
    ],
    replacement_anonymous_token: Annotated[
        str,
        Header(alias="X-Vera-Replacement-Session-Token"),
    ],
) -> VeraChatSessionResolveResponseSchema:
    """Проверяет owner-токены и получает server-side решение о сессии.

    Args:
        request: HTTP-запрос для rate limiter.
        data: Текущий и replacement идентификаторы сессий.
        user_payload: Payload проверенного JWT либо ``None``.
        agent_client: HTTP-клиент Agent Service.
        anonymous_token: Подписанный токен текущей сессии.
        refreshed_anonymous_token: Новый токен текущей сессии.
        replacement_anonymous_token: Токен replacement-сессии.

    Returns:
        Эффективную сессию и server-side TTL.
    """
    if agent_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Agent Service API не настроен.",
        )

    try:
        access = resolve_vera_session_lifecycle_access(
            session_id=data.session_id,
            replacement_session_id=data.replacement_session_id,
            user_payload=user_payload,
            anonymous_token=anonymous_token,
            refreshed_anonymous_token=refreshed_anonymous_token,
            replacement_anonymous_token=replacement_anonymous_token,
        )
        return await agent_client.resolve_chat_session(
            data,
            user_id=access.user_id,
            anonymous_token_hash=access.anonymous_token_hash,
            refreshed_anonymous_token_hash=(
                access.refreshed_anonymous_token_hash
            ),
            replacement_anonymous_token_hash=(
                access.replacement_anonymous_token_hash
            ),
        )
    except VeraSessionTokenError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error
    except VeraAgentServiceError as error:
        log_method = logger.error if error.status_code >= 500 else logger.warning
        log_method("Не удалось определить активную сессию Веры: %s", error)
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


@router.post(
    path="/chat",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=VeraChatAcceptedResponseSchema,
    summary="Отправить сообщение агенту «Вера»",
    description=(
        "Публикует вопрос пользователя в очередь `agent.requests` "
        "(vera_agent_service). Ответ приходит отдельно через SSE "
        "(`GET /vera/sse/{request_id}`, обслуживается nginx напрямую с "
        "agent_service, не этим эндпоинтом)."
    ),
    responses={
        401: {
            "description": "Подписанный токен сессии не прошёл проверку.",
        },
        403: {
            "description": "Сессия принадлежит другому владельцу.",
        },
        409: {
            "description": "Для истёкшей сессии уже создан другой successor.",
        },
        502: {
            "description": (
                "Agent Service недоступен или вернул некорректный lifecycle-ответ; "
                "публикация не начиналась."
            ),
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Ассистент временно недоступен.",
                        "publish_state": "not_published",
                    }
                }
            },
        },
        503: {
            "description": (
                "Ассистент временно недоступен. Ответ после lifecycle может "
                "дополнительно содержать session_id, previous_session_id, "
                "boundary и session_ttl_seconds."
            ),
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Ассистент временно недоступен.",
                        "publish_state": "not_published",
                    }
                }
            },
        },
        504: {
            "description": (
                "Agent Service не ответил вовремя; публикация не начиналась."
            ),
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Ассистент временно недоступен.",
                        "publish_state": "not_published",
                    }
                }
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
    agent_client: VeraAgentClientDep,
    stream_ticket_issuer: VeraStreamTicketIssuerDep,
    anonymous_token: Annotated[
        str,
        Header(alias="X-Vera-Session-Token"),
    ],
    refreshed_anonymous_token: Annotated[
        str,
        Header(alias="X-Vera-Refreshed-Session-Token"),
    ],
    replacement_anonymous_token: Annotated[
        str,
        Header(alias="X-Vera-Replacement-Session-Token"),
    ],
):
    """Публикует вопрос пользователя в очередь агента «Вера».

    `user_id` в payload очереди — `sub` из верифицированного JWT (email),
    `None` для анонимных запросов. Анонимным запросам сейчас доступна
    только консультация по базе знаний (`kb_search`) — итерация 1.
    """
    if vera_publisher is None:
        logger.warning("Публикация в очередь Веры невозможна — publisher не инициализирован.")
        return _not_published_error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ассистент временно недоступен.",
        )
    if stream_ticket_issuer is None:
        logger.error("Выпуск stream ticket невозможен — не задан VERA_AGENT_API_KEY.")
        return _not_published_error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ассистент временно недоступен.",
        )
    if agent_client is None:
        logger.error("Resolve сессии Веры невозможен — Agent Service API не настроен.")
        return _not_published_error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ассистент временно недоступен.",
        )

    try:
        access = resolve_vera_session_lifecycle_access(
            session_id=data.session_id,
            replacement_session_id=data.replacement_session_id,
            user_payload=user_payload,
            anonymous_token=anonymous_token,
            refreshed_anonymous_token=refreshed_anonymous_token,
            replacement_anonymous_token=replacement_anonymous_token,
        )
    except VeraSessionTokenError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error

    try:
        resolved_session = await agent_client.resolve_chat_session(
            VeraChatSessionResolveRequestSchema(
                session_id=data.session_id,
                replacement_session_id=data.replacement_session_id,
            ),
            user_id=access.user_id,
            anonymous_token_hash=access.anonymous_token_hash,
            refreshed_anonymous_token_hash=(
                access.refreshed_anonymous_token_hash
            ),
            replacement_anonymous_token_hash=(
                access.replacement_anonymous_token_hash
            ),
        )
    except VeraAgentServiceError as error:
        log_method = logger.error if error.status_code >= 500 else logger.warning
        log_method("Не удалось определить активную сессию Веры: %s", error)
        return _not_published_error_response(
            status_code=error.status_code,
            detail=error.detail,
        )

    effective_anonymous_token_hash = _get_effective_anonymous_token_hash(
        resolved_session.boundary,
        access,
    )
    try:
        stream_ticket = stream_ticket_issuer.issue(
            request_id=data.request_id,
            session_id=resolved_session.session_id,
            user_id=access.user_id,
            anonymous_token_hash=effective_anonymous_token_hash,
        )
    except VeraStreamTicketServiceError as error:
        logger.error("Выпуск stream ticket Веры не удался: %s", error)
        return _lifecycle_error_response(
            status_code=error.status_code,
            detail=error.detail,
            resolved_session=resolved_session,
            publish_state="not_published",
        )

    try:
        await vera_publisher.publish_agent_request(
            session_id=resolved_session.session_id,
            request_id=data.request_id,
            user_id=access.user_id,
            anonymous_token_hash=effective_anonymous_token_hash,
            message=data.message,
        )
    except VeraPublisherError as error:
        logger.error("Публикация вопроса агенту «Вера» не удалась: %s", error)
        return _lifecycle_error_response(
            status_code=error.status_code,
            detail=error.detail,
            resolved_session=resolved_session,
        )

    return VeraChatAcceptedResponseSchema(
        request_id=data.request_id,
        stream_ticket=stream_ticket,
        stream_url=f"/vera/sse/{quote(data.request_id, safe='')}",
        session_id=resolved_session.session_id,
        previous_session_id=resolved_session.previous_session_id,
        boundary=resolved_session.boundary,
        session_ttl_seconds=resolved_session.session_ttl_seconds,
    )


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
