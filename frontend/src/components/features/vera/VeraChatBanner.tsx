import Image from "next/image";
import Link from "next/link";

interface VeraChatBannerProps {
    title?: string;
    description?: string;
    ctaLabel?: string;
}

const DEFAULT_TITLE = "Не уверены в своих правах при трудоустройстве?";
const DEFAULT_DESCRIPTION =
    "Спросите у Веры про квоты, льготы и защиту от увольнения — отвечу на основе базы знаний, без регистрации.";
const DEFAULT_CTA_LABEL = "Спросить у Веры";

/**
 * Баннер-приглашение в чат с Верой. Стиль — точная копия карточки
 * "Хотите узнать, как работает Вера?" с /assistant (та же цветовая
 * схема и структура), чтобы баннер читался как часть единого сайта,
 * а не отдельная вставка. Текст переопределяется под контекст размещения
 * (главная — три аудитории, /vacancies — после результатов поиска).
 */
export function VeraChatBanner({
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    ctaLabel = DEFAULT_CTA_LABEL,
}: VeraChatBannerProps) {
    return (
        <div className="relative mt-10 overflow-hidden rounded-2xl border border-accent/40 bg-accent/[0.09] backdrop-blur-md shadow-[0_8px_40px_rgba(245,184,0,0.12),inset_0_1px_0_rgba(245,184,0,0.12)]">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
            <div aria-hidden="true" className="absolute -top-16 -right-16 h-52 w-52 rounded-full bg-accent/[0.12] blur-3xl" />
            <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full ring-2 ring-accent/60 shadow-[0_0_32px_rgba(245,184,0,0.4)]">
                        <span
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full bg-accent/15 animate-pulse"
                            style={{ animationDuration: "3s" }}
                        />
                        <Image
                            src="/logo_ai_assistant.png"
                            alt=""
                            aria-hidden="true"
                            width={56}
                            height={56}
                            className="relative h-full w-full rounded-full object-cover"
                        />
                    </span>
                    <div className="flex flex-col gap-1">
                        <p className="text-base font-bold text-foreground">
                            {title}
                        </p>
                        <p className="text-sm leading-relaxed text-muted">
                            {description}
                        </p>
                    </div>
                </div>
                <Link
                    href="/assistant/chat"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-[0_0_24px_rgba(245,184,0,0.35)] transition-all hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {ctaLabel}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                </Link>
            </div>
        </div>
    );
}
