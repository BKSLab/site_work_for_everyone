import json
import unittest

from pydantic import ValidationError

from src.schemas.vera import (
    VeraChatRequestSchema,
    VeraFeedbackSchema,
    VeraMessageFeedbackSchema,
)
from src.services.vera_publisher import VeraPublisher


class _FakeExchange:
    def __init__(self) -> None:
        self.message = None
        self.routing_key = None

    async def publish(self, message, routing_key: str) -> None:
        self.message = message
        self.routing_key = routing_key


class _FakeChannel:
    def __init__(self) -> None:
        self.default_exchange = _FakeExchange()


class _FakeConnection:
    async def close(self) -> None:
        return None


class VeraRequestSchemaTests(unittest.TestCase):
    def test_request_id_is_required(self) -> None:
        with self.assertRaises(ValidationError):
            VeraChatRequestSchema(session_id="conversation-1", message="Вопрос")


class VeraFeedbackSchemaTests(unittest.TestCase):
    def test_questionnaire_answers_are_optional(self) -> None:
        feedback = VeraFeedbackSchema(
            session_id="conversation-1",
            submission_id="submission-1",
        )

        self.assertIsNone(feedback.audience)
        self.assertIsNone(feedback.usefulness)
        self.assertIsNone(feedback.trust)
        self.assertIsNone(feedback.comment)
        self.assertIsNone(feedback.contact_email)

    def test_rating_must_use_the_five_point_scale(self) -> None:
        with self.assertRaises(ValidationError):
            VeraFeedbackSchema(
                session_id="conversation-1",
                submission_id="submission-1",
                usefulness=6,
            )

    def test_contact_email_must_be_valid_when_provided(self) -> None:
        with self.assertRaises(ValidationError):
            VeraFeedbackSchema(
                session_id="conversation-1",
                submission_id="submission-1",
                contact_email="not-an-email",
            )

    def test_submission_id_is_required(self) -> None:
        with self.assertRaises(ValidationError):
            VeraFeedbackSchema(session_id="conversation-1")

    def test_agent_service_audience_values_are_used(self) -> None:
        feedback = VeraFeedbackSchema(
            session_id="conversation-1",
            submission_id="submission-1",
            audience="seeker",
        )
        self.assertEqual(feedback.audience, "seeker")

        with self.assertRaises(ValidationError):
            VeraFeedbackSchema(
                session_id="conversation-1",
                submission_id="submission-2",
                audience="person_with_disability",
            )


class VeraMessageFeedbackSchemaTests(unittest.TestCase):
    def test_accepts_up_and_down_values(self) -> None:
        for value in ("up", "down"):
            feedback = VeraMessageFeedbackSchema(
                session_id="conversation-1",
                request_id="request-1",
                value=value,
            )
            self.assertEqual(feedback.value, value)

    def test_rejects_unknown_value(self) -> None:
        with self.assertRaises(ValidationError):
            VeraMessageFeedbackSchema(
                session_id="conversation-1",
                request_id="request-1",
                value="neutral",
            )


class VeraPublisherTests(unittest.IsolatedAsyncioTestCase):
    async def test_request_id_is_published_with_session_id(self) -> None:
        channel = _FakeChannel()
        publisher = VeraPublisher(
            connection=_FakeConnection(),
            channel=channel,
            queue_name="agent.requests",
        )

        with self.assertLogs(
            "src.services.vera_publisher",
            level="INFO",
        ) as captured_logs:
            await publisher.publish_agent_request(
                session_id="conversation-1",
                request_id="request-1",
                user_id=None,
                anonymous_token_hash="a" * 64,
                message="Вопрос",
            )

        payload = json.loads(channel.default_exchange.message.body)
        self.assertEqual(
            payload,
            {
                "session_id": "conversation-1",
                "request_id": "request-1",
                "user_id": None,
                "anonymous_token_hash": "a" * 64,
                "message": "Вопрос",
            },
        )
        self.assertEqual(channel.default_exchange.routing_key, "agent.requests")
        combined_logs = "\n".join(captured_logs.output)
        self.assertIn("queue=agent.requests", combined_logs)
        self.assertIn("session_id=conversation-1", combined_logs)
        self.assertIn("request_id=request-1", combined_logs)
        self.assertIn(
            "Запрос агенту «Вера» опубликован в RabbitMQ",
            combined_logs,
        )

    async def test_logs_do_not_contain_question_or_owner(self) -> None:
        """Диагностика идёт по идентификаторам, персональные данные в логи
        не попадают: текст вопроса, email владельца и хеш токена анонимной
        сессии остаются только в payload очереди."""
        channel = _FakeChannel()
        publisher = VeraPublisher(
            connection=_FakeConnection(),
            channel=channel,
            queue_name="agent.requests",
        )
        question = "Меня уволили из-за инвалидности, что делать?"
        owner_email = "user@example.com"
        token_hash = "b" * 64

        with self.assertLogs(
            "src.services.vera_publisher",
            level="INFO",
        ) as captured_logs:
            await publisher.publish_agent_request(
                session_id="conversation-1",
                request_id="request-1",
                user_id=owner_email,
                anonymous_token_hash=token_hash,
                message=question,
            )

        combined_logs = "\n".join(captured_logs.output)
        self.assertNotIn(question, combined_logs)
        self.assertNotIn(owner_email, combined_logs)
        self.assertNotIn(token_hash, combined_logs)
        self.assertIn("authenticated=True", combined_logs)
        self.assertIn(f"message_length={len(question)}", combined_logs)

        # Сам payload очереди не урезается — ограничение касается только логов.
        payload = json.loads(channel.default_exchange.message.body)
        self.assertEqual(payload["user_id"], owner_email)
        self.assertEqual(payload["message"], question)


if __name__ == "__main__":
    unittest.main()
