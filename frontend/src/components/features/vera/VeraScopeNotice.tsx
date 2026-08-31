import { cn } from "@/lib/utils/cn";

interface VeraScopeNoticeProps {
    compact?: boolean;
    className?: string;
}

export function VeraScopeNotice({
    compact = false,
    className,
}: VeraScopeNoticeProps) {
    if (compact) {
        return (
            <aside
                aria-label="Важно о консультациях Ассистента Веры"
                className={cn(
                    "vera-chat-scope-notice border-t border-accent/20 pt-3",
                    className,
                )}
            >
                <div className="flex items-start gap-3">
                    <NoticeIcon />
                    <NoticeText />
                </div>
            </aside>
        );
    }

    return (
        <aside
            aria-label="Важно о консультациях Ассистента Веры"
            className={cn(
                "vera-chat-scope-notice shrink-0 border-b border-accent/25 bg-accent/[0.07] px-3 shadow-none sm:rounded-2xl sm:border sm:border-accent/30 sm:px-5 sm:py-4 sm:shadow-[inset_0_1px_0_rgba(245,184,0,0.08)]",
                className,
            )}
        >
            <details className="group sm:hidden">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    <NoticeIcon />
                    <strong className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                        Вера не заменяет юриста
                    </strong>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-accent">
                        Подробнее
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="h-4 w-4 transition-transform group-open:rotate-180"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="m6 8 4 4 4-4" />
                        </svg>
                    </span>
                </summary>
                <p className="pb-3 pl-8 pr-1 text-xs leading-relaxed text-muted">
                    Она даёт первичную ориентацию — «какие у меня права», «что
                    работодатель обязан сделать», «куда обратиться».
                </p>
            </details>

            <div className="hidden items-start gap-3 sm:flex">
                <NoticeIcon />
                <NoticeText />
            </div>
        </aside>
    );
}

function NoticeIcon() {
    return (
        <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10 text-sm font-bold text-accent sm:mt-0.5"
        >
            i
        </span>
    );
}

function NoticeText() {
    return (
        <p className="text-sm leading-relaxed text-muted">
            <strong className="font-semibold text-foreground">
                Ассистент Вера не заменяет юриста:
            </strong>{" "}
            она даёт первичную ориентацию — «какие у меня права», «что
            работодатель обязан сделать», «куда обратиться». Это доступный
            первый шаг, которого сейчас нигде нет в одном месте.
        </p>
    );
}
