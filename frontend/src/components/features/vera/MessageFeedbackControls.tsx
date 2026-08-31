"use client";

import { useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { veraApi } from "@/lib/api/vera";
import { cn } from "@/lib/utils/cn";

type FeedbackValue = "up" | "down";

interface MessageFeedbackControlsProps {
    sessionId: string;
    requestId: string;
    initialValue?: FeedbackValue;
}

interface ThumbIconProps {
    direction: FeedbackValue;
}

function ThumbIcon({ direction }: ThumbIconProps) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={cn(
                "h-[1.125rem] w-[1.125rem]",
                direction === "down" && "rotate-180",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M7.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3.5" />
            <path d="M7.5 10 11.3 3a2 2 0 0 1 1.8-1h.4a1 1 0 0 1 1 1v5H20a2 2 0 0 1 2 2.4l-1.4 7A4.5 4.5 0 0 1 16.2 21H7.5V10Z" />
        </svg>
    );
}

export function MessageFeedbackControls({
    sessionId,
    requestId,
    initialValue,
}: MessageFeedbackControlsProps) {
    const [value, setValue] = useState<FeedbackValue | undefined>(initialValue);
    const [isPending, setIsPending] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [announcement, setAnnouncement] = useState("");

    async function submitFeedback(nextValue: FeedbackValue) {
        if (isPending || value === nextValue) return;

        const previousValue = value;
        setValue(nextValue);
        setIsPending(true);
        setErrorMessage("");
        setAnnouncement("");

        try {
            const result = await veraApi.sendMessageFeedback({
                session_id: sessionId,
                request_id: requestId,
                value: nextValue,
            });
            setValue(result.value);
            setAnnouncement(
                nextValue === "up"
                    ? "Положительная оценка сохранена."
                    : "Отрицательная оценка сохранена.",
            );
        } catch (error) {
            setValue(previousValue);
            setErrorMessage(
                error instanceof ApiRequestError
                    ? error.detail
                    : "Не удалось сохранить оценку. Попробуйте ещё раз.",
            );
        } finally {
            setIsPending(false);
        }
    }

    return (
        /* Внешний отступ и разделитель задаёт общий футер сообщения
           (`ChatMessage`), потому что рядом стоит кнопка копирования и
           обе группы действий должны лежать на одной линии. */
        <>
            <div
                role="group"
                aria-label="Оценить ответ Ассистента Веры"
                className="flex items-center gap-1"
            >
                <span
                    className="mr-1 hidden text-xs text-muted sm:inline"
                    aria-hidden="true"
                >
                    Как вам ответ?
                </span>
                {(["up", "down"] as const).map((direction) => {
                    const isSelected = value === direction;
                    const label =
                        direction === "up"
                            ? "Ответ полезен"
                            : "Ответ не полезен";

                    return (
                        <button
                            key={direction}
                            type="button"
                            aria-label={label}
                            aria-pressed={isSelected}
                            title={label}
                            disabled={isPending}
                            onClick={() => void submitFeedback(direction)}
                            className={cn(
                                "inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors sm:h-9 sm:w-9",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                                "disabled:cursor-wait disabled:opacity-60",
                                isSelected
                                    ? "border-accent bg-accent/15 text-accent"
                                    : "border-white/10 text-muted hover:border-accent/50 hover:text-foreground",
                            )}
                        >
                            <ThumbIcon direction={direction} />
                        </button>
                    );
                })}
            </div>
            <span role="status" aria-live="polite" className="sr-only">
                {announcement}
            </span>
            {errorMessage && (
                <p role="alert" className="basis-full text-xs text-red-300">
                    {errorMessage}
                </p>
            )}
        </>
    );
}
