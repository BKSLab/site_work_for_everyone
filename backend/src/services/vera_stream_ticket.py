import base64
import hashlib
import hmac
import json
import time

from src.exceptions.services import VeraStreamTicketServiceError


STREAM_TICKET_CONTEXT = b"vera-stream-ticket"
STREAM_TICKET_TTL_SECONDS = 60


class VeraStreamTicketIssuer:
    """Выпускает короткоживущие ticket для прямого SSE-подключения."""

    def __init__(self, api_key: str):
        if not api_key:
            raise VeraStreamTicketServiceError("VERA_AGENT_API_KEY не задан")
        self._signing_key = hmac.new(
            api_key.encode(),
            STREAM_TICKET_CONTEXT,
            hashlib.sha256,
        ).digest()

    def issue(
        self,
        *,
        request_id: str,
        session_id: str,
        user_id: str | None,
        anonymous_token_hash: str | None,
        now: int | None = None,
    ) -> str:
        """Подписывает данные запроса и ровно одного владельца.

        Args:
            request_id: Идентификатор пары вопрос/ответ.
            session_id: Идентификатор диалога.
            user_id: Владелец авторизованной сессии.
            anonymous_token_hash: Владелец анонимной сессии.
            now: Текущее Unix-время для детерминированных тестов.

        Returns:
            Base64url ticket с HMAC-SHA256 подписью.

        Raises:
            VeraStreamTicketServiceError: Владелец запроса не определён однозначно.
        """
        if not user_id and not anonymous_token_hash:
            raise VeraStreamTicketServiceError(
                "Для stream ticket не определён владелец"
            )

        issued_at = int(time.time()) if now is None else now
        payload = {
            "request_id": request_id,
            "session_id": session_id,
            "exp": issued_at + STREAM_TICKET_TTL_SECONDS,
        }
        # После входа запрос может одновременно содержать user_id и claim
        # прежней anonymous-сессии. Каноническим владельцем ticket становится
        # уже проверенный JWT-пользователь; в payload всё равно попадает ровно
        # один owner identifier.
        if user_id:
            payload["user_id"] = user_id
        else:
            payload["anonymous_token_hash"] = anonymous_token_hash

        encoded_payload = _encode_base64url(
            json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode()
        )
        signature = hmac.new(
            self._signing_key,
            encoded_payload.encode(),
            hashlib.sha256,
        ).digest()
        return f"{encoded_payload}.{_encode_base64url(signature)}"


def _encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")
