"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForgotPassword } from "@/hooks/useForgotPassword";
import {
    AuthFormLayout,
    AuthErrorMessage,
    SubmitButton,
} from "@/components/features/auth";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const forgotMutation = useForgotPassword();

    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);

    function validate(): boolean {
        setEmailError("");

        const result = forgotPasswordSchema.safeParse({ email });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.email) setEmailError(errors.email);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerError(null);

        if (!validate()) return;

        forgotMutation.mutate(
            { email },
            {
                onSuccess: () => {
                    router.push(
                        `/auth/reset-password?email=${encodeURIComponent(email)}`
                    );
                },
                onError: (error) => {
                    if (error instanceof ApiRequestError) {
                        setServerError(error.detail);
                    } else {
                        setServerError("Произошла ошибка. Попробуйте позже.");
                    }
                },
            }
        );
    }

    return (
        <AuthFormLayout
            title="Восстановление пароля"
            description="Введите email, на который придёт код сброса пароля"
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="forgot-email"
                        className="text-sm font-medium text-foreground"
                    >
                        Email
                        <span aria-hidden="true" className="ml-1 text-accent">
                            *
                        </span>
                        <span className="sr-only"> (обязательное поле)</span>
                    </label>
                    <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="your@email.com"
                        aria-required="true"
                        aria-invalid={emailError ? true : undefined}
                        aria-describedby={
                            emailError ? "forgot-email-error" : undefined
                        }
                        className="rounded border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {emailError && (
                        <span
                            id="forgot-email-error"
                            role="alert"
                            className="text-sm text-red-400"
                        >
                            {emailError}
                        </span>
                    )}
                </div>

                <SubmitButton isLoading={forgotMutation.isPending}>
                    Отправить код
                </SubmitButton>
            </form>

            <div className="mt-4 text-sm text-muted">
                Вспомнили пароль?{" "}
                <Link
                    href="/auth/login"
                    className="text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Войти
                </Link>
            </div>
        </AuthFormLayout>
    );
}
