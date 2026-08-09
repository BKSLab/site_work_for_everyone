import logging
from pathlib import Path
from pprint import pformat

from fastapi import FastAPI, Request, status
from fastapi.concurrency import asynccontextmanager
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession

from src.admin import create_admin
from src.api.auth import router as auth_router
from src.api.vera import router as vera_router
from src.core.config_logger import logger
from src.core.limiter import limiter
from src.core.settings import get_settings
from src.db.session import async_session_factory, engine
from src.services.vera_agent import VeraAgentClient
from src.services.vera_publisher import VeraPublisher
from src.utils.check_db import check_db_connection


async def _init_vera_publisher() -> VeraPublisher | None:
    """Подключается к RabbitMQ агента «Вера». Недоступность RabbitMQ не
    должна ронять весь backend (auth и остальные эндпоинты не зависят от
    Веры) — при ошибке возвращает `None`, эндпоинт `/api/vera/chat`
    в этом случае отвечает `503`."""
    settings = get_settings().vera
    try:
        return await VeraPublisher.connect(
            rabbitmq_url=settings.rabbitmq_url.get_secret_value(),
            queue_name=settings.rabbitmq_queue,
        )
    except Exception as error:
        logger.error("⚠️ Агент «Вера» недоступен — не удалось подключиться к RabbitMQ: %s", error)
        return None


def _init_vera_agent_client() -> VeraAgentClient | None:
    """Создаёт общий HTTP-клиент Agent Service, если задан API-ключ."""
    settings = get_settings().vera
    api_key = (
        settings.agent_api_key.get_secret_value()
        if settings.agent_api_key is not None
        else ""
    )
    if not api_key:
        logger.warning(
            "⚠️ Server API Веры недоступен — не задан VERA_AGENT_API_KEY."
        )
        return None

    return VeraAgentClient(
        api_url=settings.agent_api_url,
        api_key=api_key,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Функция управления жизненным циклом приложения."""
    logger.info("🚀 Запуск приложения...")
    async with async_session_factory() as db_session:

        # Проверка подключения к БД. При ошибки поднимает исключение RuntimeError
        await check_db_connection(db_session=db_session)

    app.state.vera_publisher = await _init_vera_publisher()
    app.state.vera_agent_client = _init_vera_agent_client()

    logger.info("✅ Приложение успешно запущено.")
    yield
    logger.info("🛑 Приложение останавливается...")
    if app.state.vera_publisher is not None:
        await app.state.vera_publisher.close()
    if app.state.vera_agent_client is not None:
        await app.state.vera_agent_client.close()

app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
create_admin(app=app, engine=engine)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Перехватывает ошибки валидации Pydantic, логирует их и возвращает
    стандартный ответ 422.
    """
    error_details = exc.errors()
    logger.warning(
        "Ошибка валидации для запроса: %s %s. Детали: %s",
        request.method,
        request.url.path,
        pformat(error_details),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": error_details},
    )


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(auth_router, prefix='/api')
app.include_router(vera_router, prefix='/api')
