"use client";

import { useEffect, useRef, useState } from "react";
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
    EmailInput,
    useFormErrorFocus,
} from "@/components/features/auth";
import { registerSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";
import { authFlowUrl } from "@/lib/utils/auth-flow";

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const registerMutation = useRegister();
    const submittingRef = useRef(false);
    const focusInvalid = useFormErrorFocus();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState(searchParams.get("email") ?? "");
    const [password, setPassword] = useState("");
    const [firstNameError, setFirstNameError] = useState("");
    const [lastNameError, setLastNameError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [consent, setConsent] = useState(false);
    const [consentError, setConsentError] = useState("");

    useEffect(() => {
        if (!authLoading && isAuthenticated) router.replace(redirect);
    }, [authLoading, isAuthenticated, redirect, router]);

    if (authLoading) return <AuthFormLayout title="Регистрация"><p role="status">Проверяем сессию…</p></AuthFormLayout>;
    if (isAuthenticated) return null;

    function validate(): boolean {
        setFirstNameError("");
        setLastNameError("");
        setEmailError("");
        setPasswordError("");
        setConsentError(consent ? "" : "Необходимо согласие на обработку персональных данных.");

        const result = registerSchema.safeParse({ first_name: firstName, last_name: lastName, email, password });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.first_name) setFirstNameError(errors.first_name);
            if (errors.last_name) setLastNameError(errors.last_name);
            if (errors.email) setEmailError(errors.email);
            if (errors.password) setPasswordError(errors.password);
            focusInvalid([
                errors.first_name && "register-first-name",
                errors.last_name && "register-last-name",
                errors.email && "register-email",
                errors.password && "register-password",
                !consent && "register-consent",
            ]);
            return false;
        }
        if (!consent) {
            focusInvalid(["register-consent"]);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submittingRef.current || registerMutation.isPending) return;
        setServerError(null);

        if (!validate()) return;

        submittingRef.current = true;
        registerMutation.mutate(
            { first_name: firstName, last_name: lastName, email, password },
            {
                onSuccess: () => {
                    router.push(authFlowUrl("/auth/verify-email", email, redirect));
                },
                onError: (error) => {
                    submittingRef.current = false;
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
                        className="rounded border border-input bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {firstNameError && (
                        <span id="register-first-name-error" className="text-sm text-red-400">
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
                        className="rounded border border-input bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                    {lastNameError && (
                        <span id="register-last-name-error" className="text-sm text-red-400">
                            {lastNameError}
                        </span>
                    )}
                </div>

                <EmailInput id="register-email" value={email} onChange={setEmail} error={emailError} />

                <PasswordInput
                    id="register-password"
                    label="Пароль"
                    value={password}
                    onChange={setPassword}
                    error={passwordError}
                    autoComplete="new-password"
                />

                <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                        <input
                            id="register-consent"
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => {
                                setConsent(e.target.checked);
                                if (e.target.checked) setConsentError("");
                            }}
                            aria-required="true"
                            aria-invalid={consentError ? true : undefined}
                            aria-describedby={
                                consentError
                                    ? "register-consent-error register-consent-hint"
                                    : "register-consent-hint"
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                        />
                        <label htmlFor="register-consent" className="cursor-pointer text-sm text-muted">
                            Я даю согласие на обработку персональных данных.
                            <span className="sr-only"> (обязательное поле)</span>
                        </label>
                    </div>
                    <a
                        id="register-consent-hint"
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-7 text-sm text-accent hover:text-accent-hover underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Читать политику конфиденциальности (откроется в новой вкладке)
                    </a>
                    {consentError && (
                        <span id="register-consent-error" className="ml-7 text-sm text-red-400">
                            {consentError}
                        </span>
                    )}
                </div>

                <SubmitButton isLoading={registerMutation.isPending}>
                    Зарегистрироваться
                </SubmitButton>
            </form>

            <div className="mt-4 text-sm text-muted">
                Уже есть аккаунт?{" "}
                <Link
                    href={authFlowUrl("/auth/login", email, redirect)}
                    className="text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Войти
                </Link>
            </div>
        </AuthFormLayout>
    );
}
