import base64
import hashlib
import hmac
import json
import time
import unittest

from src.core.settings import get_settings
from src.exceptions.services import VeraSessionTokenError
from src.services.vera_session_access import resolve_vera_session_access


def _token(session_id: str, expires_at: int) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps(
            {
                "session_id": session_id,
                "nonce": "test-nonce",
                "exp": expires_at,
            },
            separators=(",", ":"),
        ).encode()
    ).decode().rstrip("=")
    secret = get_settings().vera.session_signing_key.get_secret_value().encode()
    signature = base64.urlsafe_b64encode(
        hmac.new(secret, payload.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{payload}.{signature}"


class VeraSessionAccessTests(unittest.TestCase):
    def test_accepts_signed_anonymous_session(self) -> None:
        token = _token("session-1", int(time.time()) + 60)

        access = resolve_vera_session_access(
            session_id="session-1",
            user_payload=None,
            anonymous_token=token,
        )

        self.assertIsNone(access.user_id)
        self.assertEqual(
            access.anonymous_token_hash,
            hashlib.sha256(token.encode()).hexdigest(),
        )

    def test_rejects_token_for_another_session(self) -> None:
        token = _token("session-1", int(time.time()) + 60)

        with self.assertRaises(VeraSessionTokenError):
            resolve_vera_session_access(
                session_id="session-2",
                user_payload=None,
                anonymous_token=token,
            )

    def test_rejects_expired_token(self) -> None:
        with self.assertRaises(VeraSessionTokenError):
            resolve_vera_session_access(
                session_id="session-1",
                user_payload=None,
                anonymous_token=_token("session-1", int(time.time()) - 1),
            )

    def test_accepts_authenticated_user_without_anonymous_token(self) -> None:
        access = resolve_vera_session_access(
            session_id="session-1",
            user_payload={"sub": "user-1"},
            anonymous_token=None,
        )

        self.assertEqual(access.user_id, "user-1")
        self.assertIsNone(access.anonymous_token_hash)


if __name__ == "__main__":
    unittest.main()
