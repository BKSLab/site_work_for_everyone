"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForgotPassword } from "@/hooks/useForgotPassword";
import {
    AuthFormLayout,
    AuthErrorMessage,
    SubmitButton,
    EmailInput,
    useFormErrorFocus,
} from "@/components/features/auth";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";
import { authFlowUrl } from "@/lib/utils/auth-flow";
import { getSafeRedirect } from "@/lib/utils/redirect";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));
    const forgotMutation = useForgotPassword();
    const submittingRef = useRef(false);
    const focusInvalid = useFormErrorFocus();

    const [email, setEmail] = useState(searchParams.get("email") ?? "");
    const [emailError, setEmailError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);

    function validate(): boolean {
        setEmailError("");

        const result = forgotPasswordSchema.safeParse({ email });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.email) setEmailError(errors.email);
            focusInvalid([errors.email && "forgot-email"]);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submittingRef.current || forgotMutation.isPending) return;
        setServerError(null);

        if (!validate()) return;

        submittingRef.current = true;
        forgotMutation.mutate(
            { email },
            {
                onSuccess: () => {
                    router.push(
                        authFlowUrl("/auth/reset-password", email, redirect)
                    );
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
        <AuthFormLayout
            title="Восстановление пароля"
            description="Введите email, на который придёт код сброса пароля"
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <EmailInput id="forgot-email" value={email} onChange={setEmail} error={emailError} />

                <SubmitButton isLoading={forgotMutation.isPending}>
                    Отправить код
                </SubmitButton>
            </form>

            <div className="mt-4 text-sm text-muted">
                Вспомнили пароль?{" "}
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
