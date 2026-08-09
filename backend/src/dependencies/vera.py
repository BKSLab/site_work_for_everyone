from typing import Annotated

from fastapi import Depends, Request

from src.services.vera_agent import VeraAgentClient
from src.services.vera_publisher import VeraPublisher


async def get_vera_publisher(request: Request) -> VeraPublisher | None:
    """Возвращает publisher из lifespan-managed менеджера подключения."""
    manager = request.app.state.vera_publisher_manager
    await manager.ensure_reconnecting()
    return manager.publisher if manager.is_ready else None


async def get_vera_agent_client(
    request: Request,
) -> VeraAgentClient | None:
    """Возвращает HTTP-клиент Agent Service из lifespan приложения."""
    return request.app.state.vera_agent_client


VeraPublisherDep = Annotated[VeraPublisher | None, Depends(get_vera_publisher)]
VeraAgentClientDep = Annotated[
    VeraAgentClient | None,
    Depends(get_vera_agent_client),
]
