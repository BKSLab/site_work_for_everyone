import type {
    RegisterRequest,
    LoginRequest,
    VerifyEmailRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ResendCodeRequest,
    AuthMsgResponse,
    AuthSuccessResponse,
    AuthUser,
} from "@/types/auth";
import type { FeedbackFormData } from "@/lib/schemas/auth";
import { ApiRequestError } from "./client";

const AUTH_BASE = "/api/auth";

async function authPost<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${AUTH_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
        return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
        throw new ApiRequestError(
            response.status,
            data.detail ?? "Неизвестная ошибка"
        );
    }

    return data;
}

async function authGet<T>(path: string): Promise<T> {
    const response = await fetch(`${AUTH_BASE}${path}`);

    if (!response.ok) {
        throw new ApiRequestError(response.status, "Not authenticated");
    }

    return response.json();
}

export const authApi = {
    register: (data: RegisterRequest) =>
        authPost<AuthMsgResponse>("/register", data),

    login: (data: LoginRequest) =>
        authPost<AuthSuccessResponse>("/login", data),

    verifyEmail: (data: VerifyEmailRequest) =>
        authPost<AuthSuccessResponse>("/verify-email", data),

    resendVerificationCode: (data: ResendCodeRequest) =>
        authPost<AuthMsgResponse>("/resend-verification-code", data),

    forgotPassword: (data: ForgotPasswordRequest) =>
        authPost<AuthMsgResponse>("/forgot-password", data),

    resetPassword: (data: ResetPasswordRequest) =>
        authPost<AuthMsgResponse>("/reset-password", data),

    logout: () => authPost<void>("/logout"),

    refresh: () => authPost<AuthSuccessResponse>("/refresh"),

    me: () => authGet<{ user: AuthUser }>("/me"),

    sendFeedback: (data: FeedbackFormData) =>
        authPost<AuthMsgResponse>("/feedback", data),
};
