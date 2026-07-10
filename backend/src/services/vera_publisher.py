import json
import logging

import aio_pika
from aio_pika.abc import AbstractRobustChannel, AbstractRobustConnection

from src.exceptions.services import VeraPublisherError

logger = logging.getLogger(__name__)

CONNECTION_NAME = "wfe-backend"


class VeraPublisher:
    """Публикует вопросы пользователей в очередь `agent.requests`
    (контракт — `vera_agent_service/app/messaging/schemas.py`).

    Очередь объявлена и принадлежит consumer'у `vera_agent_service` (свой
    `x-dead-letter-exchange`) — здесь только `passive`-проверка
    существования при подключении, не полноценный `declare_queue`: другой
    набор аргументов уронил бы канал (`PRECONDITION_FAILED`).
    """

    def __init__(
        self,
        connection: AbstractRobustConnection,
        channel: AbstractRobustChannel,
        queue_name: str,
    ) -> None:
        self._connection = connection
        self._channel = channel
        self._queue_name = queue_name

    @classmethod
    async def connect(cls, rabbitmq_url: str, queue_name: str) -> "VeraPublisher":
        connection = await aio_pika.connect_robust(
            rabbitmq_url,
            client_properties={"connection_name": CONNECTION_NAME},
        )
        channel = await connection.channel(publisher_confirms=True)
        await channel.declare_queue(queue_name, passive=True)
        return cls(connection=connection, channel=channel, queue_name=queue_name)

    async def close(self) -> None:
        await self._connection.close()

    async def publish_agent_request(
        self, session_id: str, user_id: str | None, message: str
    ) -> None:
        payload = {"session_id": session_id, "user_id": user_id, "message": message}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        try:
            await self._channel.default_exchange.publish(
                aio_pika.Message(
                    body=body,
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    content_type="application/json",
                    content_encoding="utf-8",
                ),
                routing_key=self._queue_name,
            )
        except Exception as err:
            raise VeraPublisherError(str(err)) from err
