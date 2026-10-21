"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useResetPassword } from "@/hooks/useResetPassword";
import {
    AuthFormLayout,
    OtpCodeInput,
    PasswordInput,
    AuthErrorMessage,
    SubmitButton,
    EmailInput,
    useFormErrorFocus,
} from "@/components/features/auth";
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { zodFieldErrors } from "@/lib/utils/validation";
import { ApiRequestError } from "@/lib/api/client";
import { authFlowUrl, emailContextError } from "@/lib/utils/auth-flow";
import { getSafeRedirect } from "@/lib/utils/redirect";

export default function ResetPasswordPage() {
    const searchParams = useSearchParams();
    const redirect = getSafeRedirect(searchParams.get("redirect"));

    const resetMutation = useResetPassword();
    const submittingRef = useRef(false);
    const successRef = useRef<HTMLParagraphElement>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const focusSuccessRef = useRef(false);
    const focusInvalid = useFormErrorFocus();

    const [email, setEmail] = useState(searchParams.get("email") ?? "");
    const [emailError, setEmailError] = useState(() => emailContextError(email));
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [codeError, setCodeError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (success && focusSuccessRef.current) successRef.current?.focus();
    }, [success]);

    function validate(): boolean {
        setCodeError("");
        setEmailError("");
        setPasswordError("");

        const result = resetPasswordSchema.safeParse({
            email,
            code,
            new_password: newPassword,
        });
        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            if (errors.email) setEmailError(errors.email);
            if (errors.code) setCodeError(errors.code);
            if (errors.new_password) setPasswordError(errors.new_password);
            focusInvalid([
                errors.email && "reset-email",
                errors.code && "reset-code",
                errors.new_password && "reset-new-password",
            ]);
            return false;
        }
        return true;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submittingRef.current || resetMutation.isPending) return;
        setServerError(null);

        if (!validate()) return;

        submittingRef.current = true;
        const submitFocus = document.activeElement;
        resetMutation.mutate(
            { email, code, new_password: newPassword },
            {
                onSuccess: () => {
                    const active = document.activeElement;
                    focusSuccessRef.current = active === submitFocus || active === document.body || !!formRef.current?.contains(active);
                    setSuccess(email);
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

    if (success) {
        return (
            <AuthFormLayout title="Сброс пароля">
                <div className="flex flex-col gap-4">
                    <p
                        ref={successRef}
                        tabIndex={-1}
                        className="scroll-mt-28 rounded text-sm text-green-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                    >
                        Пароль успешно изменён. Теперь вы можете войти с новым паролем.
                    </p>
                    <Link
                        href={authFlowUrl("/auth/login", success, redirect)}
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
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <AuthErrorMessage error={serverError} />

                <EmailInput id="reset-email" value={email} onChange={setEmail} error={emailError} />
                <Link
                    href={authFlowUrl("/auth/forgot-password", email, redirect)}
                    className="text-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Получить код для указанного email
                </Link>

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
