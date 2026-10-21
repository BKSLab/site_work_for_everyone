"use client";

import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { cn } from "@/lib/utils/cn";

interface ShareButtonProps {
    title: string;
    text: string;
    className?: string;
}

export function ShareButton({ title, text, className }: ShareButtonProps) {
    const [copied, setCopied] = useState(false);
    const [message, setMessage] = useState("");
    const pendingRef = useRef(false);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
    }, []);

    async function handleShare() {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setMessage("");
        setCopied(false);
        if (resetTimer.current) clearTimeout(resetTimer.current);
        const url = window.location.href;
        try {
        // Web Share API — нативный диалог на мобиле и современном десктопе
        if (typeof navigator.share === "function") {
            try {
                await navigator.share({ title, text, url });
                return;
            } catch (e) {
                // AbortError — пользователь закрыл диалог, ничего не делаем
                if ((e as Error).name === "AbortError") return;
                // Прочие ошибки — падаем на clipboard
            }
        }

        // Fallback: копируем ссылку в буфер обмена
        // navigator.clipboard требует HTTPS; execCommand работает и на HTTP
        const copied = await copyToClipboard(url);
        setCopied(copied);
        setMessage(copied ? "Ссылка скопирована" : "Не удалось скопировать ссылку. Скопируйте адрес из адресной строки.");
        if (copied) {
            resetTimer.current = setTimeout(() => setCopied(false), 2500);
        }
        } finally {
            pendingRef.current = false;
        }
    }

    return (
        <div className="flex flex-col items-start gap-2">
        <button
            type="button"
            onClick={handleShare}
            className={cn("inline-flex items-center gap-2 rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60", className)}
        >
            {copied ? (
                <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Ссылка скопирована
                </>
            ) : (
                <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    Поделиться
                </>
            )}
        </button>
        <p role="status" aria-atomic="true" className={message === "Ссылка скопирована" ? "sr-only" : "text-sm text-red-400"}>{message}</p>
        </div>
    );
}
