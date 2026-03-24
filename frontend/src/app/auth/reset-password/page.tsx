"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useResetPassword } from "@/hooks/useResetPassword";
import {
    AuthFormLayout,
    OtpCodeInput,
    PasswordInput,
    AuthErrorMessage,
    SubmitButton,
} from "@/components/features/auth";
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";

export default function ResetPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";

    const resetMutation = useResetPassword();

    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [codeError, setCodeError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!email) {
            router.replace("/auth/forgot-password");
        }
    }, [email, router]);

    useEffect(() => {
        if (!success) return;
        const timer = setTimeout(() => {
            router.push("/auth/login");
        }, 3000);
        return () => clearTimeout(timer);
    }, [success, router]);

    function validate(): boolean {
        setCodeError("");
        setPasswordError("");

        const result = resetPasswordSchema.safeParse({
            email,
            code,
            new_password: newPassword,
        });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.code) setCodeError(errors.code);
            if (errors.new_password) setPasswordError(errors.new_password);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerError(null);

        if (!validate()) return;

        resetMutation.mutate(
            { email, code, new_password: newPassword },
            {
                onSuccess: () => {
                    setSuccess(true);
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

    if (!email) return null;

    if (success) {
        return (
            <AuthFormLayout title="Сброс пароля">
                <div className="flex flex-col gap-4">
                    <p
                        aria-live="polite"
                        className="text-sm text-green-400"
                    >
                        Пароль успешно изменён. Перенаправляем на вход...
                    </p>
                    <Link
                        href="/auth/login"
                        className="text-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Перейти к входу
                    </Link>
                </div>
            </AuthFormLayout>
        );
    }

    return (
        <AuthFormLayout
            title="Сброс пароля"
            description="Введите код из письма и новый пароль"
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="reset-email"
                        className="text-sm font-medium text-foreground"
                    >
                        Email
                    </label>
                    <input
                        id="reset-email"
                        type="email"
                        value={email}
                        readOnly
                        className="rounded border border-border bg-surface px-3 py-2 text-muted"
                    />
                </div>

                <OtpCodeInput
                    id="reset-code"
                    value={code}
                    onChange={setCode}
                    error={codeError}
                />

                <PasswordInput
                    id="reset-new-password"
                    label="Новый пароль"
                    value={newPassword}
                    onChange={setNewPassword}
                    error={passwordError}
                    autoComplete="new-password"
                />

                <SubmitButton isLoading={resetMutation.isPending}>
                    Сбросить пароль
                </SubmitButton>
            </form>
        </AuthFormLayout>
    );
}
