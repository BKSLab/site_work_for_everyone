"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVerifyEmail } from "@/hooks/useVerifyEmail";
import { useResendCode } from "@/hooks/useResendCode";
import {
    AuthFormLayout,
    OtpCodeInput,
    AuthErrorMessage,
    SubmitButton,
} from "@/components/features/auth";
import { verifyEmailSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";

export default function VerifyEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";

    const verifyMutation = useVerifyEmail();
    const resendMutation = useResendCode();

    const [code, setCode] = useState("");
    const [codeError, setCodeError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [resendSuccess, setResendSuccess] = useState(false);

    useEffect(() => {
        if (!email) {
            router.replace("/auth/register");
        }
    }, [email, router]);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((c) => c - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerError(null);
        setCodeError("");

        const result = verifyEmailSchema.safeParse({ email, code });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.code) setCodeError(errors.code);
            return;
        }

        verifyMutation.mutate(
            { email, code },
            {
                onSuccess: () => {
                    router.push("/");
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

    function handleResend() {
        setResendSuccess(false);
        resendMutation.mutate(
            { email },
            {
                onSuccess: () => {
                    setCountdown(60);
                    setResendSuccess(true);
                },
                onError: (error) => {
                    if (error instanceof ApiRequestError) {
                        setServerError(error.detail);
                    }
                },
            }
        );
    }

    if (!email) return null;

    return (
        <AuthFormLayout
            title="Подтверждение email"
            description={`Введите код, отправленный на ${email}`}
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <OtpCodeInput
                    id="verify-code"
                    value={code}
                    onChange={setCode}
                    error={codeError}
                />

                <SubmitButton isLoading={verifyMutation.isPending}>
                    Подтвердить
                </SubmitButton>
            </form>

            <div className="mt-4 flex flex-col gap-2">
                {resendSuccess && (
                    <p
                        aria-live="polite"
                        className="text-sm text-green-400"
                    >
                        Код отправлен повторно
                    </p>
                )}
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={countdown > 0 || resendMutation.isPending}
                    className="text-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {countdown > 0
                        ? `Отправить повторно (${countdown} сек.)`
                        : "Отправить повторно"}
                </button>
            </div>
        </AuthFormLayout>
    );
}
