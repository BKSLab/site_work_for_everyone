import logging
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import ValidationError

from src.exceptions.services import VeraAgentServiceError
from src.schemas.vera import (
    VeraChatHistoryResponseSchema,
    VeraChatSessionResolveRequestSchema,
    VeraChatSessionResolveResponseSchema,
    VeraCurrentChatSessionResponseSchema,
    VeraFeedbackResponseSchema,
    VeraFeedbackSchema,
    VeraMessageFeedbackResponseSchema,
    VeraMessageFeedbackSchema,
)


logger = logging.getLogger(__name__)


class VeraAgentClient:
    """HTTP-клиент серверного API Agent Service."""

    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        http_client: httpx.AsyncClient | None = None,
    ):
        self._client = http_client or httpx.AsyncClient(
            base_url=api_url.rstrip("/"),
            headers={
                "Content-Type": "application/json",
                "X-API-Key": api_key,
            },
            timeout=httpx.Timeout(15.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def set_message_feedback(
        self,
        data: VeraMessageFeedbackSchema,
        *,
        user_id: str | None,
        anonymous_token_hash: str | None,
    ) -> VeraMessageFeedbackResponseSchema:
        payload = await self._request(
            method="PUT",
            path="/api/v1/feedback/message",
            body=data.model_dump(mode="json"),
            headers=self._access_headers(user_id, anonymous_token_hash),
        )
        return VeraMessageFeedbackResponseSchema.model_validate(payload)

    async def get_chat_history(
        self,
        session_id: str,
        *,
        user_id: str | None,
        anonymous_token_hash: str | None,
        limit: int,
        before_sequence: int | None,
    ) -> VeraChatHistoryResponseSchema:
        encoded_session_id = quote(session_id, safe="")
        params = {"limit": limit}
        if before_sequence is not None:
            params["before_sequence"] = before_sequence
        payload = await self._request(
            method="GET",
            path=f"/api/v1/chat/sessions/{encoded_session_id}/history",
            headers=self._access_headers(user_id, anonymous_token_hash),
            params=params,
        )
        return VeraChatHistoryResponseSchema.model_validate(payload)

    async def get_current_chat_session(
        self,
        *,
        user_id: str,
    ) -> VeraCurrentChatSessionResponseSchema:
        payload = await self._request(
            method="GET",
            path="/api/v1/chat/sessions/current",
            headers=self._access_headers(user_id, None),
        )
        return VeraCurrentChatSessionResponseSchema.model_validate(payload)

    async def resolve_chat_session(
        self,
        data: VeraChatSessionResolveRequestSchema,
        *,
        user_id: str | None,
        anonymous_token_hash: str,
        refreshed_anonymous_token_hash: str,
        replacement_anonymous_token_hash: str,
    ) -> VeraChatSessionResolveResponseSchema:
        """Определяет активную сессию до публикации сообщения.

        Args:
            data: Текущий и заранее выпущенный replacement session ID.
            user_id: Идентификатор авторизованного владельца.
            anonymous_token_hash: Хеш подписанного токена текущей сессии.
            refreshed_anonymous_token_hash: Хеш нового токена текущей сессии.
            replacement_anonymous_token_hash: Хеш токена replacement-сессии.

        Returns:
            Серверное решение о границе диалога и эффективной сессии.
        """
        headers = self._access_headers(user_id, anonymous_token_hash)
        headers.update(
            {
                "X-Vera-Refreshed-Anonymous-Token-Hash": (
                    refreshed_anonymous_token_hash
                ),
                "X-Vera-Replacement-Anonymous-Token-Hash": (
                    replacement_anonymous_token_hash
                ),
            }
        )
        payload = await self._request(
            method="POST",
            path="/api/v1/chat/sessions/resolve",
            body=data.model_dump(mode="json"),
            headers=headers,
        )
        try:
            resolution = VeraChatSessionResolveResponseSchema.model_validate(
                payload
            )
        except ValidationError as error:
            raise VeraAgentServiceError(
                status_code=502,
                detail="Agent Service вернул некорректную границу диалога.",
                error_details="Lifecycle response schema validation failed.",
            ) from error
        if resolution.boundary == "expired":
            is_bound = (
                resolution.session_id == data.replacement_session_id
                and resolution.previous_session_id == data.session_id
            )
        else:
            is_bound = (
                resolution.session_id == data.session_id
                and resolution.previous_session_id is None
            )
        if not is_bound:
            raise VeraAgentServiceError(
                status_code=502,
                detail="Agent Service вернул некорректную границу диалога.",
                error_details=(
                    "Lifecycle response is not bound to requested current "
                    "and replacement session IDs."
                ),
            )
        return resolution

    async def create_session_feedback(
        self,
        data: VeraFeedbackSchema,
        *,
        user_id: str | None,
        anonymous_token_hash: str | None,
    ) -> VeraFeedbackResponseSchema:
        payload = await self._request(
            method="POST",
            path="/api/v1/feedback/session",
            body=data.model_dump(mode="json", exclude_none=True),
            headers=self._access_headers(user_id, anonymous_token_hash),
        )
        return VeraFeedbackResponseSchema.model_validate(payload)

    async def _request(
        self,
        *,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        params: dict[str, int] | None = None,
    ) -> Any:
        try:
            request_kwargs = {"json": body} if body is not None else {}
            response = await self._client.request(
                method,
                path,
                headers=headers,
                params=params,
                **request_kwargs,
            )
        except httpx.TimeoutException as error:
            raise VeraAgentServiceError(
                status_code=504,
                detail="Agent Service не отвечает. Попробуйте позже.",
                error_details=f"Timeout for {method} {path}.",
            ) from error
        except httpx.RequestError as error:
            raise VeraAgentServiceError(
                status_code=502,
                detail="Не удалось соединиться с Agent Service.",
                error_details=f"Connection error for {method} {path}: {error}",
            ) from error

        try:
            payload = response.json()
        except ValueError as error:
            raise VeraAgentServiceError(
                status_code=502,
                detail="Agent Service вернул некорректный ответ.",
                error_details=(
                    f"Non-JSON response for {method} {path}, "
                    f"status={response.status_code}."
                ),
            ) from error

        if not response.is_success:
            detail = (
                payload.get("detail", "Agent Service отклонил запрос.")
                if isinstance(payload, dict)
                else "Agent Service отклонил запрос."
            )
            raise VeraAgentServiceError(
                status_code=response.status_code,
                detail=detail,
                error_details=(
                    f"Agent Service returned {response.status_code} "
                    f"for {method} {path}."
                ),
            )

        logger.info(
            "Запрос к Agent Service выполнен: %s %s, status=%s.",
            method,
            path,
            response.status_code,
        )
        return payload

    @staticmethod
    def _access_headers(
        user_id: str | None,
        anonymous_token_hash: str | None,
    ) -> dict[str, str]:
        headers: dict[str, str] = {}
        if user_id is not None:
            headers["X-Vera-User-ID"] = user_id
        if anonymous_token_hash is not None:
            headers["X-Vera-Anonymous-Token-Hash"] = anonymous_token_hash
        return headers
