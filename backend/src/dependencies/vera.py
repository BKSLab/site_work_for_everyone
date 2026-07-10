from typing import Annotated

from fastapi import Depends, Request

from src.services.vera_publisher import VeraPublisher


async def get_vera_publisher(request: Request) -> VeraPublisher | None:
    """Возвращает готовый инстанс `VeraPublisher`, созданный в `lifespan`
    приложения (`main.py`). `None`, если RabbitMQ был недоступен при
    старте — эндпоинт должен в этом случае отвечать `503`, не пытаться
    подключиться заново на каждый запрос."""
    return request.app.state.vera_publisher


VeraPublisherDep = Annotated[VeraPublisher | None, Depends(get_vera_publisher)]
