"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

const COPIED_RESET_DELAY_MS = 2000;

interface MessageCopyButtonProps {
    text: string;
}

function CopyIcon({ isCopied }: { isCopied: boolean }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-[1.125rem] w-[1.125rem]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {isCopied ? (
                <path d="m5 13 4 4L19 7" />
            ) : (
                <>
                    <rect x="9" y="9" width="12" height="12" rx="2" />
                    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                </>
            )}
        </svg>
    );
}

export function MessageCopyButton({ text }: MessageCopyButtonProps) {
    const [isCopied, setIsCopied] = useState(false);
    const [announcement, setAnnouncement] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        },
        [],
    );

    async function copyAnswer() {
        setErrorMessage("");
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Буфер обмена недоступен без HTTPS и при отказе в разрешении —
            // это не ошибка ответа, поэтому сообщаем отдельно и не трогаем
            // остальную разметку сообщения.
            setErrorMessage(
                "Не удалось скопировать. Выделите текст ответа и скопируйте вручную.",
            );
            return;
        }

        setIsCopied(true);
        setAnnouncement("Ответ скопирован.");
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
            setIsCopied(false);
            setAnnouncement("");
        }, COPIED_RESET_DELAY_MS);
    }

    return (
        <>
            <button
                type="button"
                aria-label="Скопировать ответ"
                title="Скопировать ответ"
                onClick={() => void copyAnswer()}
                className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors sm:h-9 sm:w-9",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    isCopied
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-white/10 text-muted hover:border-accent/50 hover:text-foreground",
                )}
            >
                <CopyIcon isCopied={isCopied} />
            </button>
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
