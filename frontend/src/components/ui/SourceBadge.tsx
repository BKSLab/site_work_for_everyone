import Image from "next/image";

const SOURCE_LOGOS: Record<string, { src: string; label: string }> = {
    "hh.ru": { src: "/hh.ru.png", label: "hh.ru" },
    "trudvsem.ru": { src: "/trudvsem.ru.png", label: "Работа России" },
};

export function getSourceLabel(source: string): string {
    return SOURCE_LOGOS[source]?.label ?? source;
}

interface SourceBadgeProps {
    source: string;
    /** Показывать текстовую подпись рядом с логотипом */
    withLabel?: boolean;
    className?: string;
}

/**
 * Логотип источника в стеклянном бейдже.
 * Доступность: alt-текст читается скрин-ридером как название источника.
 * При withLabel=true alt сбрасывается в "", чтобы не было двойного чтения.
 */
export function SourceBadge({ source, withLabel = false, className }: SourceBadgeProps) {
    const logo = SOURCE_LOGOS[source];

    if (!logo) {
        return <span className={className}>{source}</span>;
    }

    return (
        <span
            className={[
                "inline-flex items-center gap-2",
                "rounded-md border border-white/15",
                "bg-white/5 backdrop-blur-sm",
                "px-2.5 py-1",
                className ?? "",
            ].join(" ")}
        >
            <Image
                src={logo.src}
                alt={withLabel ? "" : logo.label}
                width={100}
                height={26}
                className="h-[1.35rem] w-auto object-contain"
            />
            {withLabel && (
                <span className="text-sm font-medium text-foreground/90">
                    {logo.label}
                </span>
            )}
        </span>
    );
}
