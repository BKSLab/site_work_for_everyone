import logging

from fastapi import APIRouter, HTTPException, Request, status

from src.core.limiter import limiter
from src.dependencies.jwt import OptionalUserPayloadDep
from src.dependencies.vera import VeraPublisherDep
from src.exceptions.services import VeraPublisherError
from src.schemas.vera import VeraChatRequestSchema

router = APIRouter(prefix='/vera', tags=['Vera'])
logger = logging.getLogger(__name__)


@router.post(
    path="/chat",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Отправить сообщение агенту «Вера»",
    description=(
        "Публикует вопрос пользователя в очередь `agent.requests` "
        "(vera_agent_service). Ответ приходит отдельно через SSE "
        "(`GET /vera/sse/{session_id}`, обслуживается nginx напрямую с "
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

    user_id = user_payload.get("sub") if user_payload else None

    try:
        await vera_publisher.publish_agent_request(
            session_id=data.session_id,
            user_id=user_id,
            message=data.message,
        )
    except VeraPublisherError as error:
        logger.error("Публикация вопроса агенту «Вера» не удалась: %s", error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)

    return {"status": "queued"}
