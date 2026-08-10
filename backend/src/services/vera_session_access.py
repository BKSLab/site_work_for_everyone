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


@dataclass(frozen=True)
class VeraSessionLifecycleAccess:
    """Проверенные owner-данные для server-side resolve сессии."""

    user_id: str | None
    anonymous_token_hash: str
    refreshed_anonymous_token_hash: str
    replacement_anonymous_token_hash: str


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

    anonymous_token_hash = _verify_and_hash_session_token(
        session_id=session_id,
        anonymous_token=anonymous_token,
    )
    return VeraSessionAccess(
        user_id=user_id,
        anonymous_token_hash=anonymous_token_hash,
    )


def resolve_vera_session_lifecycle_access(
    *,
    session_id: str,
    replacement_session_id: str,
    user_payload: dict | None,
    anonymous_token: str,
    refreshed_anonymous_token: str,
    replacement_anonymous_token: str,
) -> VeraSessionLifecycleAccess:
    """Проверяет все токены handshake жизненного цикла сессии.

    Args:
        session_id: Идентификатор текущей сессии.
        replacement_session_id: Кандидат новой сессии при истёкшем контексте.
        user_payload: Payload проверенного JWT либо ``None``.
        anonymous_token: Текущий подписанный owner-token.
        refreshed_anonymous_token: Новый owner-token текущей сессии.
        replacement_anonymous_token: Owner-token replacement-сессии.

    Returns:
        Идентификатор пользователя и SHA-256 хеши проверенных токенов.

    Raises:
        VeraSessionTokenError: Один из токенов невалиден или выпущен для
            другого идентификатора сессии.
    """
    return VeraSessionLifecycleAccess(
        user_id=user_payload.get("sub") if user_payload else None,
        anonymous_token_hash=_verify_and_hash_session_token(
            session_id=session_id,
            anonymous_token=anonymous_token,
            allow_expired=True,
        ),
        refreshed_anonymous_token_hash=_verify_and_hash_session_token(
            session_id=session_id,
            anonymous_token=refreshed_anonymous_token,
        ),
        replacement_anonymous_token_hash=_verify_and_hash_session_token(
            session_id=replacement_session_id,
            anonymous_token=replacement_anonymous_token,
        ),
    )


def _verify_and_hash_session_token(
    *,
    session_id: str,
    anonymous_token: str,
    allow_expired: bool = False,
) -> str:
    """Проверяет подпись, привязку и допустимый срок токена.

    Истёкший current proof принимается только lifecycle-handshake: он не даёт
    читать историю или сохранять feedback, но позволяет Agent Service
    безопасно закрыть принадлежащую владельцу stale-сессию и выдать successor.
    """
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
        expires_at = payload.get("exp")
        if (
            payload.get("session_id") != session_id
            or not isinstance(expires_at, int)
            or (not allow_expired and expires_at < int(time.time()))
        ):
            raise VeraSessionTokenError
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise VeraSessionTokenError from error

    return hashlib.sha256(anonymous_token.encode()).hexdigest()
