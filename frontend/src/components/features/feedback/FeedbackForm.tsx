"use client";

import { useRef, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { feedbackSchema } from "@/lib/schemas/auth";
import { ApiRequestError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useFormErrorFocus } from "@/components/features/auth/useFormErrorFocus";
import { zodFieldErrors } from "@/lib/utils/validation";
import styles from "./FeedbackForm.module.css";

export function FeedbackForm() {
    const [message, setMessage] = useState("");
    const [replyEmail, setReplyEmail] = useState("");
    const [messageError, setMessageError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const submittingRef = useRef(false);
    const draftRevisionRef = useRef(0);
    const focusInvalid = useFormErrorFocus();

    function validate(): boolean {
        setMessageError("");
        setEmailError("");

        const result = feedbackSchema.safeParse({
            message,
            reply_email: replyEmail || undefined,
            page: window.location.pathname,
        });

        if (!result.success) {
            const errors = zodFieldErrors(result.error);
            setMessageError(errors.message ?? "");
            setEmailError(errors.reply_email ?? "");
            focusInvalid([errors.message && "feedback-message", errors.reply_email && "feedback-email"]);
            return false;
        }
        return true;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submittingRef.current) return;
        setServerError(null);
        setSuccessMsg(null);

        if (!validate()) return;

        submittingRef.current = true;
        setIsPending(true);
        const submittedRevision = draftRevisionRef.current;
        try {
            const result = await authApi.sendFeedback({
                message,
                reply_email: replyEmail || undefined,
                page: window.location.pathname,
            });
            const draftUnchanged = draftRevisionRef.current === submittedRevision;
            setSuccessMsg(`${result.msg || "Сообщение отправлено."}${draftUnchanged ? "" : " Новая редакция сохранена."}`);
            if (draftUnchanged) {
                setMessage("");
                setReplyEmail("");
            }
        } catch (error) {
            if (error instanceof ApiRequestError) {
                setServerError(error.detail);
            } else {
                setServerError("Произошла ошибка. Попробуйте позже.");
            }
        } finally {
            submittingRef.current = false;
            setIsPending(false);
        }
    }

    return (
        <section
            aria-labelledby="feedback-heading"
            className={styles.panel}
        >
            <SectionHeading
                id="feedback-heading"
                icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="3" />
                        <path d="m3 6 9 7 9-7" />
                    </svg>
                }
            >
                Написать мне
            </SectionHeading>
            <p className={styles.description}>
                Нашли ошибку, есть идея или просто хотите написать — я читаю каждое сообщение.
            </p>

            <p role="status" aria-atomic="true" className={successMsg ? styles.success : undefined}>
                {isPending ? "Отправляем сообщение…" : successMsg}
            </p>
            <form onSubmit={handleSubmit} className={styles.form} noValidate>
                {serverError && (
                    <p role="alert" className={styles.error}>
                        {serverError}
                    </p>
                )}

                <div className={styles.field}>
                    <label
                        htmlFor="feedback-message"
                        className={styles.label}
                    >
                        Сообщение
                        <span aria-hidden="true" className="ml-1 text-accent">*</span>
                        <span className="sr-only"> (обязательное поле)</span>
                    </label>
                    <textarea
                        id="feedback-message"
                        value={message}
                        onChange={(e) => {
                            draftRevisionRef.current += 1;
                            setMessage(e.target.value);
                        }}
                        rows={6}
                        maxLength={2000}
                        placeholder="Напишите ваше сообщение..."
                        aria-required="true"
                        aria-invalid={messageError ? true : undefined}
                        aria-describedby={["feedback-message-hint", messageError && "feedback-message-error"].filter(Boolean).join(" ")}
                        className={styles.input}
                    />
                    <span id="feedback-message-hint" className={styles.hint}>От 10 до 2000 символов.</span>
                    {messageError && (
                        <span
                            id="feedback-message-error"
                            className={styles.fieldError}
                        >
                            {messageError}
                        </span>
                    )}
                </div>

                <div className={styles.field}>
                    <label
                        htmlFor="feedback-email"
                        className={styles.label}
                    >
                        Email для ответа{" "}
                        <span className={styles.optional}>(необязательно)</span>
                    </label>
                    <input
                        id="feedback-email"
                        type="email"
                        value={replyEmail}
                        onChange={(e) => {
                            draftRevisionRef.current += 1;
                            setReplyEmail(e.target.value);
                        }}
                        placeholder="your@email.com"
                        autoComplete="email"
                        aria-invalid={emailError ? true : undefined}
                        aria-describedby={emailError ? "feedback-email-error" : undefined}
                        className={styles.input}
                    />
                    {emailError && (
                        <span
                            id="feedback-email-error"
                            className={styles.fieldError}
                        >
                            {emailError}
                        </span>
                    )}
                </div>

                <Button
                    type="submit"
                    variant="primary"
                    disabled={isPending}
                    aria-busy={isPending || undefined}
                    className={styles.submit}
                >
                    Отправить сообщение
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13" />
                    </svg>
                </Button>
            </form>
        </section>
    );
}
