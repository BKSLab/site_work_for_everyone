/** Маппинг точных строк detail из бэкенда → русские сообщения для пользователя */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
    // Регистрация
    "A user with this email already exists.":
        "Пользователь с таким email уже зарегистрирован.",

    // Поиск пользователя
    "User with the specified email was not found.":
        "Пользователь с указанным email не найден.",
    "User with this email not found.":
        "Пользователь с указанным email не найден.",
    "A user with this email does not exist.":
        "Пользователь с указанным email не найден.",

    // Вход
    "Invalid email or password.": "Неверный email или пароль.",
    "Invalid credentials.": "Неверный email или пароль.",

    // Верификация и активность
    "The email address has not been verified. Please confirm your email to proceed.":
        "Email не подтверждён. Подтвердите email, чтобы продолжить.",
    "Email not verified or account inactive.":
        "Email не подтверждён или аккаунт неактивен.",
    "User's email is not verified.": "Email не подтверждён.",
    "This user account has already been verified.":
        "Этот аккаунт уже подтверждён.",
    "User has already been verified.": "Этот аккаунт уже подтверждён.",
    "The user is inactive. Access is denied.":
        "Аккаунт неактивен. Доступ запрещён.",

    // Коды верификации/сброса
    "The verification code is invalid.": "Неверный код подтверждения.",
    "The verification code has expired.":
        "Срок действия кода подтверждения истёк.",
    "Invalid or expired verification code.":
        "Неверный или просроченный код подтверждения.",
    "Invalid or expired reset code.":
        "Неверный или просроченный код сброса пароля.",

    // Токены
    "Could not create token pair.": "Ошибка авторизации. Попробуйте позже.",
    "Invalid, expired, or blocked refresh token.":
        "Сессия истекла. Войдите заново.",
    "Not authenticated": "Вы не авторизованы.",
    "Token has been revoked": "Сессия истекла. Войдите заново.",
    "Refresh token has been revoked": "Сессия истекла. Войдите заново.",

    // Rate limiting
    "Too Many Requests": "Слишком много запросов. Подождите и попробуйте снова.",

    // OTP
    "An error occurred while sending the verification code to the email address":
        "Не удалось отправить код на email. Попробуйте позже.",
};

const DEFAULT_AUTH_ERROR = "Произошла ошибка. Попробуйте позже.";

export function getAuthErrorMessage(detail: string): string {
    // Точное совпадение
    if (AUTH_ERROR_MESSAGES[detail]) {
        return AUTH_ERROR_MESSAGES[detail];
    }
    // Частичное совпадение (для ошибок с динамическим email)
    for (const [key, value] of Object.entries(AUTH_ERROR_MESSAGES)) {
        if (detail.includes(key) || key.includes(detail)) {
            return value;
        }
    }
    return DEFAULT_AUTH_ERROR;
}
