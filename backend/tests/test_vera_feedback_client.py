import unittest

import httpx

from src.exceptions.services import VeraAgentServiceError
from src.schemas.vera import VeraFeedbackSchema, VeraMessageFeedbackSchema
from src.services.vera_agent import VeraAgentClient


class VeraAgentClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_gets_current_session_by_user_id(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "GET")
            self.assertEqual(
                request.url.path,
                "/api/v1/chat/sessions/current",
            )
            self.assertEqual(request.headers["X-Vera-User-ID"], "user-1")
            return httpx.Response(
                200,
                json={"session_id": "conversation-1"},
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

        result = await client.get_current_chat_session(user_id="user-1")

        self.assertEqual(result.session_id, "conversation-1")

    async def test_gets_chat_history_by_encoded_session_id(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "GET")
            self.assertEqual(
                request.url.raw_path,
                b"/api/v1/chat/sessions/conversation%20one/history?limit=30",
            )
            self.assertEqual(
                request.headers["X-Vera-Anonymous-Token-Hash"],
                "a" * 64,
            )
            return httpx.Response(
                200,
                json={
                    "session_id": "conversation one",
                    "turns": [
                        {
                            "request_id": "request-1",
                            "sequence_number": 1,
                            "question": "Вопрос",
                            "answer": "Ответ",
                            "status": "completed",
                            "feedback_value": "up",
                            "created_at": "2026-07-29T12:00:00Z",
                            "completed_at": "2026-07-29T12:00:05Z",
                        }
                    ],
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

        result = await client.get_chat_history(
            "conversation one",
            user_id=None,
            anonymous_token_hash="a" * 64,
            limit=30,
            before_sequence=None,
        )

        self.assertEqual(result.turns[0].feedback_value, "up")

    async def test_sends_message_feedback_with_api_key(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "PUT")
            self.assertEqual(request.url.path, "/api/v1/feedback/message")
            self.assertEqual(request.headers["X-API-Key"], "secret")
            return httpx.Response(
                200,
                json={
                    "id": "feedback-1",
                    "session_id": "conversation-1",
                    "request_id": "request-1",
                    "value": "up",
                    "review_status": "new",
                    "created_at": "2026-07-29T12:00:00Z",
                    "updated_at": "2026-07-29T12:00:00Z",
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

        result = await client.set_message_feedback(
            VeraMessageFeedbackSchema(
                session_id="conversation-1",
                request_id="request-1",
                value="up",
            ),
            user_id=None,
            anonymous_token_hash="a" * 64,
        )

        self.assertEqual(result.value, "up")

    async def test_omits_empty_optional_session_fields(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertNotIn("audience", request.content.decode())
            self.assertNotIn("comment", request.content.decode())
            return httpx.Response(
                201,
                json={
                    "id": "feedback-2",
                    "session_id": "conversation-1",
                    "submission_id": "submission-1",
                    "review_status": "new",
                    "created_at": "2026-07-29T12:05:00Z",
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

        result = await client.create_session_feedback(
            VeraFeedbackSchema(
                session_id="conversation-1",
                submission_id="submission-1",
            ),
            user_id=None,
            anonymous_token_hash="a" * 64,
        )

        self.assertEqual(result.submission_id, "submission-1")

    async def test_preserves_agent_error_status_and_detail(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                409,
                json={"detail": "Ответ ещё не завершён."},
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

        with self.assertRaises(VeraAgentServiceError) as context:
            await client.set_message_feedback(
                VeraMessageFeedbackSchema(
                    session_id="conversation-1",
                    request_id="request-1",
                    value="down",
                ),
                user_id=None,
                anonymous_token_hash="a" * 64,
            )

        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(context.exception.detail, "Ответ ещё не завершён.")


if __name__ == "__main__":
    unittest.main()
