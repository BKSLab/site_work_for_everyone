"use client";

import { cn } from "@/lib/utils/cn";

interface SimplifyAnswerButtonProps {
    disabled?: boolean;
    onSimplify: () => void;
}

function SparkleIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-[1.125rem] w-[1.125rem] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
            <path d="M18.5 16.5 19 18.4l1.9.6-1.9.6-.5 1.9-.5-1.9-1.9-.6 1.9-.6.5-1.9Z" />
        </svg>
    );
}

/**
 * Кнопка появляется только под ответом, построенным на данных базы знаний, и
 * только под последним таким ответом: агент упрощает последнюю реплику
 * диалога, поэтому кнопка под более старым ответом переформулировала бы не
 * его. Нажатие отправляет обычное сообщение пользователя — тем же путём, что
 * и набранное вручную.
 *
 * Текст на кнопке видимый, а не иконка: смысл фичи в том, чтобы подсказать
 * пользователю саму возможность, о которой иначе нужно догадаться.
 */
export function SimplifyAnswerButton({
    disabled = false,
    onSimplify,
}: SimplifyAnswerButtonProps) {
    return (
        <button
            type="button"
            aria-label="Объяснить проще ответ Ассистента Веры"
            title="Объяснить проще ответ Ассистента Веры"
            disabled={disabled}
            onClick={onSimplify}
            className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "border-accent/30 bg-accent/[0.06] text-foreground",
                "hover:border-accent/60 hover:bg-accent/[0.12]",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-accent/30 disabled:hover:bg-accent/[0.06]",
            )}
        >
            <SparkleIcon />
            <span>Объяснить проще</span>
        </button>
    );
}
