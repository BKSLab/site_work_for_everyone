"use client";

import { useState } from "react";
import { authApi } from "@/lib/api/auth";
import { feedbackSchema } from "@/lib/schemas/auth";
import { ApiRequestError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import styles from "./FeedbackForm.module.css";

export function FeedbackForm() {
    const [message, setMessage] = useState("");
    const [replyEmail, setReplyEmail] = useState("");
    const [messageError, setMessageError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [serverError, setServerError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    function validate(): boolean {
        setMessageError("");
        setEmailError("");

        const result = feedbackSchema.safeParse({
            message,
            reply_email: replyEmail || undefined,
            page: window.location.pathname,
        });

        if (!result.success) {
            for (const issue of result.error.issues) {
                if (issue.path[0] === "message") setMessageError(issue.message);
                if (issue.path[0] === "reply_email") setEmailError(issue.message);
            }
            return false;
        }
        return true;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setServerError(null);
        setSuccessMsg(null);

        if (!validate()) return;

        setIsPending(true);
        try {
            const result = await authApi.sendFeedback({
                message,
                reply_email: replyEmail || undefined,
                page: window.location.pathname,
            });
            setSuccessMsg(result.msg);
            setMessage("");
            setReplyEmail("");
        } catch (error) {
            if (error instanceof ApiRequestError) {
                setServerError(error.detail);
            } else {
                setServerError("Произошла ошибка. Попробуйте позже.");
            }
        } finally {
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

            {successMsg ? (
                <p role="status" className={styles.success}>
                    {successMsg}
                </p>
            ) : (
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
                            onChange={(e) => setMessage(e.target.value)}
                            rows={6}
                            maxLength={2000}
                            placeholder="Напишите ваше сообщение..."
                            aria-required="true"
                            aria-invalid={messageError ? true : undefined}
                            aria-describedby={messageError ? "feedback-message-error" : undefined}
                            className={styles.input}
                        />
                        {messageError && (
                            <span
                                id="feedback-message-error"
                                role="alert"
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
                            onChange={(e) => setReplyEmail(e.target.value)}
                            placeholder="your@email.com"
                            autoComplete="email"
                            aria-invalid={emailError ? true : undefined}
                            aria-describedby={emailError ? "feedback-email-error" : undefined}
                            className={styles.input}
                        />
                        {emailError && (
                            <span
                                id="feedback-email-error"
                                role="alert"
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
                        aria-disabled={isPending}
                        className={styles.submit}
                    >
                        {isPending ? "Отправка..." : "Отправить сообщение"}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13" />
                        </svg>
                    </Button>
                </form>
            )}
        </section>
    );
}
