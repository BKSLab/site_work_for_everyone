import unittest

import httpx
from fastapi import FastAPI

from src.api.vera import router as vera_router
from src.core.limiter import limiter
from src.dependencies.jwt import get_optional_user_payload
from src.dependencies.vera import get_vera_agent_client
from src.services.vera_agent import VeraAgentClient


def _build_test_app(agent_client: VeraAgentClient | None = None) -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(vera_router, prefix="/api")
    app.dependency_overrides[get_optional_user_payload] = (
        lambda: {"sub": "user@example.com"}
    )
    app.dependency_overrides[get_vera_agent_client] = lambda: agent_client
    return app


class VeraHistoryContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        limiter.reset()

    async def asyncTearDown(self) -> None:
        limiter.reset()

    async def _request_agent_error(
        self,
        status_code: int,
        detail: str,
    ) -> httpx.Response:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(
                request.url.path,
                "/api/v1/chat/sessions/missing-session/history",
            )
            self.assertEqual(
                request.headers["X-Vera-User-ID"],
                "user@example.com",
            )
            return httpx.Response(status_code, json={"detail": detail})

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            headers={"X-API-Key": "secret"},
            transport=httpx.MockTransport(handler),
        )
        agent_client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(agent_client.close)
        app = _build_test_app(agent_client)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.get("/api/vera/history/missing-session")

    async def test_backend_preserves_agent_history_404_and_detail(self) -> None:
        detail = "Сессия missing-session не найдена."

        response = await self._request_agent_error(404, detail)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": detail})

    async def test_backend_preserves_agent_history_403_and_detail(self) -> None:
        detail = "Нет доступа к этой сессии."

        response = await self._request_agent_error(403, detail)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": detail})

    async def test_backend_preserves_used_knowledge_base_flag(self) -> None:
        """Бэкенд валидирует ответ агента своей схемой и сериализует его
        заново, поэтому неизвестное ей поле молча исчезает. Признак
        использования базы знаний обязан дойти до фронтенда — по нему
        показывается кнопка «Объяснить проще»."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "session_id": "session-1",
                    "turns": [
                        {
                            "request_id": "request-1",
                            "sequence_number": 1,
                            "question": "Какая квота?",
                            "answer": "Квота составляет 2%.",
                            "status": "completed",
                            "feedback_value": None,
                            "used_knowledge_base": True,
                            "created_at": "2026-08-12T12:00:00Z",
                            "completed_at": "2026-08-12T12:00:05Z",
                        }
                    ],
                    "next_before_sequence": None,
                },
            )

        http_client = httpx.AsyncClient(
            base_url="http://agent.test",
            headers={"X-API-Key": "secret"},
            transport=httpx.MockTransport(handler),
        )
        agent_client = VeraAgentClient(
            api_url="http://agent.test",
            api_key="secret",
            http_client=http_client,
        )
        self.addAsyncCleanup(agent_client.close)
        app = _build_test_app(agent_client)
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.get("/api/vera/history/session-1")

        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["turns"][0]["used_knowledge_base"], True)

    def test_openapi_declares_history_403_and_404(self) -> None:
        responses = _build_test_app().openapi()["paths"][
            "/api/vera/history/{session_id}"
        ]["get"]["responses"]

        self.assertEqual(
            responses["403"]["description"],
            "Сессия принадлежит другому владельцу.",
        )
        self.assertEqual(responses["404"]["description"], "Сессия не найдена.")


if __name__ == "__main__":
    unittest.main()
