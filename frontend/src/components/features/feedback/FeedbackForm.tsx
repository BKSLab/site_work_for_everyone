"use client";

import { useState } from "react";
import { authApi } from "@/lib/api/auth";
import { feedbackSchema } from "@/lib/schemas/auth";
import { ApiRequestError } from "@/lib/api/client";

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
            className="mx-auto max-w-xl w-full"
        >
            <h2
                id="feedback-heading"
                className="mb-4 text-base font-semibold text-foreground"
            >
                Обратная связь
            </h2>
            <p className="mb-5 text-sm text-muted leading-relaxed">
                Нашли ошибку, есть идея или просто хотите написать — мы читаем каждое сообщение.
            </p>

            {successMsg ? (
                <p role="status" className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                    {successMsg}
                </p>
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                    {serverError && (
                        <p role="alert" className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
                            {serverError}
                        </p>
                    )}

                    <div className="flex flex-col gap-1">
                        <label
                            htmlFor="feedback-message"
                            className="text-sm font-medium text-foreground"
                        >
                            Сообщение
                            <span aria-hidden="true" className="ml-1 text-accent">*</span>
                            <span className="sr-only"> (обязательное поле)</span>
                        </label>
                        <textarea
                            id="feedback-message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                            maxLength={2000}
                            placeholder="Напишите ваше сообщение..."
                            aria-required="true"
                            aria-invalid={messageError ? true : undefined}
                            aria-describedby={messageError ? "feedback-message-error" : undefined}
                            className="resize-y rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        {messageError && (
                            <span
                                id="feedback-message-error"
                                role="alert"
                                className="text-sm text-red-400"
                            >
                                {messageError}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1">
                        <label
                            htmlFor="feedback-email"
                            className="text-sm font-medium text-foreground"
                        >
                            Email для ответа{" "}
                            <span className="text-muted font-normal">(необязательно)</span>
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
                            className="rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        {emailError && (
                            <span
                                id="feedback-email-error"
                                role="alert"
                                className="text-sm text-red-400"
                            >
                                {emailError}
                            </span>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        aria-disabled={isPending}
                        className="self-start rounded bg-accent px-5 py-2 text-sm font-semibold text-black hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? "Отправка..." : "Отправить"}
                    </button>
                </form>
            )}
        </section>
    );
}
