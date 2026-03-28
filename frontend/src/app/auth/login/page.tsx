"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLogin } from "@/hooks/useLogin";
import {
    AuthFormLayout,
    PasswordInput,
    AuthErrorMessage,
    SubmitButton,
} from "@/components/features/auth";
import { loginSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { getSafeRedirect } from "@/lib/utils/redirect";
import { ApiRequestError } from "@/lib/api/client";
import { favoritesApi } from "@/lib/api";
import { getPendingFavorite, clearPendingFavorite } from "@/lib/utils/pendingFavorite";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));

    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const loginMutation = useLogin();
    const handlingLoginRef = useRef(false);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);

    if (authLoading) return null;
    if (isAuthenticated && !handlingLoginRef.current) {
        router.replace(redirect);
        return null;
    }

    function validate(): boolean {
        setEmailError("");
        setPasswordError("");

        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.email) setEmailError(errors.email);
            if (errors.password) setPasswordError(errors.password);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerError(null);

        if (!validate()) return;

        handlingLoginRef.current = true;
        loginMutation.mutate(
            { email, password },
            {
                onSuccess: async (data) => {
                    const pendingId = getPendingFavorite();
                    if (pendingId) {
                        clearPendingFavorite();
                        try {
                            await favoritesApi.add({ user_id: data.user.email, vacancy_id: pendingId });
                        } catch {
                            // 409 = уже в избранном — ок, остальные ошибки не блокируют редирект
                        }
                    }
                    router.push(redirect);
                },
                onError: (error) => {
                    handlingLoginRef.current = false;
                    if (error instanceof ApiRequestError) {
                        if (error.status === 403) {
                            router.push(
                                `/auth/verify-email?email=${encodeURIComponent(email)}`
                            );
                        } else {
                            setServerError(error.detail);
                        }
                    } else {
                        setServerError("Произошла ошибка. Попробуйте позже.");
                    }
                },
            }
        );
    }

    return (
        <AuthFormLayout title="Вход">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="login-email"
                        className="text-sm font-medium text-foreground"
                    >
                        Email
                        <span aria-hidden="true" className="ml-1 text-accent">
                            *
                        </span>
                        <span className="sr-only"> (обязательное поле)</span>
                    </label>
                    <input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="your@email.com"
                        aria-required="true"
                        aria-invalid={emailError ? true : undefined}
                        aria-describedby={emailError ? "login-email-error" : undefined}
                        className="rounded border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {emailError && (
                        <span
                            id="login-email-error"
                            role="alert"
                            className="text-sm text-red-400"
                        >
                            {emailError}
                        </span>
                    )}
                </div>

                <PasswordInput
                    id="login-password"
                    label="Пароль"
                    value={password}
                    onChange={setPassword}
                    error={passwordError}
                    autoComplete="current-password"
                />

                <SubmitButton isLoading={loginMutation.isPending}>
                    Войти
                </SubmitButton>
            </form>

            <div className="mt-4 flex flex-col gap-2 text-sm text-muted">
                <Link
                    href="/auth/forgot-password"
                    className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Забыли пароль?
                </Link>
                <span>
                    Нет аккаунта?{" "}
                    <Link
                        href={redirect !== "/" ? `/auth/register?redirect=${encodeURIComponent(redirect)}` : "/auth/register"}
                        className="text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Зарегистрироваться
                    </Link>
                </span>
            </div>
        </AuthFormLayout>
    );
}
