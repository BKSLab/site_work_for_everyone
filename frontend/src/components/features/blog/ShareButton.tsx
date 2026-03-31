"use client";

import { useState } from "react";

interface ShareButtonProps {
    title: string;
    text: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
    // Современный способ — требует HTTPS
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // падаем на execCommand
        }
    }
    // Старый способ — работает и на HTTP
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
}

export function ShareButton({ title, text }: ShareButtonProps) {
    const [copied, setCopied] = useState(false);

    async function handleShare() {
        const url = window.location.href;

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
        if (copied) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    }

    return (
        <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
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
    );
}
