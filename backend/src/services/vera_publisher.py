import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Sequence
from contextlib import suppress

import aio_pika
from aio_pika.abc import AbstractRobustChannel, AbstractRobustConnection

from src.exceptions.services import VeraPublisherError

logger = logging.getLogger(__name__)

CONNECTION_NAME = "wfe-backend"
RECONNECT_DELAYS_SECONDS = (1.0, 2.0, 4.0, 8.0, 16.0, 30.0)


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
        try:
            channel = await connection.channel(publisher_confirms=True)
            await channel.declare_queue(queue_name, passive=True)
            return cls(connection=connection, channel=channel, queue_name=queue_name)
        except Exception:
            with suppress(Exception):
                await connection.close()
            raise

    async def close(self) -> None:
        await self._connection.close()

    @property
    def is_ready(self) -> bool:
        """Показывает, доступен ли robust connection и его канал."""
        return (
            not self._connection.is_closed
            and not self._connection.reconnecting
            and not self._channel.is_closed
        )

    async def publish_agent_request(
        self,
        session_id: str,
        request_id: str,
        user_id: str | None,
        anonymous_token_hash: str | None,
        message: str,
    ) -> None:
        payload = {
            "session_id": session_id,
            "request_id": request_id,
            "user_id": user_id,
            "anonymous_token_hash": anonymous_token_hash,
            "message": message,
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        # Payload целиком в лог не пишется: он содержит текст вопроса,
        # email владельца (`user_id`) и хеш токена анонимной сессии.
        # Диагностика строится на идентификаторах и размерах — их достаточно,
        # чтобы связать запись с записью в PostgreSQL агента и с SSE-потоком.
        logger.info(
            "Отправка запроса агенту «Вера» в RabbitMQ: "
            "queue=%s, session_id=%s, request_id=%s, "
            "authenticated=%s, message_length=%d",
            self._queue_name,
            session_id,
            request_id,
            user_id is not None,
            len(message),
        )

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
            logger.info(
                "Запрос агенту «Вера» опубликован в RabbitMQ: "
                "queue=%s, session_id=%s, request_id=%s",
                self._queue_name,
                session_id,
                request_id,
            )
        except Exception as err:
            raise VeraPublisherError(str(err)) from err


PublisherConnector = Callable[..., Awaitable[VeraPublisher]]


class VeraPublisherManager:
    """Управляет единственным publisher и восстанавливает его в фоне."""

    def __init__(
        self,
        *,
        rabbitmq_url: str,
        queue_name: str,
        connector: PublisherConnector | None = None,
        reconnect_delays: Sequence[float] = RECONNECT_DELAYS_SECONDS,
    ) -> None:
        if not reconnect_delays:
            raise ValueError("reconnect_delays не должен быть пустым")

        self._rabbitmq_url = rabbitmq_url
        self._queue_name = queue_name
        self._connector = connector or VeraPublisher.connect
        self._reconnect_delays = tuple(reconnect_delays)
        self._publisher: VeraPublisher | None = None
        self._reconnect_task: asyncio.Task[None] | None = None
        self._lifecycle_lock = asyncio.Lock()
        self._started = False
        self._stopping = False

    @property
    def publisher(self) -> VeraPublisher | None:
        """Возвращает готовый publisher либо `None` во время деградации."""
        return self._publisher

    @property
    def is_ready(self) -> bool:
        """Показывает, готов ли publisher принимать сообщения."""
        return self._publisher is not None and self._publisher.is_ready

    @property
    def is_reconnecting(self) -> bool:
        """Показывает, запущена ли фоновая задача восстановления."""
        return self._reconnect_task is not None and not self._reconnect_task.done()

    async def start(self) -> None:
        """Делает первую попытку подключения и запускает один reconnect loop."""
        async with self._lifecycle_lock:
            if self._started:
                return

            self._started = True
            self._stopping = False
            if await self._connect_once():
                return

            self._start_reconnect_locked()

    async def ensure_reconnecting(self) -> None:
        """Запускает новый bounded reconnect cycle, если предыдущий завершён."""
        async with self._lifecycle_lock:
            if self._stopping or self.is_ready or self.is_reconnecting:
                return
            self._start_reconnect_locked()

    async def close(self) -> None:
        """Останавливает reconnect loop и закрывает активное соединение."""
        async with self._lifecycle_lock:
            self._stopping = True
            reconnect_task = self._reconnect_task
            self._reconnect_task = None
            publisher = self._publisher
            self._publisher = None
            self._started = False

        if reconnect_task is not None:
            reconnect_task.cancel()
            with suppress(asyncio.CancelledError):
                await reconnect_task
        if publisher is not None:
            await publisher.close()

    async def _connect_once(self) -> bool:
        """Выполняет одну попытку подключения без повторов."""
        try:
            publisher = await self._connector(
                rabbitmq_url=self._rabbitmq_url,
                queue_name=self._queue_name,
            )
        except Exception as error:
            logger.error(
                "⚠️ Агент «Вера» недоступен — не удалось подключиться "
                "к RabbitMQ: %s",
                error,
            )
            return False

        if self._stopping:
            await publisher.close()
            return False

        self._publisher = publisher
        logger.info("✅ Publisher агента «Вера» подключён к RabbitMQ.")
        return True

    async def _reconnect_loop(self) -> None:
        """Повторяет подключение с ограниченным exponential backoff."""
        for delay in self._reconnect_delays:
            if self._stopping or self._publisher is not None:
                return
            logger.warning(
                "🔄 Повтор подключения publisher агента «Вера» через %.1f с.",
                delay,
            )
            await asyncio.sleep(delay)
            if self._stopping:
                return
            if await self._connect_once():
                return

        logger.error(
            "❌ Исчерпан bounded reconnect cycle publisher агента «Вера»; "
            "следующий запрос сможет запустить новый цикл."
        )

    def _start_reconnect_locked(self) -> None:
        """Создаёт reconnect task под защитой lifecycle lock."""
        self._reconnect_task = asyncio.create_task(
            self._reconnect_loop(),
            name="vera-publisher-reconnect",
        )
