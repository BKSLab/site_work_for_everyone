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
from src.services.vera_publisher import VeraPublisherManager
from src.utils.check_db import check_db_connection


async def _init_vera_publisher_manager() -> VeraPublisherManager:
    """Запускает управляемое подключение к RabbitMQ агента «Вера»."""
    settings = get_settings().vera
    manager = VeraPublisherManager(
        rabbitmq_url=settings.rabbitmq_url.get_secret_value(),
        queue_name=settings.rabbitmq_queue,
    )
    await manager.start()
    return manager


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

    app.state.vera_publisher_manager = await _init_vera_publisher_manager()
    app.state.vera_agent_client = _init_vera_agent_client()

    logger.info("✅ Приложение успешно запущено.")
    yield
    logger.info("🛑 Приложение останавливается...")
    await app.state.vera_publisher_manager.close()
    if app.state.vera_agent_client is not None:
        await app.state.vera_agent_client.close()

app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
create_admin(app=app, engine=engine)


@app.get(
    "/health",
    summary="Проверить состояние backend",
    description="Возвращает состояние приложения и publisher агента «Вера».",
    operation_id="getHealth",
    response_description="Текущее состояние backend и RabbitMQ publisher.",
)
async def get_health(request: Request) -> dict[str, str]:
    """Возвращает readiness необязательной интеграции с RabbitMQ."""
    publisher_ready = request.app.state.vera_publisher_manager.is_ready
    return {
        "status": "ok" if publisher_ready else "degraded",
        "vera_publisher": "ready" if publisher_ready else "unavailable",
    }


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
