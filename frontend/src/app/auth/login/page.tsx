"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLogin } from "@/hooks/useLogin";
import {
    AuthFormLayout,
    PasswordInput,
    AuthErrorMessage,
    SubmitButton,
    EmailInput,
    useFormErrorFocus,
} from "@/components/features/auth";
import { loginSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { getSafeRedirect } from "@/lib/utils/redirect";
import { authFlowUrl } from "@/lib/utils/auth-flow";
import { isUnverifiedEmailError } from "@/lib/constants/auth-errors";
import { ApiRequestError } from "@/lib/api/client";
import { favoritesApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { getPendingFavorite, clearPendingFavorite } from "@/lib/utils/pendingFavorite";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));

    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const loginMutation = useLogin();
    const handlingLoginRef = useRef(false);

    const focusInvalid = useFormErrorFocus();
    const [email, setEmail] = useState(searchParams.get("email") ?? "");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated && !handlingLoginRef.current) {
            router.replace(redirect);
        }
    }, [authLoading, isAuthenticated, redirect, router]);

    if (authLoading) return <AuthFormLayout title="Вход"><p role="status">Проверяем сессию…</p></AuthFormLayout>;
    if (isAuthenticated) return null;

    function validate(): boolean {
        setEmailError("");
        setPasswordError("");

        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.email) setEmailError(errors.email);
            if (errors.password) setPasswordError(errors.password);
            focusInvalid([errors.email && "login-email", errors.password && "login-password"]);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (handlingLoginRef.current || loginMutation.isPending) return;
        setServerError(null);

        if (!validate()) return;

        handlingLoginRef.current = true;
        loginMutation.mutate(
            { email, password },
            {
                onSuccess: async (data) => {
                    // BUG-001 FIX: login mutation's onSuccess was overridden,
                    // so we need to manually update the auth state here.
                    useAuthStore.getState().setUser(data.user);

                    // BUG-001 FIX: clear Next.js router cache so stale
                    // redirects (e.g. /favorites → /auth/login cached while
                    // unauthenticated) don't replay after login.
                    router.refresh();

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
                        if (error.status === 403 && isUnverifiedEmailError(error.detail)) {
                            router.push(
                                authFlowUrl("/auth/verify-email", email, redirect)
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

                <EmailInput id="login-email" value={email} onChange={setEmail} error={emailError} />

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
                    href={authFlowUrl("/auth/forgot-password", email, redirect)}
                    className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Забыли пароль?
                </Link>
                <span>
                    Нет аккаунта?{" "}
                    <Link
                        href={authFlowUrl("/auth/register", email, redirect)}
                        className="text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Зарегистрироваться
                    </Link>
                </span>
            </div>
        </AuthFormLayout>
    );
}
