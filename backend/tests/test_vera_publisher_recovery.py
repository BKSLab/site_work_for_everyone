import asyncio
import base64
import hashlib
import hmac
import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, call, patch

import httpx
from fastapi import FastAPI

from main import app as backend_app
from src.api.vera import router as vera_router
from src.core.limiter import limiter
from src.core.settings import get_settings
from src.dependencies.jwt import get_optional_user_payload
from src.dependencies.vera import (
    get_vera_agent_client,
    get_vera_publisher,
    get_vera_stream_ticket_issuer,
)
from src.exceptions.services import VeraStreamTicketServiceError
from src.schemas.vera import VeraChatSessionResolveResponseSchema
from src.services.vera_publisher import VeraPublisherManager
from src.services.vera_stream_ticket import VeraStreamTicketIssuer


class _FakePublisher:
    def __init__(self) -> None:
        self.closed = False
        self.published_requests = []

    @property
    def is_ready(self) -> bool:
        return not self.closed

    async def close(self) -> None:
        self.closed = True

    async def publish_agent_request(self, **payload) -> None:
        self.published_requests.append(payload)


class _FailingTicketIssuer:
    def issue(self, **_kwargs) -> str:
        raise VeraStreamTicketServiceError("signing failed")


class _FakeAgentClient:
    async def resolve_chat_session(self, _data, **_owner):
        return VeraChatSessionResolveResponseSchema(
            session_id="session-1",
            previous_session_id=None,
            boundary="created",
            session_ttl_seconds=86400,
        )


def _session_token(session_id: str, nonce: str) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps(
            {
                "session_id": session_id,
                "nonce": nonce,
                "exp": int(time.time()) + 60,
            },
            separators=(",", ":"),
        ).encode()
    ).decode().rstrip("=")
    secret = get_settings().vera.session_signing_key.get_secret_value().encode()
    signature = base64.urlsafe_b64encode(
        hmac.new(secret, payload.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{payload}.{signature}"


def _chat_owner_headers() -> dict[str, str]:
    return {
        "X-Vera-Session-Token": _session_token("session-1", "current"),
        "X-Vera-Refreshed-Session-Token": _session_token(
            "session-1",
            "refreshed",
        ),
        "X-Vera-Replacement-Session-Token": _session_token(
            "session-2",
            "replacement",
        ),
    }


async def _wait_until_ready(manager: VeraPublisherManager) -> None:
    for _ in range(100):
        if manager.is_ready:
            return
        await asyncio.sleep(0)
    raise AssertionError("Publisher не восстановился")


class VeraPublisherManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_recovers_after_initial_connection_error(self) -> None:
        publisher = _FakePublisher()
        attempts = 0

        async def connector(**_kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise ConnectionError("broker unavailable")
            return publisher

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(0,),
        )

        await manager.start()
        await _wait_until_ready(manager)

        self.assertEqual(attempts, 2)
        self.assertIs(manager.publisher, publisher)
        await manager.close()
        self.assertTrue(publisher.closed)

    async def test_concurrent_requests_keep_single_reconnect_loop(self) -> None:
        publisher = _FakePublisher()
        retry_started = asyncio.Event()
        allow_recovery = asyncio.Event()
        attempts = 0

        async def connector(**_kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise ConnectionError("broker unavailable")
            retry_started.set()
            await allow_recovery.wait()
            return publisher

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(0,),
        )
        await manager.start()

        await retry_started.wait()
        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(vera_publisher_manager=manager)
            )
        )
        publishers = await asyncio.gather(
            *(get_vera_publisher(request) for _ in range(10))
        )

        self.assertEqual(publishers, [None] * 10)
        self.assertEqual(attempts, 2)
        self.assertTrue(manager.is_reconnecting)

        allow_recovery.set()
        await _wait_until_ready(manager)
        self.assertEqual(attempts, 2)
        await manager.close()

    async def test_shutdown_cancels_pending_backoff(self) -> None:
        async def connector(**_kwargs):
            raise ConnectionError("broker unavailable")

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(3600,),
        )
        await manager.start()

        self.assertTrue(manager.is_reconnecting)
        await asyncio.wait_for(manager.close(), timeout=0.1)
        self.assertFalse(manager.is_reconnecting)
        self.assertFalse(manager.is_ready)

    async def test_reconnect_backoff_has_finite_attempt_budget(self) -> None:
        publisher = _FakePublisher()
        attempts = 0
        broker_available = False

        async def connector(**_kwargs):
            nonlocal attempts, broker_available
            attempts += 1
            if not broker_available:
                raise ConnectionError("broker unavailable")
            return publisher

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(1, 2),
        )
        sleep = AsyncMock()

        with patch("src.services.vera_publisher.asyncio.sleep", sleep):
            await manager.start()
            reconnect_task = manager._reconnect_task
            self.assertIsNotNone(reconnect_task)
            await reconnect_task

            self.assertEqual(attempts, 3)
            self.assertFalse(manager.is_reconnecting)
            self.assertFalse(manager.is_ready)

            broker_available = True
            await manager.ensure_reconnecting()
            reconnect_task = manager._reconnect_task
            self.assertIsNotNone(reconnect_task)
            await reconnect_task

        self.assertEqual(sleep.await_args_list, [call(1), call(2), call(1)])
        self.assertEqual(attempts, 4)
        self.assertTrue(manager.is_ready)
        await manager.close()

    async def test_health_distinguishes_unavailable_and_ready(self) -> None:
        publisher = _FakePublisher()

        async def connector(**_kwargs):
            return publisher

        unavailable_manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(1,),
        )
        backend_app.state.vera_publisher_manager = unavailable_manager
        transport = httpx.ASGITransport(app=backend_app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {"status": "degraded", "vera_publisher": "unavailable"},
            )

            await unavailable_manager.start()
            response = await client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {"status": "ok", "vera_publisher": "ready"},
            )
        await unavailable_manager.close()

    async def test_chat_returns_202_after_publisher_recovers(self) -> None:
        publisher = _FakePublisher()
        attempts = 0

        async def connector(**_kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise ConnectionError("broker unavailable")
            return publisher

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(0,),
        )
        await manager.start()
        await _wait_until_ready(manager)

        test_app = FastAPI()
        test_app.state.limiter = limiter
        test_app.include_router(vera_router, prefix="/api")
        test_app.dependency_overrides[get_optional_user_payload] = (
            lambda: {"sub": "user@example.com"}
        )
        test_app.dependency_overrides[get_vera_publisher] = (
            lambda: manager.publisher
        )
        test_app.dependency_overrides[get_vera_agent_client] = (
            _FakeAgentClient
        )
        test_app.dependency_overrides[get_vera_stream_ticket_issuer] = lambda: (
            VeraStreamTicketIssuer("shared-test-key")
        )
        transport = httpx.ASGITransport(app=test_app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/vera/chat",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                    "request_id": "request-1",
                    "message": "Вопрос",
                },
                headers=_chat_owner_headers(),
            )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["request_id"], "request-1")
        self.assertEqual(response.json()["stream_url"], "/vera/sse/request-1")
        self.assertTrue(response.json()["stream_ticket"])
        self.assertEqual(len(publisher.published_requests), 1)
        await manager.close()

    async def test_chat_does_not_publish_when_stream_ticket_is_not_configured(
        self,
    ) -> None:
        publisher = _FakePublisher()

        async def connector(**_kwargs):
            return publisher

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(0,),
        )
        await manager.start()

        test_app = FastAPI()
        test_app.state.limiter = limiter
        test_app.include_router(vera_router, prefix="/api")
        test_app.dependency_overrides[get_optional_user_payload] = lambda: {
            "sub": "user@example.com"
        }
        test_app.dependency_overrides[get_vera_publisher] = lambda: manager.publisher
        test_app.dependency_overrides[get_vera_agent_client] = (
            _FakeAgentClient
        )
        test_app.dependency_overrides[get_vera_stream_ticket_issuer] = lambda: None
        transport = httpx.ASGITransport(app=test_app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/vera/chat",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                    "request_id": "request-1",
                    "message": "Вопрос",
                },
                headers=_chat_owner_headers(),
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["publish_state"], "not_published")
        self.assertEqual(publisher.published_requests, [])
        await manager.close()

    async def test_chat_does_not_publish_when_stream_ticket_cannot_be_issued(
        self,
    ) -> None:
        publisher = _FakePublisher()

        async def connector(**_kwargs):
            return publisher

        manager = VeraPublisherManager(
            rabbitmq_url="amqp://test",
            queue_name="agent.requests",
            connector=connector,
            reconnect_delays=(0,),
        )
        await manager.start()

        test_app = FastAPI()
        test_app.state.limiter = limiter
        test_app.include_router(vera_router, prefix="/api")
        test_app.dependency_overrides[get_optional_user_payload] = lambda: {
            "sub": "user@example.com"
        }
        test_app.dependency_overrides[get_vera_publisher] = lambda: manager.publisher
        test_app.dependency_overrides[get_vera_agent_client] = (
            _FakeAgentClient
        )
        test_app.dependency_overrides[get_vera_stream_ticket_issuer] = (
            _FailingTicketIssuer
        )
        transport = httpx.ASGITransport(app=test_app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/vera/chat",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                    "request_id": "request-1",
                    "message": "Вопрос",
                },
                headers=_chat_owner_headers(),
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["publish_state"], "not_published")
        self.assertEqual(publisher.published_requests, [])
        await manager.close()


if __name__ == "__main__":
    unittest.main()
