import base64
import json
import unittest

from src.exceptions.services import VeraStreamTicketServiceError
from src.services.vera_stream_ticket import VeraStreamTicketIssuer


GOLDEN_TICKET = (
    "eyJleHAiOjE3MDAwMDAwNjAsInJlcXVlc3RfaWQiOiJyZXF1ZXN0LTEiLCJzZXNzaW9uX2lk"
    "Ijoic2Vzc2lvbi0xIiwidXNlcl9pZCI6InVzZXJAZXhhbXBsZS5jb20ifQ."
    "e7TqCWduSK_4Rqwqus697QWRJMt-4JTdjtcVrPFEoEA"
)


def _decode_payload(ticket: str) -> dict:
    encoded_payload = ticket.split(".", 1)[0]
    payload = base64.urlsafe_b64decode(
        encoded_payload + "=" * (-len(encoded_payload) % 4)
    )
    return json.loads(payload)


class VeraStreamTicketIssuerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.issuer = VeraStreamTicketIssuer("shared-test-key")

    def test_issues_stable_ticket_bound_to_user_request_and_session(self) -> None:
        ticket = self.issuer.issue(
            request_id="request-1",
            session_id="session-1",
            user_id="user@example.com",
            anonymous_token_hash=None,
            now=1_700_000_000,
        )

        self.assertEqual(ticket, GOLDEN_TICKET)
        self.assertEqual(
            _decode_payload(ticket),
            {
                "exp": 1_700_000_060,
                "request_id": "request-1",
                "session_id": "session-1",
                "user_id": "user@example.com",
            },
        )

    def test_issues_ticket_for_anonymous_owner(self) -> None:
        ticket = self.issuer.issue(
            request_id="request-1",
            session_id="session-1",
            user_id=None,
            anonymous_token_hash="a" * 64,
            now=1_700_000_000,
        )

        payload = _decode_payload(ticket)
        self.assertEqual(payload["anonymous_token_hash"], "a" * 64)
        self.assertNotIn("user_id", payload)

    def test_authenticated_owner_wins_during_anonymous_session_promotion(self) -> None:
        ticket = self.issuer.issue(
            request_id="request-1",
            session_id="session-1",
            user_id="user@example.com",
            anonymous_token_hash="a" * 64,
            now=1_700_000_000,
        )

        payload = _decode_payload(ticket)
        self.assertEqual(payload["user_id"], "user@example.com")
        self.assertNotIn("anonymous_token_hash", payload)

    def test_rejects_request_without_owner(self) -> None:
        with self.assertRaises(VeraStreamTicketServiceError):
            self.issuer.issue(
                request_id="request-1",
                session_id="session-1",
                user_id=None,
                anonymous_token_hash=None,
                now=1_700_000_000,
            )


if __name__ == "__main__":
    unittest.main()
