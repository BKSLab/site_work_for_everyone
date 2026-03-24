import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from src.core.settings import get_settings
from src.utils.send_otp_code.message_template import FEEDBACK_MESSAGE

settings = get_settings()
logger = logging.getLogger(__name__)


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
                message=message,
                reply_email=reply_email or "не указан",
                page=page or "не указана",
            ),
            "html",
        )
    )

    for attempt in range(1, retries + 1):
        try:
            logger.info("📧 Попытка %s/%s отправки обратной связи...", attempt, retries)
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
                logger.info("✅ Обратная связь успешно отправлена.")
                return
        except ConnectionRefusedError:
            logger.exception("❌ Попытка %s — не удалось подключиться к SMTP.", attempt)
        except aiosmtplib.SMTPException:
            logger.exception("❌ SMTP ошибка на попытке %s.", attempt)
        except Exception:
            logger.exception("❌ Непредвиденная ошибка на попытке %s.", attempt)
        if attempt < retries:
            await asyncio.sleep(delay)

    logger.error("❌ Не удалось отправить обратную связь после %s попыток.", retries)
