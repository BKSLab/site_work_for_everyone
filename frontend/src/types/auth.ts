// === Запросы (зеркало Pydantic-схем) ===

export interface RegisterRequest {
    first_name: string; // min 1, max 100
    last_name: string;  // min 1, max 100
    email: string;
    password: string; // min 8, max 255
}

export interface LoginRequest {
    email: string;
    password: string; // min 8, max 255
}

export interface VerifyEmailRequest {
    email: string;
    code: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface ResetPasswordRequest {
    email: string;
    code: string;
    new_password: string; // min 8, max 255
}

export interface ResendCodeRequest {
    email: string;
}

// === Ответы ===

/** Ответ бэкенда на register, resend-code, forgot-password, reset-password */
export interface AuthMsgResponse {
    msg: string; // ВАЖНО: бэкенд использует "msg", а не "message"
}

/** Данные пользователя, извлечённые из JWT payload на прокси-уровне */
export interface AuthUser {
    email: string;
    first_name: string;
    last_name: string;
}

/** Ответ прокси после login/verify-email/refresh (токены уже в cookies) */
export interface AuthSuccessResponse {
    user: AuthUser;
}
