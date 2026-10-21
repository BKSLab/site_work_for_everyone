"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSafeRedirect } from "@/lib/utils/redirect";
import { emailContextError } from "@/lib/utils/auth-flow";
import { useVerifyEmail } from "@/hooks/useVerifyEmail";
import { useResendCode } from "@/hooks/useResendCode";
import { favoritesApi } from "@/lib/api";
import { getPendingFavorite, clearPendingFavorite } from "@/lib/utils/pendingFavorite";
import { useAuthStore } from "@/stores/auth";
import {
    AuthFormLayout,
    OtpCodeInput,
    AuthErrorMessage,
    SubmitButton,
    EmailInput,
    useFormErrorFocus,
} from "@/components/features/auth";
import { verifyEmailSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";

export default function VerifyEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));

    const verifyMutation = useVerifyEmail();
    const resendMutation = useResendCode();
    const operationRef = useRef<"verify" | "resend" | null>(null);
    const cooldownUntilRef = useRef(0);
    const focusInvalid = useFormErrorFocus();

    const [email, setEmail] = useState(searchParams.get("email") ?? "");
    const [emailError, setEmailError] = useState(() => emailContextError(email));
    const [code, setCode] = useState("");
    const [codeError, setCodeError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [resendStatus, setResendStatus] = useState("");

    useEffect(() => {
        if (!cooldownUntil) return;
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
            setCountdown(remaining);
            if (remaining === 0) {
                clearInterval(timer);
                setResendStatus("Можно отправить код повторно.");
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldownUntil]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (operationRef.current || verifyMutation.isPending || resendMutation.isPending) return;
        setServerError(null);
        setResendStatus("");
        setEmailError("");
        setCodeError("");

        const result = verifyEmailSchema.safeParse({ email, code });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.email) setEmailError(errors.email);
            if (errors.code) setCodeError(errors.code);
            focusInvalid([errors.email && "verify-email", errors.code && "verify-code"]);
            return;
        }

        operationRef.current = "verify";
        verifyMutation.mutate(
            { email, code },
            {
                onSuccess: async (data) => {
                    // BUG-001 FIX: verifyEmail mutation's onSuccess was overridden,
                    // so we need to manually update the auth state here.
                    useAuthStore.getState().setUser(data.user);

                    // BUG-001 FIX: clear Next.js router cache so stale
                    // redirects cached while unauthenticated don't replay.
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
                    operationRef.current = null;
                    if (error instanceof ApiRequestError) {
                        setServerError(error.detail);
                    } else {
                        setServerError("Произошла ошибка. Попробуйте позже.");
                    }
                },
            }
        );
    }

    function handleResend() {
        if (operationRef.current || verifyMutation.isPending || resendMutation.isPending || Date.now() < cooldownUntilRef.current) return;
        setServerError(null);
        setResendStatus("");
        const error = emailContextError(email);
        setEmailError(error);
        if (error) {
            focusInvalid(["verify-email"]);
            return;
        }

        operationRef.current = "resend";
        setResendStatus("Отправляем код…");
        resendMutation.mutate(
            { email },
            {
                onSuccess: () => {
                    operationRef.current = null;
                    cooldownUntilRef.current = Date.now() + 60_000;
                    setCooldownUntil(cooldownUntilRef.current);
                    setCountdown(60);
                    setResendStatus(`Код отправлен на ${email}. Следующая отправка будет доступна через 60 секунд.`);
                },
                onError: (error) => {
                    operationRef.current = null;
                    setResendStatus("");
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
            title="Подтверждение email"
            description="Для входа подтвердите email кодом из письма. Если адрес указан неверно, исправьте его и отправьте код повторно."
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <EmailInput id="verify-email" value={email} onChange={setEmail} error={emailError} />

                <OtpCodeInput
                    id="verify-code"
                    value={code}
                    onChange={setCode}
                    error={codeError}
                />

                <SubmitButton isLoading={verifyMutation.isPending} disabled={resendMutation.isPending}>
                    Подтвердить
                </SubmitButton>
            </form>

            <div className="mt-4 flex flex-col gap-2">
                <p role="status" aria-atomic="true" className="text-sm text-muted">{resendStatus}</p>
                {countdown > 0 && (
                    <p id="resend-countdown" className="text-sm text-muted">Повторная отправка через {countdown} сек.</p>
                )}
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={countdown > 0 || resendMutation.isPending || verifyMutation.isPending}
                    aria-busy={resendMutation.isPending || undefined}
                    aria-describedby={countdown > 0 ? "resend-countdown" : undefined}
                    className="text-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Отправить повторно
                </button>
            </div>
        </AuthFormLayout>
    );
}
