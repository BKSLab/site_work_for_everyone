"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRegister } from "@/hooks/useRegister";
import { getSafeRedirect } from "@/lib/utils/redirect";
import {
    AuthFormLayout,
    PasswordInput,
    AuthErrorMessage,
    SubmitButton,
} from "@/components/features/auth";
import { registerSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const registerMutation = useRegister();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstNameError, setFirstNameError] = useState("");
    const [lastNameError, setLastNameError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);

    if (authLoading) return null;
    if (isAuthenticated) {
        router.replace("/");
        return null;
    }

    function validate(): boolean {
        setFirstNameError("");
        setLastNameError("");
        setEmailError("");
        setPasswordError("");

        const result = registerSchema.safeParse({ first_name: firstName, last_name: lastName, email, password });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.first_name) setFirstNameError(errors.first_name);
            if (errors.last_name) setLastNameError(errors.last_name);
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

        registerMutation.mutate(
            { first_name: firstName, last_name: lastName, email, password },
            {
                onSuccess: () => {
                    const verifyUrl = redirect !== "/"
                        ? `/auth/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`
                        : `/auth/verify-email?email=${encodeURIComponent(email)}`;
                    router.push(verifyUrl);
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
        <AuthFormLayout title="Регистрация">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="register-first-name"
                        className="text-sm font-medium text-foreground"
                    >
                        Имя
                        <span aria-hidden="true" className="ml-1 text-accent">*</span>
                        <span className="sr-only"> (обязательное поле)</span>
                    </label>
                    <input
                        id="register-first-name"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        autoComplete="given-name"
                        placeholder="Иван"
                        aria-required="true"
                        aria-invalid={firstNameError ? true : undefined}
                        aria-describedby={firstNameError ? "register-first-name-error" : undefined}
                        className="rounded border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {firstNameError && (
                        <span id="register-first-name-error" role="alert" className="text-sm text-red-400">
                            {firstNameError}
                        </span>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="register-last-name"
                        className="text-sm font-medium text-foreground"
                    >
                        Фамилия
                        <span aria-hidden="true" className="ml-1 text-accent">*</span>
                        <span className="sr-only"> (обязательное поле)</span>
                    </label>
                    <input
                        id="register-last-name"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                        placeholder="Иванов"
                        aria-required="true"
                        aria-invalid={lastNameError ? true : undefined}
                        aria-describedby={lastNameError ? "register-last-name-error" : undefined}
                        className="rounded border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {lastNameError && (
                        <span id="register-last-name-error" role="alert" className="text-sm text-red-400">
                            {lastNameError}
                        </span>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="register-email"
                        className="text-sm font-medium text-foreground"
                    >
                        Email
                        <span aria-hidden="true" className="ml-1 text-accent">
                            *
                        </span>
                        <span className="sr-only"> (обязательное поле)</span>
                    </label>
                    <input
                        id="register-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="your@email.com"
                        aria-required="true"
                        aria-invalid={emailError ? true : undefined}
                        aria-describedby={
                            emailError ? "register-email-error" : undefined
                        }
                        className="rounded border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {emailError && (
                        <span
                            id="register-email-error"
                            role="alert"
                            className="text-sm text-red-400"
                        >
                            {emailError}
                        </span>
                    )}
                </div>

                <PasswordInput
                    id="register-password"
                    label="Пароль"
                    value={password}
                    onChange={setPassword}
                    error={passwordError}
                    autoComplete="new-password"
                />

                <SubmitButton isLoading={registerMutation.isPending}>
                    Зарегистрироваться
                </SubmitButton>
            </form>

            <div className="mt-4 text-sm text-muted">
                Уже есть аккаунт?{" "}
                <Link
                    href={redirect !== "/" ? `/auth/login?redirect=${encodeURIComponent(redirect)}` : "/auth/login"}
                    className="text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Войти
                </Link>
            </div>
        </AuthFormLayout>
    );
}
