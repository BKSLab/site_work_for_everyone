import asyncio
import logging
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiosmtplib

from src.core.settings import get_settings
from src.exceptions.users import SendOtpCodeError
from src.utils.send_otp_code.get_otp_code import generate_verified_code

settings = get_settings()
logger = logging.getLogger(__name__)

_VERA_AVATAR_PATH = Path(__file__).resolve().parent.parent.parent.parent / "static" / "vera_avatar.png"


async def send_otp_code_by_email(
        user_name: str,
        user_email: str,
        message_template: str,
        subject: str,
        retries: int = 4,
        delay: int = 1
) -> str:
    """Функция отправки пользователю кода для идентификации."""
    logger.info("📧 Отправка OTP-кода на адрес: %s.", user_email)
    verified_code = generate_verified_code()

    msg = MIMEMultipart("related")
    msg["From"] = settings.email.from_email.get_secret_value()
    msg["To"] = user_email
    msg["Subject"] = subject

    html_part = MIMEText(
        message_template.format(
            user_name=user_name,
            otp_code=verified_code
        ), "html"
    )
    msg.attach(html_part)

    # Прикрепляем аватар Веры как inline-изображение (CID)
    if _VERA_AVATAR_PATH.exists():
        with open(_VERA_AVATAR_PATH, "rb") as f:
            img = MIMEImage(f.read(), _subtype="png")
        img.add_header("Content-ID", "<vera_avatar>")
        img.add_header("Content-Disposition", "inline", filename="vera_avatar.png")
        msg.attach(img)

    last_attempt = 0
    for attempt in range(1, retries):
        last_attempt = attempt
        try:
            logger.info("📧 Попытка %s/%s отправки письма на %s...", attempt, retries, user_email)
            async with aiosmtplib.SMTP(
                hostname=settings.email.host_name.get_secret_value(),
                port=settings.email.port,
                use_tls=True
            ) as server:
                await server.login(
                    settings.email.from_email.get_secret_value(),
                    settings.email.application_key.get_secret_value()
                )
                await server.send_message(msg)
                return verified_code
        except ConnectionRefusedError:
            logger.exception("❌ Попытка %s — не удалось подключиться к SMTP-серверу.", attempt)
        except aiosmtplib.SMTPException:
            logger.exception("❌ SMTP ошибка на попытке %s.", attempt)
        except Exception:
            logger.exception("❌ Непредвиденная ошибка на попытке %s.", attempt)
        if attempt < retries:
            logger.info("⏳ Ожидание %s сек. перед следующей попыткой...", delay)
            await asyncio.sleep(delay)
    logger.error("❌ Не удалось отправить письмо на %s после %s попыток.", user_email, last_attempt)
    raise SendOtpCodeError(email=user_email)
