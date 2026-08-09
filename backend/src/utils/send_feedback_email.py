import asyncio
import logging
from email.message import Message
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

import aiosmtplib

from src.core.settings import get_settings
from src.utils.send_otp_code.message_template import FEEDBACK_MESSAGE

settings = get_settings()
logger = logging.getLogger(__name__)


async def _send_feedback_message(
        msg: Message,
        *,
        log_name: str,
        retries: int,
        delay: int,
) -> None:
    """Отправляет подготовленное письмо, повторяя временно неудачные попытки."""
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            logger.info("📧 Попытка %s/%s отправки %s...", attempt, retries, log_name)
            async with aiosmtplib.SMTP(
                hostname=settings.email.host_name.get_secret_value(),
                port=settings.email.port,
                use_tls=True,
            ) as server:
                await server.login(
                    settings.email.from_email.get_secret_value(),
                    settings.email.application_key.get_secret_value(),
                )
                await server.send_message(msg)
                logger.info("✅ Письмо (%s) успешно отправлено.", log_name)
                return
        except ConnectionRefusedError as error:
            last_error = error
            logger.exception("❌ Попытка %s — не удалось подключиться к SMTP.", attempt)
        except aiosmtplib.SMTPException as error:
            last_error = error
            logger.exception("❌ SMTP ошибка на попытке %s.", attempt)
        except Exception as error:
            last_error = error
            logger.exception("❌ Непредвиденная ошибка на попытке %s.", attempt)

        if attempt < retries:
            await asyncio.sleep(delay)

    logger.error("❌ Не удалось отправить %s после %s попыток.", log_name, retries)
    raise RuntimeError(f"Не удалось отправить {log_name}.") from last_error


async def send_feedback_email(
        message: str,
        reply_email: str | None,
        page: str | None,
        retries: int = 3,
        delay: int = 1,
) -> None:
    """Отправляет письмо с обратной связью администратору."""
    to_email = settings.email.feedback_email.get_secret_value()
    logger.info("📧 Отправка обратной связи на %s.", to_email)

    msg = MIMEMultipart()
    msg["From"] = settings.email.from_email.get_secret_value()
    msg["To"] = to_email
    msg["Subject"] = "Обратная связь — Работа для всех"
    msg.attach(
        MIMEText(
            FEEDBACK_MESSAGE.format(
                message=escape(message),
                reply_email=escape(reply_email or "не указан"),
                page=escape(page or "не указана"),
            ),
            "html",
        )
    )

    await _send_feedback_message(
        msg,
        log_name="обратную связь",
        retries=retries,
        delay=delay,
    )
