import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from src.core.settings import get_settings
from src.exceptions.services import VeraSessionTokenError


@dataclass(frozen=True)
class VeraSessionAccess:
    user_id: str | None
    anonymous_token_hash: str | None


def resolve_vera_session_access(
    *,
    session_id: str,
    user_payload: dict | None,
    anonymous_token: str | None,
) -> VeraSessionAccess:
    """Проверяет JWT-пользователя или подписанный токен анонимной сессии."""
    user_id = user_payload.get("sub") if user_payload else None
    if anonymous_token is None and user_id is not None:
        return VeraSessionAccess(user_id=user_id, anonymous_token_hash=None)
    if anonymous_token is None:
        raise VeraSessionTokenError

    try:
        encoded_payload, provided_signature = anonymous_token.split(".", 1)
        secret = (
            get_settings()
            .vera.session_signing_key.get_secret_value()
            .encode()
        )
        expected_signature = hmac.new(
            secret,
            encoded_payload.encode(),
            hashlib.sha256,
        ).digest()
        signature = base64.urlsafe_b64decode(
            provided_signature + "=" * (-len(provided_signature) % 4)
        )
        if not hmac.compare_digest(signature, expected_signature):
            raise VeraSessionTokenError

        payload_bytes = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        payload = json.loads(payload_bytes)
        if (
            payload.get("session_id") != session_id
            or not isinstance(payload.get("exp"), int)
            or payload["exp"] < int(time.time())
        ):
            raise VeraSessionTokenError
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise VeraSessionTokenError from error

    return VeraSessionAccess(
        user_id=user_id,
        anonymous_token_hash=hashlib.sha256(anonymous_token.encode()).hexdigest(),
    )
