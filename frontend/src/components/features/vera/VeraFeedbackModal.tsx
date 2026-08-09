"use client";

import { useRef, useState, type FormEvent } from "react";
import { ApiRequestError } from "@/lib/api/client";
import { veraApi } from "@/lib/api/vera";
import { veraFeedbackSchema } from "@/lib/schemas/vera";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface VeraFeedbackModalProps {
    sessionId: string;
}

const AUDIENCE_OPTIONS = [
    {
        value: "seeker",
        label: "Соискатель или работник с инвалидностью",
    },
    {
        value: "employer",
        label: "Работодатель или представитель работодателя",
    },
    { value: "other", label: "Другое" },
] as const;

const USEFULNESS_OPTIONS = [
    { value: 1, label: "Совершенно не полезна" },
    { value: 2, label: "Скорее не полезна" },
    { value: 3, label: "Отчасти полезна, отчасти нет" },
    { value: 4, label: "Скорее полезна" },
    { value: 5, label: "Очень полезна" },
] as const;

const TRUST_OPTIONS = [
    { value: 1, label: "Совершенно не доверяю" },
    { value: 2, label: "Скорее не доверяю" },
    { value: 3, label: "Отчасти доверяю, отчасти нет" },
    { value: 4, label: "Скорее доверяю" },
    { value: 5, label: "Полностью доверяю" },
] as const;

const SUCCESS_MESSAGE =
    "Спасибо за отзыв об Ассистенте Вере! Он сохранён вместе с текущей сессией диалога.";

type Audience = (typeof AUDIENCE_OPTIONS)[number]["value"];

interface RatingFieldsetProps {
    legend: string;
    name: string;
    options: ReadonlyArray<{ value: number; label: string }>;
    value: number | undefined;
    onChange: (value: number) => void;
}

function RatingFieldset({
    legend,
    name,
    options,
    value,
    onChange,
}: RatingFieldsetProps) {
    return (
        <fieldset>
            <legend className="mb-3 text-sm font-semibold leading-relaxed text-foreground">
                {legend}
            </legend>
            <div className="grid gap-2 sm:grid-cols-5">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-muted transition-colors hover:border-accent/60 hover:text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-foreground"
                    >
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        <span>
                            <span
                                aria-hidden="true"
                                className="font-semibold text-accent"
                            >
                                {option.value}
                            </span>{" "}
                            {option.label}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

export function VeraFeedbackModal({ sessionId }: VeraFeedbackModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [audience, setAudience] = useState<Audience>();
    const [usefulness, setUsefulness] = useState<number>();
    const [trust, setTrust] = useState<number>();
    const [comment, setComment] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [isPending, setIsPending] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const emailInputRef = useRef<HTMLInputElement>(null);
    const submissionIdRef = useRef<string | null>(null);

    function resetForm() {
        setAudience(undefined);
        setUsefulness(undefined);
        setTrust(undefined);
        setComment("");
        setContactEmail("");
        setEmailError("");
        setSuccessMessage("");
        setErrorMessage("");
        submissionIdRef.current = null;
    }

    function handleOpenChange(open: boolean) {
        if (isPending) return;
        setIsOpen(open);
        if (!open) resetForm();
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        const normalizedContactEmail = contactEmail.trim() || undefined;
        const emailResult = veraFeedbackSchema.shape.contact_email.safeParse(
            normalizedContactEmail,
        );
        if (!emailResult.success) {
            setEmailError(
                emailResult.error.issues[0]?.message ??
                    "Введите корректный адрес электронной почты.",
            );
            emailInputRef.current?.focus();
            return;
        }

        setEmailError("");
        setIsPending(true);

        try {
            const submissionId = submissionIdRef.current ?? crypto.randomUUID();
            submissionIdRef.current = submissionId;

            await veraApi.sendFeedback({
                session_id: sessionId,
                submission_id: submissionId,
                audience,
                usefulness,
                trust,
                comment: comment.trim() || undefined,
                contact_email: normalizedContactEmail,
            });
            setSuccessMessage(SUCCESS_MESSAGE);
        } catch (error) {
            setErrorMessage(
                error instanceof ApiRequestError
                    ? error.detail
                    : "Не удалось отправить отзыв. Попробуйте позже.",
            );
        } finally {
            setIsPending(false);
        }
    }

    return (
        <>
            <section
                aria-labelledby="vera-feedback-invitation-heading"
                className="relative overflow-hidden rounded-2xl bg-[linear-gradient(115deg,#624900_0%,#d69f00_18%,#ffe891_36%,#8a6800_54%,#f5b800_76%,#5a4300_100%)] p-px shadow-[0_8px_32px_rgba(0,0,0,0.28)]"
            >
                <div className="relative flex flex-col gap-4 rounded-[calc(1rem-1px)] bg-[linear-gradient(160deg,#151515,#0f0f0f)] p-6 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <h2
                                id="vera-feedback-invitation-heading"
                                className="text-base font-bold text-foreground"
                            >
                                Нам важно ваше мнение об Ассистенте Вере
                            </h2>
                            <p className="text-sm leading-relaxed text-muted">
                                Нам важно узнать мнение каждого о работе
                                Ассистента Веры. Оставьте отзыв — он поможет
                                сделать консультации полезнее и понятнее.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => setIsOpen(true)}
                        disabled={!sessionId}
                        className="w-full shrink-0 rounded-xl border border-accent px-5 py-2.5 text-sm shadow-[0_0_24px_rgba(245,184,0,0.35)] sm:w-auto"
                    >
                        Оставить отзыв об Ассистенте Вере
                    </Button>
                </div>
            </section>

            <Modal
                title={successMessage ? undefined : "Отзыв об Ассистенте Вере"}
                isOpen={isOpen}
                onOpenChange={handleOpenChange}
                aria-label={successMessage ? "Спасибо за отзыв" : undefined}
                aria-describedby={
                    successMessage ? undefined : "vera-feedback-description"
                }
                containerClassName={
                    successMessage
                        ? undefined
                        : "max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto"
                }
            >
                {successMessage ? (
                    <div className="space-y-5">
                        <p
                            role="status"
                            className="leading-relaxed text-foreground"
                        >
                            {SUCCESS_MESSAGE}
                        </p>
                        <Button
                            variant="primary"
                            onClick={() => handleOpenChange(false)}
                        >
                            Закрыть
                        </Button>
                    </div>
                ) : (
                    <>
                        <p
                            id="vera-feedback-description"
                            className="mb-2 text-sm leading-relaxed text-muted"
                        >
                            Ответьте только на те вопросы, на которые вам
                            удобно. Все поля необязательные.
                        </p>
                        <p className="mb-6 text-xs leading-relaxed text-muted">
                            Вместе с отзывом будет отправлен технический
                            идентификатор текущей сессии — он поможет найти
                            диалог и разобраться в ситуации.
                        </p>

                        <form
                            aria-label="Форма отзыва об Ассистенте Вере"
                            onSubmit={handleSubmit}
                            className="space-y-6"
                            noValidate
                        >
                            {errorMessage && (
                                <p
                                    role="alert"
                                    className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300"
                                >
                                    {errorMessage}
                                </p>
                            )}

                            <fieldset>
                                <legend className="mb-3 text-sm font-semibold leading-relaxed text-foreground">
                                    Кем вы являетесь?
                                </legend>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {AUDIENCE_OPTIONS.map((option) => (
                                        <label
                                            key={option.value}
                                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-muted transition-colors hover:border-accent/60 hover:text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-foreground"
                                        >
                                            <input
                                                type="radio"
                                                name="vera-feedback-audience"
                                                value={option.value}
                                                checked={
                                                    audience === option.value
                                                }
                                                onChange={() =>
                                                    setAudience(option.value)
                                                }
                                                className="mt-0.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                            />
                                            <span>{option.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            <RatingFieldset
                                legend="Насколько консультация Ассистента Веры была полезна именно в вашей ситуации?"
                                name="vera-feedback-usefulness"
                                options={USEFULNESS_OPTIONS}
                                value={usefulness}
                                onChange={setUsefulness}
                            />

                            <RatingFieldset
                                legend="Насколько вы доверяете полученному ответу?"
                                name="vera-feedback-trust"
                                options={TRUST_OPTIONS}
                                value={trust}
                                onChange={setTrust}
                            />

                            <section className="space-y-2">
                                <label
                                    htmlFor="vera-feedback-comment"
                                    className="block text-sm font-semibold leading-relaxed text-foreground"
                                >
                                    Расскажите, пожалуйста, что вам понравилось,
                                    чего не хватило или что стоит улучшить либо
                                    сделать понятнее
                                </label>
                                <textarea
                                    id="vera-feedback-comment"
                                    name="vera-feedback-comment"
                                    value={comment}
                                    onChange={(event) =>
                                        setComment(event.target.value)
                                    }
                                    rows={4}
                                    className="w-full resize-y rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                />
                            </section>

                            <section className="space-y-2">
                                <label
                                    htmlFor="vera-feedback-email"
                                    className="block text-sm font-semibold leading-relaxed text-foreground"
                                >
                                    Электронная почта для связи
                                </label>
                                <p
                                    id="vera-feedback-email-hint"
                                    className="text-xs leading-relaxed text-muted"
                                >
                                    Необязательно. Оставьте адрес, если хотите,
                                    чтобы мы могли связаться с вами и уточнить
                                    детали.
                                </p>
                                <input
                                    ref={emailInputRef}
                                    id="vera-feedback-email"
                                    name="vera-feedback-email"
                                    type="email"
                                    autoComplete="email"
                                    value={contactEmail}
                                    onChange={(event) => {
                                        setContactEmail(event.target.value);
                                        if (emailError) setEmailError("");
                                    }}
                                    aria-describedby={
                                        emailError
                                            ? "vera-feedback-email-hint vera-feedback-email-error"
                                            : "vera-feedback-email-hint"
                                    }
                                    aria-invalid={emailError ? true : undefined}
                                    className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                />
                                {emailError && (
                                    <p
                                        id="vera-feedback-email-error"
                                        role="alert"
                                        className="text-sm text-red-300"
                                    >
                                        {emailError}
                                    </p>
                                )}
                            </section>

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={isPending}
                                    className="w-full sm:w-auto"
                                >
                                    Отмена
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    disabled={isPending}
                                    className="w-full sm:w-auto"
                                >
                                    {isPending
                                        ? "Отправка…"
                                        : "Отправить отзыв"}
                                </Button>
                            </div>
                        </form>
                    </>
                )}
            </Modal>
        </>
    );
}
