from typing import Annotated

from fastapi import Depends, Request

from src.core.settings import get_settings
from src.services.vera_agent import VeraAgentClient
from src.services.vera_publisher import VeraPublisher
from src.services.vera_stream_ticket import VeraStreamTicketIssuer


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


def get_vera_stream_ticket_issuer() -> VeraStreamTicketIssuer | None:
    """Создаёт issuer из общего API-ключа сайта и Agent Service."""
    api_key = get_settings().vera.agent_api_key
    if api_key is None or not api_key.get_secret_value():
        return None
    return VeraStreamTicketIssuer(api_key.get_secret_value())


VeraPublisherDep = Annotated[VeraPublisher | None, Depends(get_vera_publisher)]
VeraAgentClientDep = Annotated[
    VeraAgentClient | None,
    Depends(get_vera_agent_client),
]
VeraStreamTicketIssuerDep = Annotated[
    VeraStreamTicketIssuer | None,
    Depends(get_vera_stream_ticket_issuer),
]
