import base64
import hashlib
import hmac
import json
import time
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI

from src.api.vera import (
    _get_effective_anonymous_token_hash,
    router as vera_router,
)
from src.core.limiter import limiter
from src.core.settings import get_settings
from src.dependencies.jwt import get_optional_user_payload
from src.dependencies.vera import (
    get_vera_agent_client,
    get_vera_publisher,
    get_vera_stream_ticket_issuer,
)
from src.exceptions.services import (
    VeraAgentServiceError,
    VeraPublisherError,
    VeraSessionTokenError,
)
from src.schemas.vera import (
    VeraChatSessionResolveRequestSchema,
    VeraChatSessionResolveResponseSchema,
)
from src.services import vera_session_access
from src.services.vera_agent import VeraAgentClient
from src.services.vera_session_access import (
    VeraSessionLifecycleAccess,
    resolve_vera_session_lifecycle_access,
)


def _token(
    session_id: str,
    nonce: str,
    *,
    expires_in_seconds: int = 60,
) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps(
            {
                "session_id": session_id,
                "nonce": nonce,
                "exp": int(time.time()) + expires_in_seconds,
            },
            separators=(",", ":"),
        ).encode()
    ).decode().rstrip("=")
    secret = get_settings().vera.session_signing_key.get_secret_value().encode()
    signature = base64.urlsafe_b64encode(
        hmac.new(secret, payload.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{payload}.{signature}"


def _owner_headers(
    current_token: str,
    refreshed_token: str,
    replacement_token: str,
) -> dict[str, str]:
    return {
        "X-Vera-Session-Token": current_token,
        "X-Vera-Refreshed-Session-Token": refreshed_token,
        "X-Vera-Replacement-Session-Token": replacement_token,
    }


def _build_test_app(
    *,
    agent_client,
    user_payload: dict | None = None,
    publisher=None,
    ticket_issuer=None,
) -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(vera_router, prefix="/api")
    app.dependency_overrides[get_optional_user_payload] = lambda: user_payload
    app.dependency_overrides[get_vera_agent_client] = lambda: agent_client
    app.dependency_overrides[get_vera_publisher] = lambda: publisher
    app.dependency_overrides[get_vera_stream_ticket_issuer] = (
        lambda: ticket_issuer
    )
    return app


class _RecordingAgentClient:
    def __init__(
        self,
        events: list,
        response: VeraChatSessionResolveResponseSchema | None = None,
        error: VeraAgentServiceError | None = None,
    ) -> None:
        self.events = events
        self.response = response
        self.error = error

    async def resolve_chat_session(self, data, **owner):
        self.events.append(("resolve", data, owner))
        if self.error is not None:
            raise self.error
        return self.response


class _RecordingTicketIssuer:
    def __init__(self, events: list) -> None:
        self.events = events

    def issue(self, **payload) -> str:
        self.events.append(("ticket", payload))
        return "stream-ticket"


class _RecordingPublisher:
    def __init__(self, events: list) -> None:
        self.events = events

    async def publish_agent_request(self, **payload) -> None:
        self.events.append(("publish", payload))


class _FailingPublisher(_RecordingPublisher):
    async def publish_agent_request(self, **payload) -> None:
        await super().publish_agent_request(**payload)
        raise VeraPublisherError("broker unavailable")


class VeraSessionLifecycleAccessTests(unittest.TestCase):
    def test_validates_current_refreshed_and_replacement_tokens_in_order(
        self,
    ) -> None:
        current_token = _token("session-1", "current")
        refreshed_token = _token("session-1", "refreshed")
        replacement_token = _token("session-2", "replacement")
        calls: list[tuple[str, str]] = []
        original = vera_session_access._verify_and_hash_session_token

        def record_verification(
            *,
            session_id: str,
            anonymous_token: str,
            allow_expired: bool = False,
        ) -> str:
            calls.append((session_id, anonymous_token))
            return original(
                session_id=session_id,
                anonymous_token=anonymous_token,
                allow_expired=allow_expired,
            )

        with patch.object(
            vera_session_access,
            "_verify_and_hash_session_token",
            side_effect=record_verification,
        ):
            access = resolve_vera_session_lifecycle_access(
                session_id="session-1",
                replacement_session_id="session-2",
                user_payload={"sub": "user@example.com"},
                anonymous_token=current_token,
                refreshed_anonymous_token=refreshed_token,
                replacement_anonymous_token=replacement_token,
            )

        self.assertEqual(
            calls,
            [
                ("session-1", current_token),
                ("session-1", refreshed_token),
                ("session-2", replacement_token),
            ],
        )
        self.assertEqual(access.user_id, "user@example.com")
        self.assertEqual(
            access.refreshed_anonymous_token_hash,
            hashlib.sha256(refreshed_token.encode()).hexdigest(),
        )

    def test_rejects_refreshed_token_for_another_session(self) -> None:
        with self.assertRaises(VeraSessionTokenError):
            resolve_vera_session_lifecycle_access(
                session_id="session-1",
                replacement_session_id="session-2",
                user_payload=None,
                anonymous_token=_token("session-1", "current"),
                refreshed_anonymous_token=_token("foreign", "refreshed"),
                replacement_anonymous_token=_token(
                    "session-2",
                    "replacement",
                ),
            )

    def test_accepts_expired_current_only_for_lifecycle_recovery(self) -> None:
        expired_current = _token(
            "session-1",
            "expired-current",
            expires_in_seconds=-60,
        )
        access = resolve_vera_session_lifecycle_access(
            session_id="session-1",
            replacement_session_id="session-2",
            user_payload=None,
            anonymous_token=expired_current,
            refreshed_anonymous_token=_token("session-1", "refreshed"),
            replacement_anonymous_token=_token(
                "session-2",
                "replacement",
            ),
        )

        self.assertEqual(
            access.anonymous_token_hash,
            hashlib.sha256(expired_current.encode()).hexdigest(),
        )
        with self.assertRaises(VeraSessionTokenError):
            resolve_vera_session_lifecycle_access(
                session_id="session-1",
                replacement_session_id="session-2",
                user_payload=None,
                anonymous_token=expired_current,
                refreshed_anonymous_token=_token(
                    "session-1",
                    "expired-refreshed",
                    expires_in_seconds=-60,
                ),
                replacement_anonymous_token=_token(
                    "session-2",
                    "replacement",
                ),
            )

    def test_retained_login_keeps_refreshed_hash_for_agent_assignment(
        self,
    ) -> None:
        access = VeraSessionLifecycleAccess(
            user_id="user@example.com",
            anonymous_token_hash="a" * 64,
            refreshed_anonymous_token_hash="b" * 64,
            replacement_anonymous_token_hash="c" * 64,
        )

        effective_hash = _get_effective_anonymous_token_hash(
            "retained",
            access,
        )

        self.assertEqual(effective_hash, "b" * 64)

    def test_authenticated_created_omits_but_expired_keeps_recovery_hash(
        self,
    ) -> None:
        access = VeraSessionLifecycleAccess(
            user_id="user@example.com",
            anonymous_token_hash="a" * 64,
            refreshed_anonymous_token_hash="b" * 64,
            replacement_anonymous_token_hash="c" * 64,
        )

        self.assertIsNone(
            _get_effective_anonymous_token_hash("created", access)
        )
        self.assertEqual(
            _get_effective_anonymous_token_hash("expired", access),
            "c" * 64,
        )


class VeraAgentSessionLifecycleClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_contract_forwards_only_owner_hashes(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "POST")
            self.assertEqual(
                request.url.path,
                "/api/v1/chat/sessions/resolve",
            )
            self.assertEqual(
                json.loads(request.content),
                {
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                },
            )
            self.assertEqual(request.headers["X-Vera-User-ID"], "user-1")
            self.assertEqual(
                request.headers["X-Vera-Anonymous-Token-Hash"],
                "a" * 64,
            )
            self.assertEqual(
                request.headers[
                    "X-Vera-Refreshed-Anonymous-Token-Hash"
                ],
                "b" * 64,
            )
            self.assertEqual(
                request.headers[
                    "X-Vera-Replacement-Anonymous-Token-Hash"
                ],
                "c" * 64,
            )
            self.assertNotIn("Session-Token", request.headers)
            return httpx.Response(
                200,
                json={
                    "session_id": "session-1",
                    "previous_session_id": None,
                    "boundary": "retained",
                    "session_ttl_seconds": 86400,
                },
            )

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            headers={"X-API-Key": "secret"},
            transport=httpx.MockTransport(handler),
        )
        client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(client.close)

        result = await client.resolve_chat_session(
            VeraChatSessionResolveRequestSchema(
                session_id="session-1",
                replacement_session_id="session-2",
            ),
            user_id="user-1",
            anonymous_token_hash="a" * 64,
            refreshed_anonymous_token_hash="b" * 64,
            replacement_anonymous_token_hash="c" * 64,
        )

        self.assertEqual(result.boundary, "retained")
        self.assertEqual(result.session_ttl_seconds, 86400)

    async def test_rejects_unbound_agent_resolution_before_publish(self) -> None:
        async def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "session_id": "foreign-session",
                    "previous_session_id": "session-1",
                    "boundary": "expired",
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

        with self.assertRaises(VeraAgentServiceError) as raised:
            await client.resolve_chat_session(
                VeraChatSessionResolveRequestSchema(
                    session_id="session-1",
                    replacement_session_id="session-2",
                ),
                user_id=None,
                anonymous_token_hash="a" * 64,
                refreshed_anonymous_token_hash="b" * 64,
                replacement_anonymous_token_hash="c" * 64,
            )

        self.assertEqual(raised.exception.status_code, 502)

    async def test_rejects_malformed_agent_resolution_as_service_error(
        self,
    ) -> None:
        async def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"boundary": "retained"})

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

        with self.assertRaises(VeraAgentServiceError) as raised:
            await client.resolve_chat_session(
                VeraChatSessionResolveRequestSchema(
                    session_id="session-1",
                    replacement_session_id="session-2",
                ),
                user_id=None,
                anonymous_token_hash="a" * 64,
                refreshed_anonymous_token_hash="b" * 64,
                replacement_anonymous_token_hash="c" * 64,
            )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(
            raised.exception.detail,
            "Agent Service вернул некорректную границу диалога.",
        )


class VeraSessionLifecycleEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        limiter.reset()

    async def asyncTearDown(self) -> None:
        limiter.reset()

    def test_chat_openapi_documents_lifecycle_error_contract(self) -> None:
        app = _build_test_app(agent_client=None)

        responses = app.openapi()["paths"]["/api/vera/chat"]["post"][
            "responses"
        ]

        self.assertTrue(
            {"401", "403", "409", "429", "502", "503", "504"}.issubset(
                responses
            )
        )
        self.assertEqual(
            responses["502"]["content"]["application/json"]["example"][
                "publish_state"
            ],
            "not_published",
        )

    async def test_resolve_proxy_validates_tokens_and_passes_hashes(self) -> None:
        events: list = []
        response = VeraChatSessionResolveResponseSchema(
            session_id="session-1",
            previous_session_id=None,
            boundary="retained",
            session_ttl_seconds=86400,
        )
        agent_client = _RecordingAgentClient(events, response=response)
        app = _build_test_app(
            agent_client=agent_client,
            user_payload={"sub": "user@example.com"},
        )
        current_token = _token("session-1", "current")
        refreshed_token = _token("session-1", "refreshed")
        replacement_token = _token("session-2", "replacement")

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            result = await client.post(
                "/api/vera/session/resolve",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                },
                headers=_owner_headers(
                    current_token,
                    refreshed_token,
                    replacement_token,
                ),
            )

        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), response.model_dump(mode="json"))
        _, data, owner = events[0]
        self.assertEqual(data.session_id, "session-1")
        self.assertEqual(owner["user_id"], "user@example.com")
        self.assertEqual(
            owner["anonymous_token_hash"],
            hashlib.sha256(current_token.encode()).hexdigest(),
        )
        self.assertEqual(
            owner["refreshed_anonymous_token_hash"],
            hashlib.sha256(refreshed_token.encode()).hexdigest(),
        )
        self.assertEqual(
            owner["replacement_anonymous_token_hash"],
            hashlib.sha256(replacement_token.encode()).hexdigest(),
        )

    async def test_chat_requires_all_lifecycle_headers(self) -> None:
        events: list = []
        app = _build_test_app(
            agent_client=_RecordingAgentClient(events),
            publisher=_RecordingPublisher(events),
            ticket_issuer=_RecordingTicketIssuer(events),
        )

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            result = await client.post(
                "/api/vera/chat",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                    "request_id": "request-1",
                    "message": "Вопрос",
                },
            )

        self.assertEqual(result.status_code, 422)
        self.assertEqual(events, [])

    async def test_chat_resolves_before_ticket_and_publish_with_effective_owner(
        self,
    ) -> None:
        events: list = []
        agent_client = _RecordingAgentClient(
            events,
            response=VeraChatSessionResolveResponseSchema(
                session_id="session-2",
                previous_session_id="session-1",
                boundary="expired",
                session_ttl_seconds=86400,
            ),
        )
        app = _build_test_app(
            agent_client=agent_client,
            publisher=_RecordingPublisher(events),
            ticket_issuer=_RecordingTicketIssuer(events),
        )
        current_token = _token("session-1", "current")
        refreshed_token = _token("session-1", "refreshed")
        replacement_token = _token("session-2", "replacement")
        replacement_hash = hashlib.sha256(
            replacement_token.encode()
        ).hexdigest()
        original_resolver = resolve_vera_session_lifecycle_access

        def record_validation(**kwargs):
            events.append(("validate", kwargs))
            return original_resolver(**kwargs)

        with patch(
            "src.api.vera.resolve_vera_session_lifecycle_access",
            side_effect=record_validation,
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                result = await client.post(
                    "/api/vera/chat",
                    json={
                        "session_id": "session-1",
                        "replacement_session_id": "session-2",
                        "request_id": "request-1",
                        "message": "Вопрос",
                    },
                    headers=_owner_headers(
                        current_token,
                        refreshed_token,
                        replacement_token,
                    ),
                )

        self.assertEqual(
            [event[0] for event in events],
            ["validate", "resolve", "ticket", "publish"],
        )
        ticket_payload = events[2][1]
        publish_payload = events[3][1]
        self.assertEqual(ticket_payload["session_id"], "session-2")
        self.assertEqual(
            ticket_payload["anonymous_token_hash"],
            replacement_hash,
        )
        self.assertEqual(publish_payload["session_id"], "session-2")
        self.assertEqual(
            publish_payload["anonymous_token_hash"],
            replacement_hash,
        )
        self.assertNotIn("replacement_session_id", publish_payload)
        self.assertNotIn("boundary", publish_payload)
        self.assertEqual(
            result.json(),
            {
                "request_id": "request-1",
                "stream_ticket": "stream-ticket",
                "stream_url": "/vera/sse/request-1",
                "session_id": "session-2",
                "previous_session_id": "session-1",
                "boundary": "expired",
                "session_ttl_seconds": 86400,
            },
        )

    async def test_chat_does_not_issue_ticket_or_publish_on_resolve_error(
        self,
    ) -> None:
        events: list = []
        agent_client = _RecordingAgentClient(
            events,
            error=VeraAgentServiceError(
                status_code=503,
                detail="Resolve недоступен.",
                error_details="test failure",
            ),
        )
        app = _build_test_app(
            agent_client=agent_client,
            publisher=_RecordingPublisher(events),
            ticket_issuer=_RecordingTicketIssuer(events),
        )
        current_token = _token("session-1", "current")
        refreshed_token = _token("session-1", "refreshed")
        replacement_token = _token("session-2", "replacement")
        original_resolver = resolve_vera_session_lifecycle_access

        def record_validation(**kwargs):
            events.append(("validate", kwargs))
            return original_resolver(**kwargs)

        with patch(
            "src.api.vera.resolve_vera_session_lifecycle_access",
            side_effect=record_validation,
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                result = await client.post(
                    "/api/vera/chat",
                    json={
                        "session_id": "session-1",
                        "replacement_session_id": "session-2",
                        "request_id": "request-1",
                        "message": "Вопрос",
                    },
                    headers=_owner_headers(
                        current_token,
                        refreshed_token,
                        replacement_token,
                    ),
                )

        self.assertEqual(result.status_code, 503)
        self.assertEqual(
            result.json(),
            {
                "detail": "Resolve недоступен.",
                "publish_state": "not_published",
            },
        )
        self.assertEqual(
            [event[0] for event in events],
            ["validate", "resolve"],
        )

    async def test_chat_does_not_publish_malformed_agent_resolution(
        self,
    ) -> None:
        async def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"boundary": "retained"})

        events: list = []
        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            transport=httpx.MockTransport(handler),
        )
        agent_client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(agent_client.close)
        app = _build_test_app(
            agent_client=agent_client,
            publisher=_RecordingPublisher(events),
            ticket_issuer=_RecordingTicketIssuer(events),
        )

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            result = await client.post(
                "/api/vera/chat",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                    "request_id": "request-1",
                    "message": "Вопрос",
                },
                headers=_owner_headers(
                    _token("session-1", "current"),
                    _token("session-1", "refreshed"),
                    _token("session-2", "replacement"),
                ),
            )

        self.assertEqual(result.status_code, 502)
        self.assertEqual(result.json()["publish_state"], "not_published")
        self.assertEqual(events, [])

    async def test_chat_publish_error_returns_committed_lifecycle(self) -> None:
        events: list = []
        app = _build_test_app(
            agent_client=_RecordingAgentClient(
                events,
                response=VeraChatSessionResolveResponseSchema(
                    session_id="session-2",
                    previous_session_id="session-1",
                    boundary="expired",
                    session_ttl_seconds=86400,
                ),
            ),
            publisher=_FailingPublisher(events),
            ticket_issuer=_RecordingTicketIssuer(events),
        )

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            result = await client.post(
                "/api/vera/chat",
                json={
                    "session_id": "session-1",
                    "replacement_session_id": "session-2",
                    "request_id": "request-1",
                    "message": "Вопрос",
                },
                headers=_owner_headers(
                    _token("session-1", "current"),
                    _token("session-1", "refreshed"),
                    _token("session-2", "replacement"),
                ),
            )

        self.assertEqual(result.status_code, 503)
        self.assertEqual(
            result.json(),
            {
                "detail": "Ассистент временно недоступен.",
                "session_id": "session-2",
                "previous_session_id": "session-1",
                "boundary": "expired",
                "session_ttl_seconds": 86400,
            },
        )
        self.assertEqual(
            [event[0] for event in events],
            ["resolve", "ticket", "publish"],
        )


if __name__ == "__main__":
    unittest.main()
