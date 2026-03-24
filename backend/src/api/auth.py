import logging

from fastapi import APIRouter, HTTPException, Request, status

from src.core.limiter import limiter
from src.dependencies.jwt import (
    CurrentUserPayloadDep,
    JWTManagerDep,
    get_current_refresh_payload,
)
from src.dependencies.services import BlocklistServiceDep, UsersServiceDep
from src.exceptions.jwt_manager import JWTManagerError
from src.exceptions.repositories import BlocklistRepositoryError, UsersRepositoryError
from src.exceptions.services import BlocklistServiceError, UsersServiceError
from src.exceptions.users import (
    EmailNotVerifiedError,
    ExpiredCodeError,
    InvalidCodeError,
    InvalidCredentialsError,
    SendOtpCodeError,
    UserAlreadyExists,
    UserAlreadyVerified,
    UserInactiveError,
    UserNotFound,
)
from src.schemas.users import (
    EmailOnlySchema,
    EmailVerifySchema,
    FeedbackSchema,
    ForgotPasswordRequestSchema,
    MsgSchema,
    RefreshTokenRequestSchema,
    ResetPasswordRequestSchema,
    TokenResponseSchema,
    UserLoginSchema,
    UserRegisterSchema,
)
from src.utils.create_token import create_token_pair
from src.utils.send_feedback_email import send_feedback_email


router = APIRouter(prefix='/auth', tags=['Auth'],)
logger = logging.getLogger(__name__)


@router.post(
    path="/register",
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация нового пользователя",
    description="Регистрирует нового пользователя, отправляя код подтверждения на email.",
    operation_id="userRegister",
    response_description="Сообщение об успешной регистрации",
    responses={
        201: {
            "description": "Пользователь успешно зарегистрирован, код подтверждения отправлен.",
            "content": {
                "application/json": {
                    "example": {
                        "msg": "User registered successfully. Check your email for verification code."
                    }
                }
            },
        },
        409: {
            "description": "Пользователь с таким email уже существует.",
            "content": {
                "application/json": {
                    "example": {"detail": "A user with this email already exists."}
                }
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "An internal error occurred during user registration."
                    }
                }
            },
        },
    },
    response_model=MsgSchema,
)
@limiter.limit("5/hour")
async def user_register(
    request: Request, data: UserRegisterSchema, users_service: UsersServiceDep
):
    """Регистрирует нового пользователя и отправляет код верификации.

    - Сохраняет пользователя в базе данных с флагом `is_verified=False`.
    - Отправляет на указанный `email` письмо с кодом подтверждения.

    Args:
        request: Объект запроса FastAPI.
        data: Данные для регистрации пользователя (username, email, password).
        users_service: Сервис для работы с пользователями.

    Returns:
        Сообщение об успешной регистрации.
    """
    logger.info("👤 /register — старт регистрации для %s.", data.email)
    try:
        await users_service.register_user_handler(user_data=data)
        logger.info("✅ /register — пользователь %s успешно зарегистрирован.", data.email)
        return MsgSchema(
            msg="User registered successfully. Check your email for verification code."
        )
    except (
        UsersRepositoryError,
        UserAlreadyExists,
        UsersServiceError,
        SendOtpCodeError,
    ) as error:
        logger.exception("❌ /register — ошибка для %s: %s", data.email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/resend-verification-code",
    status_code=status.HTTP_200_OK,
    summary="Повторная отправка кода верификации",
    description="Повторно отправляет код верификации на email пользователя.",
    operation_id="resendVerificationCode",
    response_description="Сообщение об успешной повторной отправке кода",
    responses={
        200: {
            "description": "Код верификации успешно отправлен повторно.",
            "content": {
                "application/json": {
                    "example": {
                        "msg": "Verification code re-sent successfully. Check your email."
                    }
                }
            },
        },
        404: {
            "description": "Пользователь с указанным email не найден.",
            "content": {
                "application/json": {
                    "example": {"detail": "User with the specified email was not found."}
                }
            },
        },
        409: {
            "description": "Пользователь уже прошел верификацию.",
            "content": {
                "application/json": {"example": {"detail": "User has already been verified."}}
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "An internal error occurred while resending the code."
                    }
                }
            },
        },
    },
    response_model=MsgSchema,
)
@limiter.limit("3/hour")
async def resend_verification_code(
    request: Request, data: EmailOnlySchema, users_service: UsersServiceDep
):
    """Повторно отправляет код верификации.

    - Проверяет, что пользователь существует и еще не верифицирован.
    - Генерирует и отправляет новый код на указанный `email`.

    Args:
        request: Объект запроса FastAPI.
        data: Email пользователя.
        users_service: Сервис для работы с пользователями.

    Returns:
        Сообщение об успешной отправке кода.
    """
    logger.info("📧 /resend-verification-code — старт для %s.", data.email)
    try:
        await users_service.resend_verification_code(email=data.email)
        logger.info("✅ /resend-verification-code — код повторно отправлен для %s.", data.email)
        return MsgSchema(
            msg="Verification code re-sent successfully. Check your email."
        )
    except (
        UsersRepositoryError,
        UserNotFound,
        UserAlreadyVerified,
        SendOtpCodeError,
    ) as error:
        logger.exception("❌ /resend-verification-code — ошибка для %s: %s", data.email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Запрос на сброс пароля",
    description="Инициирует сброс пароля, отправляя код на email пользователя.",
    operation_id="forgotPassword",
    response_description="Сообщение об успешной отправке кода сброса",
    responses={
        200: {
            "description": "Код сброса пароля успешно отправлен.",
            "content": {
                "application/json": {
                    "example": {"msg": "Password reset code sent to your email."}
                }
            },
        },
        404: {
            "description": "Пользователь не найден или не верифицирован.",
            "content": {
                "application/json": {"example": {"detail": "User not found or not verified."}}
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "An internal error occurred while sending the reset code."
                    }
                }
            },
        },
    },
    response_model=MsgSchema,
)
@limiter.limit("3/hour")
async def forgot_password(
    request: Request, data: ForgotPasswordRequestSchema, users_service: UsersServiceDep
):
    """Запрашивает сброс пароля для пользователя.

    - Генерирует и отправляет код сброса на `email` верифицированного пользователя.

    Args:
        request: Объект запроса FastAPI.
        data: Email пользователя.
        users_service: Сервис для работы с пользователями.

    Returns:
        Сообщение об успешной отправке кода.
    """
    logger.info("🔑 /forgot-password — старт для %s.", data.email)
    try:
        await users_service.forgot_password(email=data.email)
        logger.info("✅ /forgot-password — код сброса отправлен для %s.", data.email)
        return MsgSchema(msg="Password reset code sent to your email.")
    except (UsersRepositoryError, UserNotFound, SendOtpCodeError, UsersServiceError) as error:
        logger.exception("❌ /forgot-password — ошибка для %s: %s", data.email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Сброс пароля",
    description="Устанавливает новый пароль для пользователя с использованием кода сброса.",
    operation_id="resetPassword",
    response_description="Сообщение об успешном сбросе пароля",
    responses={
        200: {
            "description": "Пароль успешно сброшен.",
            "content": {
                "application/json": {
                    "example": {"msg": "Password has been reset successfully."}
                }
            },
        },
        400: {
            "description": "Неверный или просроченный код сброса.",
            "content": {
                "application/json": {"example": {"detail": "Invalid or expired reset code."}}
            },
        },
        403: {
            "description": "Аккаунт пользователя не верифицирован.",
            "content": {
                "application/json": {"example": {"detail": "User's email is not verified."}}
            },
        },
        404: {
            "description": "Пользователь с указанным email не найден.",
            "content": {
                "application/json": {
                    "example": {"detail": "User with the specified email was not found."}
                }
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {"detail": "An internal server error occurred."}
                }
            },
        },
    },
    response_model=MsgSchema,
)
@limiter.limit("5/15minute")
async def reset_password(
    request: Request, data: ResetPasswordRequestSchema, users_service: UsersServiceDep
):
    """Сбрасывает пароль пользователя с использованием кода.

    - Проверяет код сброса и устанавливает новый пароль.

    Args:
        request: Объект запроса FastAPI.
        data: Данные для сброса пароля (email, код, новый пароль).
        users_service: Сервис для работы с пользователями.

    Returns:
        Сообщение об успешном сбросе пароля.
    """
    logger.info("🔑 /reset-password — старт для %s.", data.email)
    try:
        await users_service.reset_password(user_data=data)
        logger.info("✅ /reset-password — пароль успешно сброшен для %s.", data.email)
        return MsgSchema(msg="Password has been reset successfully.")
    except (
        UsersRepositoryError,
        UserNotFound,
        InvalidCodeError,
        ExpiredCodeError,
        EmailNotVerifiedError,
        UsersServiceError,
    ) as error:
        logger.exception("❌ /reset-password — ошибка для %s: %s", data.email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/verify-email",
    status_code=status.HTTP_200_OK,
    summary="Подтверждение адреса электронной почты",
    description="Подтверждает email пользователя с помощью кода верификации и возвращает токены.",
    operation_id="userVerifyEmail",
    response_description="Пара токенов (access и refresh)",
    responses={
        200: {
            "description": "Email успешно подтвержден, возвращена пара токенов.",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "your_access_token",
                        "refresh_token": "your_refresh_token",
                        "token_type": "bearer",
                    }
                }
            },
        },
        400: {
            "description": "Неверный или просроченный код верификации.",
            "content": {
                "application/json": {
                    "example": {"detail": "Invalid or expired verification code."}
                }
            },
        },
        401: {
            "description": "Ошибка при создании пары токенов.",
            "content": {
                "application/json": {"example": {"detail": "Could not create token pair."}}
            },
        },
        404: {
            "description": "Пользователь с таким email не найден.",
            "content": {
                "application/json": {"example": {"detail": "User with this email not found."}}
            },
        },
        409: {
            "description": "Пользователь уже прошел верификацию.",
            "content": {
                "application/json": {"example": {"detail": "User has already been verified."}}
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {"detail": "An internal server error occurred."}
                }
            },
        },
    },
    response_model=TokenResponseSchema,
)
@limiter.limit("10/hour")
async def user_verify_email(
    request: Request,
    data: EmailVerifySchema,
    users_service: UsersServiceDep,
    jwt_manager: JWTManagerDep,
):
    """Проверяет код верификации, активирует пользователя и возвращает пару токенов.

    Args:
        request: Объект запроса FastAPI.
        data: Данные для верификации (email, код).
        users_service: Сервис для работы с пользователями.
        jwt_manager: Менеджер для работы с JWT.

    Returns:
        Новая пара access и refresh токенов.
    """
    logger.info("📧 /verify-email — старт для %s.", data.email)
    try:
        # Проверка кода верификации и получение данных пользователя
        user = await users_service.verify_user_email(user_data=data)

        # Создание токенов для пользователя
        token_pair = await create_token_pair(
            jwt_manager=jwt_manager,
            user_email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
        )

        logger.info("✅ /verify-email — email %s подтверждён, токены выданы.", data.email)
        return token_pair
    except (
        UserNotFound,
        UserAlreadyVerified,
        UsersRepositoryError,
        InvalidCodeError,
        ExpiredCodeError,
        JWTManagerError,
    ) as error:
        logger.exception("❌ /verify-email — ошибка для %s: %s", data.email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/login",
    status_code=status.HTTP_200_OK,
    summary="Аутентификация пользователя",
    description="Аутентифицирует пользователя и возвращает пару access и refresh токенов.",
    operation_id="userLogin",
    response_description="Пара токенов (access и refresh)",
    responses={
        200: {
            "description": "Аутентификация прошла успешно, возвращена пара токенов.",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "your_access_token",
                        "refresh_token": "your_refresh_token",
                        "token_type": "bearer",
                    }
                }
            },
        },
        401: {
            "description": "Неверные учетные данные.",
            "content": {
                "application/json": {"example": {"detail": "Invalid credentials."}}
            },
        },
        403: {
            "description": "Email не подтвержден или аккаунт неактивен.",
            "content": {
                "application/json": {
                    "example": {"detail": "Email not verified or account inactive."}
                }
            },
        },
        404: {
            "description": "Пользователь с таким email не найден.",
            "content": {
                "application/json": {"example": {"detail": "User with this email not found."}}
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {"detail": "An internal server error occurred."}
                }
            },
        },
    },
    response_model=TokenResponseSchema,
)
@limiter.limit("5/15minute")
async def user_login(
    request: Request,
    data: UserLoginSchema,
    users_service: UsersServiceDep,
    jwt_manager: JWTManagerDep,
):
    """Аутентифицирует пользователя и возвращает пару токенов.

    - Проверяет учетные данные, статус верификации и активности пользователя.
    - При успехе возвращает новую пару `access` и `refresh` токенов.

    Args:
        request: Объект запроса FastAPI.
        data: Данные для входа (email, пароль).
        users_service: Сервис для работы с пользователями.
        jwt_manager: Менеджер для работы с JWT.

    Returns:
        Новая пара access и refresh токенов.
    """
    logger.info("🔐 /login — попытка входа для %s.", data.email)
    try:
        user = await users_service.login_user(user_data=data)
        token_pair = await create_token_pair(
            jwt_manager=jwt_manager,
            user_email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
        )
        logger.info("✅ /login — пользователь %s успешно вошёл.", data.email)
        return token_pair
    except (
        UsersRepositoryError,
        UserNotFound,
        EmailNotVerifiedError,
        UserInactiveError,
        InvalidCredentialsError,
        JWTManagerError,
    ) as error:
        logger.exception("❌ /login — ошибка аутентификации для %s: %s", data.email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Выход пользователя из системы",
    description="Выход пользователя из системы путем добавления текущего access токена в черный список.",
    operation_id="userLogout",
    response_description="Успешный выход из системы (нет содержимого)",
    responses={
        204: {"description": "Токен успешно добавлен в черный список, выход выполнен."},
        401: {
            "description": "Неавторизованный доступ.",
            "content": {
                "application/json": {"example": {"detail": "Not authenticated"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {"detail": "An internal server error occurred."}
                }
            },
        },
    },
)
async def user_logout(
    payload: CurrentUserPayloadDep, blocklist_service: BlocklistServiceDep
):
    """Добавляет access токен в черный список для выхода из системы.

    Args:
        payload: Данные JWT-токена текущего пользователя.
        blocklist_service: Сервис для работы с черным списком токенов.
    """
    email = payload.get("sub")
    logger.info("🔐 /logout — выход для %s.", email)
    try:
        await blocklist_service.block_token(payload=payload)
        logger.info("✅ /logout — токен заблокирован для %s.", email)
    except (BlocklistServiceError, BlocklistRepositoryError) as error:
        logger.exception("❌ /logout — ошибка блокировки токена для %s: %s", email, error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)


@router.post(
    path="/feedback",
    status_code=status.HTTP_200_OK,
    summary="Отправка обратной связи",
    description="Отправляет сообщение от пользователя администратору на email.",
    operation_id="sendFeedback",
    response_model=MsgSchema,
    responses={
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Не удалось отправить сообщение.",
            "content": {
                "application/json": {
                    "example": {"detail": "Не удалось отправить сообщение. Попробуйте позже."}
                }
            },
        },
    },
)
@limiter.limit("5/hour")
async def send_feedback(request: Request, data: FeedbackSchema):
    """Принимает сообщение обратной связи и отправляет его администратору.

    Args:
        request: Объект запроса FastAPI.
        data: Текст сообщения, опциональный email для ответа и страница.
    """
    logger.info("📧 /feedback — получено сообщение со страницы: %s.", data.page)
    try:
        await send_feedback_email(
            message=data.message,
            reply_email=str(data.reply_email) if data.reply_email else None,
            page=data.page,
        )
        return MsgSchema(msg="Сообщение отправлено. Спасибо за обратную связь!")
    except Exception:
        logger.exception("Ошибка при отправке обратной связи.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось отправить сообщение. Попробуйте позже.",
        )


@router.post(
    path="/refresh",
    status_code=status.HTTP_200_OK,
    summary="Обновление пары токенов",
    description="Обновляет пару токенов, используя refresh токен.",
    operation_id="refreshToken",
    response_description="Новая пара токенов (access и refresh)",
    responses={
        200: {
            "description": "Пара токенов успешно обновлена.",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "your_new_access_token",
                        "refresh_token": "your_new_refresh_token",
                        "token_type": "bearer",
                    }
                }
            },
        },
        401: {
            "description": "Refresh токен невалиден, просрочен или заблокирован.",
            "content": {
                "application/json": {
                    "example": {"detail": "Invalid, expired, or blocked refresh token."}
                }
            },
        },
        429: {
            "description": "Превышен лимит запросов.",
            "content": {
                "application/json": {"example": {"detail": "Too Many Requests"}}
            },
        },
        500: {
            "description": "Внутренняя ошибка сервиса.",
            "content": {
                "application/json": {
                    "example": {"detail": "An internal server error occurred."}
                }
            },
        },
    },
    response_model=TokenResponseSchema,
)
@limiter.limit("30/hour")
async def refresh_token(
    request: Request,
    data: RefreshTokenRequestSchema,
    blocklist_service: BlocklistServiceDep,
    jwt_manager: JWTManagerDep,
):
    """Обновляет access и refresh токены, блокируя использованный refresh токен.

    Args:
        request: Объект запроса FastAPI.
        data: Refresh токен.
        blocklist_service: Сервис для работы с черным списком токенов.
        jwt_manager: Менеджер для работы с JWT.

    Returns:
        Новая пара access и refresh токенов.
    """
    logger.info("🔐 /refresh — обновление токенов.")
    try:
        refresh_payload = await get_current_refresh_payload(
            data=data, jwt_manager=jwt_manager, blocklist_service=blocklist_service
        )
        user_email = refresh_payload.get("sub")
        logger.info("🔐 /refresh — обновляем токены для %s.", user_email)

        # Блокируем использованный refresh токен
        await blocklist_service.block_token(payload=refresh_payload)

        # Создаем новую пару токенов
        token_pair = await create_token_pair(
            jwt_manager=jwt_manager,
            user_email=user_email,
            first_name=refresh_payload.get("first_name"),
            last_name=refresh_payload.get("last_name"),
        )

        logger.info("✅ /refresh — новая пара токенов выдана для %s.", user_email)
        return token_pair
    except (BlocklistServiceError, BlocklistRepositoryError, JWTManagerError) as error:
        logger.exception("❌ /refresh — ошибка обновления токенов: %s", error)
        raise HTTPException(status_code=error.status_code, detail=error.detail)
