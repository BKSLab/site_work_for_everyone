import { cn } from "@/lib/utils/cn";

interface VeraScopeNoticeProps {
    compact?: boolean;
    className?: string;
}

export function VeraScopeNotice({
    compact = false,
    className,
}: VeraScopeNoticeProps) {
    return (
        <aside
            aria-label="Важно о консультациях Ассистента Веры"
            className={cn(
                compact
                    ? "border-t border-accent/20 pt-3"
                    : "rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3 shadow-[inset_0_1px_0_rgba(245,184,0,0.08)] sm:px-5 sm:py-4",
                className,
            )}
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10 text-sm font-bold text-accent"
                >
                    i
                </span>
                <p className="text-sm leading-relaxed text-muted">
                    <strong className="font-semibold text-foreground">
                        Ассистент Вера не заменяет юриста:
                    </strong>{" "}
                    она даёт первичную ориентацию — «какие у меня права»,
                    «что работодатель обязан сделать», «куда обратиться».
                    Это доступный первый шаг, которого сейчас нигде нет в
                    одном месте.
                </p>
            </div>
        </aside>
    );
}
