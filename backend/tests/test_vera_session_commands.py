import base64
import hashlib
import hmac
import json
import time
import unittest
from datetime import UTC, datetime

import httpx
from fastapi import FastAPI

from src.api.vera import router as vera_router
from src.core.limiter import limiter
from src.core.settings import get_settings
from src.dependencies.jwt import get_optional_user_payload
from src.dependencies.vera import get_vera_agent_client
from src.exceptions.services import VeraAgentServiceError
from src.schemas.vera import (
    VeraChatSessionCloseResponseSchema,
    VeraChatSessionCreateRequestSchema,
    VeraChatSessionCreateResponseSchema,
)
from src.services.vera_agent import VeraAgentClient


def _session_token(session_id: str) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps(
            {
                "session_id": session_id,
                "nonce": "test-nonce",
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


def _build_test_app(
    agent_client,
    *,
    user_payload: dict | None = None,
) -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(vera_router, prefix="/api")
    app.dependency_overrides[get_optional_user_payload] = lambda: user_payload
    app.dependency_overrides[get_vera_agent_client] = lambda: agent_client
    return app


class _RecordingAgentClient:
    def __init__(
        self,
        *,
        error: VeraAgentServiceError | None = None,
    ) -> None:
        self.error = error
        self.events: list[tuple[str, object, dict]] = []

    async def create_chat_session(self, data, **owner):
        self.events.append(("create", data, owner))
        if self.error is not None:
            raise self.error
        return VeraChatSessionCreateResponseSchema(
            session_id=data.session_id,
            session_ttl_seconds=86400,
        )

    async def close_chat_session(self, session_id, **owner):
        self.events.append(("close", session_id, owner))
        if self.error is not None:
            raise self.error
        return VeraChatSessionCloseResponseSchema(
            session_id=session_id,
            closed_at=datetime(2026, 8, 10, 12, 30, tzinfo=UTC),
        )


class VeraAgentSessionCommandsClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_forwards_body_and_owner_headers(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.url.path, "/api/v1/chat/sessions")
            self.assertEqual(
                json.loads(request.content),
                {"session_id": "conversation-1"},
            )
            self.assertEqual(request.headers["X-Vera-User-ID"], "user-1")
            self.assertEqual(
                request.headers["X-Vera-Anonymous-Token-Hash"],
                "a" * 64,
            )
            return httpx.Response(
                200,
                json={
                    "session_id": "conversation-1",
                    "session_ttl_seconds": 86400,
                },
            )

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            transport=httpx.MockTransport(handler),
        )
        client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(client.close)

        response = await client.create_chat_session(
            VeraChatSessionCreateRequestSchema(session_id="conversation-1"),
            user_id="user-1",
            anonymous_token_hash="a" * 64,
        )

        self.assertEqual(response.session_id, "conversation-1")
        self.assertEqual(response.session_ttl_seconds, 86400)

    async def test_close_encodes_session_id_and_omits_body(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "POST")
            self.assertEqual(
                request.url.raw_path,
                b"/api/v1/chat/sessions/conversation%20one/close",
            )
            self.assertEqual(request.content, b"")
            self.assertEqual(
                request.headers["X-Vera-Anonymous-Token-Hash"],
                "b" * 64,
            )
            return httpx.Response(
                200,
                json={
                    "session_id": "conversation one",
                    "closed_at": "2026-08-10T12:30:00Z",
                },
            )

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            transport=httpx.MockTransport(handler),
        )
        client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(client.close)

        response = await client.close_chat_session(
            "conversation one",
            user_id=None,
            anonymous_token_hash="b" * 64,
        )

        self.assertEqual(response.session_id, "conversation one")
        self.assertEqual(response.closed_at.tzinfo, UTC)

    async def test_commands_reject_unbound_or_malformed_success(self) -> None:
        responses = iter(
            [
                httpx.Response(
                    200,
                    json={
                        "session_id": "foreign",
                        "session_ttl_seconds": 86400,
                    },
                ),
                httpx.Response(
                    200,
                    json={"session_id": "conversation-1"},
                ),
            ]
        )

        async def handler(_request: httpx.Request) -> httpx.Response:
            return next(responses)

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            transport=httpx.MockTransport(handler),
        )
        client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(client.close)

        with self.assertRaises(VeraAgentServiceError) as create_error:
            await client.create_chat_session(
                VeraChatSessionCreateRequestSchema(
                    session_id="conversation-1"
                ),
                user_id="user-1",
                anonymous_token_hash=None,
            )
        with self.assertRaises(VeraAgentServiceError) as close_error:
            await client.close_chat_session(
                "conversation-1",
                user_id="user-1",
                anonymous_token_hash=None,
            )

        self.assertEqual(create_error.exception.status_code, 502)
        self.assertEqual(close_error.exception.status_code, 502)

    async def test_commands_preserve_upstream_error_contract(self) -> None:
        cases = (
            ("create", 403),
            ("create", 409),
            ("close", 403),
            ("close", 404),
            ("create", 503),
            ("close", 504),
        )
        responses = iter(
            httpx.Response(
                status_code,
                json={"detail": f"command-error-{status_code}"},
            )
            for _, status_code in cases
        )

        async def handler(_request: httpx.Request) -> httpx.Response:
            return next(responses)

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            transport=httpx.MockTransport(handler),
        )
        client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(client.close)

        for command, status_code in cases:
            with self.subTest(command=command, status_code=status_code):
                with self.assertRaises(VeraAgentServiceError) as raised:
                    if command == "create":
                        await client.create_chat_session(
                            VeraChatSessionCreateRequestSchema(
                                session_id="conversation-1"
                            ),
                            user_id="user-1",
                            anonymous_token_hash=None,
                        )
                    else:
                        await client.close_chat_session(
                            "conversation-1",
                            user_id="user-1",
                            anonymous_token_hash=None,
                        )

                self.assertEqual(raised.exception.status_code, status_code)
                self.assertEqual(
                    raised.exception.detail,
                    f"command-error-{status_code}",
                )


class VeraSessionCommandsEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        limiter.reset()

    async def asyncTearDown(self) -> None:
        limiter.reset()

    async def test_create_validates_anonymous_owner_and_returns_ttl(
        self,
    ) -> None:
        agent_client = _RecordingAgentClient()
        app = _build_test_app(agent_client)
        token = _session_token("conversation-1")

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/vera/session",
                json={"session_id": "conversation-1"},
                headers={"X-Vera-Session-Token": token},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "session_id": "conversation-1",
                "session_ttl_seconds": 86400,
            },
        )
        _, _, owner = agent_client.events[0]
        self.assertIsNone(owner["user_id"])
        self.assertEqual(
            owner["anonymous_token_hash"],
            hashlib.sha256(token.encode()).hexdigest(),
        )

    async def test_close_uses_authenticated_owner_without_session_token(
        self,
    ) -> None:
        agent_client = _RecordingAgentClient()
        app = _build_test_app(
            agent_client,
            user_payload={"sub": "user@example.com"},
        )

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/vera/session/conversation-1/close"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "session_id": "conversation-1",
                "closed_at": "2026-08-10T12:30:00Z",
            },
        )
        _, _, owner = agent_client.events[0]
        self.assertEqual(owner["user_id"], "user@example.com")
        self.assertIsNone(owner["anonymous_token_hash"])

    async def test_commands_preserve_agent_owner_and_state_errors(self) -> None:
        cases = (
            ("create", 403, "Сессия принадлежит другому владельцу."),
            ("create", 409, "Сессия уже закрыта."),
            ("close", 404, "Сессия не найдена."),
            ("close", 403, "Сессия принадлежит другому владельцу."),
        )
        for command, status_code, detail in cases:
            with self.subTest(command=command, status_code=status_code):
                agent_client = _RecordingAgentClient(
                    error=VeraAgentServiceError(
                        status_code=status_code,
                        detail=detail,
                        error_details="Agent command rejected for test.",
                    )
                )
                app = _build_test_app(
                    agent_client,
                    user_payload={"sub": "user@example.com"},
                )
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="http://test",
                ) as client:
                    if command == "create":
                        response = await client.post(
                            "/api/vera/session",
                            json={"session_id": "conversation-1"},
                        )
                    else:
                        response = await client.post(
                            "/api/vera/session/conversation-1/close"
                        )

                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    async def test_invalid_anonymous_proof_never_reaches_agent(self) -> None:
        agent_client = _RecordingAgentClient()
        app = _build_test_app(agent_client)

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/vera/session/conversation-1/close",
                headers={"X-Vera-Session-Token": "invalid"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(agent_client.events, [])

    def test_openapi_declares_session_command_errors(self) -> None:
        paths = _build_test_app(None).openapi()["paths"]

        create_responses = paths["/api/vera/session"]["post"]["responses"]
        close_responses = paths[
            "/api/vera/session/{session_id}/close"
        ]["post"]["responses"]
        self.assertIn("403", create_responses)
        self.assertIn("409", create_responses)
        self.assertIn("403", close_responses)
        self.assertIn("404", close_responses)


if __name__ == "__main__":
    unittest.main()
