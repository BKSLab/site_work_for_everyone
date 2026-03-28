import Link from "next/link";
import { btnClass } from "@/components/ui/Button";

interface ServiceErrorProps {
    /** Переопределить заголовок (по умолчанию «Сервис временно недоступен») */
    title?: string;
    /** Callback для кнопки «Попробовать снова» (передаётся из Error Boundary) */
    onRetry?: () => void;
}

export function ServiceError({ title = "Сервис временно недоступен", onRetry }: ServiceErrorProps) {
    return (
        <div
            role="alert"
            className="flex flex-col items-start gap-4 rounded-xl border border-white/10 bg-surface p-6"
        >
            <div className="flex items-center gap-3">
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-accent"
                    aria-hidden="true"
                >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm font-semibold text-foreground">{title}</p>
            </div>
            <p className="text-sm text-muted">
                Что-то пошло не так. Пожалуйста, попробуйте позже или свяжитесь с нами.
            </p>
            <div className="flex gap-3">
                {onRetry && (
                    <button onClick={onRetry} className={btnClass("primary")}>
                        Попробовать снова
                    </button>
                )}
                <Link href="/contact" className={btnClass("secondary")}>
                    Обратная связь
                </Link>
            </div>
        </div>
    );
}
