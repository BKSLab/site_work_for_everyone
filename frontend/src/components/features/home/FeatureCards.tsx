import Image from "next/image";
import Link from "next/link";
import type { FC, ReactNode } from "react";

// ─── Данные ───────────────────────────────────────────────────────────────────

interface Feature {
    title: string;
    description: string;
    icon: ReactNode;
    href?: string;
    ai?: boolean;
}

const FEATURES: Feature[] = [
    {
        title: "Два источника",
        description: "hh.ru и Работы России в одном поиске",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="12" r="6" />
                <circle cx="15" cy="12" r="6" />
            </svg>
        ),
    },
    {
        title: "Поиск и фильтры",
        description: "По региону, ключевому слову и источнику",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        ),
    },
    {
        title: "Карточка вакансии",
        description: "Описание, зарплата, контакты работодателя",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
        ),
    },
    {
        title: "Избранное",
        description: "Сохраняйте вакансии и возвращайтесь к ним",
        href: "/favorites",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        title: "Сопроводительное письмо",
        description: "ИИ напишет письмо под конкретную вакансию",
        href: "/assistant",
        ai: true,
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 7l10 7 10-7" />
            </svg>
        ),
    },
    {
        title: "Советы по резюме",
        description: "Персональные рекомендации ИИ для каждой вакансии",
        href: "/assistant",
        ai: true,
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
        ),
    },
];

// ─── Позиции на орбите (% от контейнера, r=39) ───────────────────────────────
// Углы: -90°, -30°, 30°, 90°, 150°, 210° (по часовой стрелке от 12:00)

const ORBIT_POSITIONS = [
    { x: 50,   y: 11   }, // 12:00 — Два источника
    { x: 84.8, y: 30.5 }, // 02:00 — Поиск и фильтры
    { x: 84.8, y: 69.5 }, // 04:00 — Карточка вакансии
    { x: 50,   y: 89   }, // 06:00 — Избранное
    { x: 15.2, y: 69.5 }, // 08:00 — Письмо
    { x: 15.2, y: 30.5 }, // 10:00 — Резюме
];

// ─── Маленькая карточка-узел ──────────────────────────────────────────────────

function FeatureNode({ feature, index }: { feature: Feature; index: number }) {
    const { x, y } = ORBIT_POSITIONS[index];

    const inner = (
        <div className="flex flex-col items-center gap-1.5 text-center">
            <span className={feature.ai ? "text-accent" : "text-accent/70"}>
                {feature.icon}
            </span>
            <span className="text-[clamp(11px,1.2vw,15px)] font-semibold leading-tight text-foreground">
                {feature.title}
            </span>
            <span className="text-[clamp(10px,0.95vw,13px)] leading-snug text-muted">
                {feature.description}
            </span>
            {feature.ai && (
                <span className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                    AI
                </span>
            )}
        </div>
    );

    const nodeClass =
        "group absolute w-[22%] min-w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/12 bg-white/[0.05] px-5 py-5 backdrop-blur-sm transition-all duration-200 hover:border-accent/30 hover:bg-white/[0.09] hover:shadow-[0_0_24px_rgba(245,184,0,0.12)]";

    // aria-hidden — скринридеры используют скрытый список в OrbitalDiagram
    return feature.href ? (
        <Link
            href={feature.href}
            className={nodeClass}
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-hidden="true"
            tabIndex={-1}
        >
            {inner}
        </Link>
    ) : (
        <div
            aria-hidden="true"
            className={nodeClass}
            style={{ left: `${x}%`, top: `${y}%` }}
        >
            {inner}
        </div>
    );
}

// ─── Орбитальная схема (desktop) ──────────────────────────────────────────────

function OrbitalDiagram() {
    return (
        <div className="relative mx-auto aspect-square w-full">
            {/* Скрытый список для скринридеров — визуальная схема недоступна */}
            <ul aria-label="Возможности сервиса" className="sr-only">
                <li>
                    <a href="/assistant">Вера — карьерный консультант в центре системы</a>
                </li>
                {FEATURES.map((f) => (
                    <li key={f.title}>
                        {f.href ? (
                            <a href={f.href}>
                                {f.title}{f.ai ? " (AI)" : ""} — {f.description}
                            </a>
                        ) : (
                            <span>{f.title} — {f.description}</span>
                        )}
                    </li>
                ))}
            </ul>
            {/* SVG: орбитальное кольцо + линии-спицы */}
            <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Орбитальное кольцо */}
                <circle
                    cx="50"
                    cy="50"
                    r="39"
                    stroke="rgba(245,184,0,0.12)"
                    strokeWidth="0.4"
                    strokeDasharray="2.5 2.5"
                />
                {/* Внутреннее свечение центра */}
                <circle
                    cx="50"
                    cy="50"
                    r="10"
                    stroke="rgba(245,184,0,0.15)"
                    strokeWidth="0.3"
                />

                {/* Линии-спицы от центра к каждому узлу */}
                {ORBIT_POSITIONS.map((pos, i) => (
                    <line
                        key={i}
                        x1="50"
                        y1="50"
                        x2={pos.x}
                        y2={pos.y}
                        stroke="rgba(245,184,0,0.18)"
                        strokeWidth="0.35"
                        strokeDasharray="1.5 1.8"
                    />
                ))}

                {/* Точки на орбите */}
                {ORBIT_POSITIONS.map((pos, i) => (
                    <circle
                        key={i}
                        cx={pos.x}
                        cy={pos.y}
                        r="0.9"
                        fill="rgba(245,184,0,0.5)"
                    />
                ))}

                {/* Точка в центре */}
                <circle cx="50" cy="50" r="1.2" fill="rgba(245,184,0,0.6)" />
            </svg>

            {/* Центральный узел: Вера (aria-hidden — дублирует скрытый список) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
                <Link
                    href="/assistant"
                    className="group flex flex-col items-center gap-3"
                    tabIndex={-1}
                >
                    {/* Внешнее медленное кольцо */}
                    <span
                        aria-hidden="true"
                        className="absolute h-[15%] w-[15%] rounded-full ring-1 ring-accent/20 animate-ping"
                        style={{ animationDuration: "3.5s" }}
                    />
                    {/* Среднее кольцо */}
                    <span className="relative flex items-center justify-center">
                        <span
                            aria-hidden="true"
                            className="absolute h-[140%] w-[140%] rounded-full ring-1 ring-accent/15 ring-offset-0"
                        />
                        {/* Основное кольцо + аватар */}
                        <span className="relative flex h-[20vw] w-[20vw] max-h-[200px] max-w-[200px] min-h-[120px] min-w-[120px] items-center justify-center rounded-full ring-2 ring-accent/60 shadow-[0_0_64px_rgba(245,184,0,0.4)] transition-all duration-300 group-hover:ring-accent group-hover:shadow-[0_0_90px_rgba(245,184,0,0.6)]">
                            <span
                                aria-hidden="true"
                                className="absolute inset-0 rounded-full bg-accent/10 animate-pulse"
                                style={{ animationDuration: "3s" }}
                            />
                            <Image
                                src="/logo_ai_assistant.png"
                                alt=""
                                aria-hidden="true"
                                width={200}
                                height={200}
                                className="relative h-full w-full rounded-full object-cover"
                            />
                        </span>
                    </span>
                    {/* Подпись */}
                    <span className="flex flex-col items-center gap-1.5">
                        <span className="text-[clamp(16px,1.8vw,24px)] font-bold text-foreground tracking-wide">
                            Вера
                        </span>
                        <span className="rounded-full border border-accent/35 bg-accent/10 px-4 py-1 text-[clamp(10px,1vw,14px)] font-semibold uppercase tracking-widest text-accent/90 backdrop-blur-sm">
                            Карьерный консультант
                        </span>
                    </span>
                </Link>
            </div>

            {/* Узлы функций */}
            {FEATURES.map((feature, i) => (
                <FeatureNode key={feature.title} feature={feature} index={i} />
            ))}
        </div>
    );
}

// ─── Мобильная сетка ──────────────────────────────────────────────────────────

function MobileGrid() {
    return (
        <div className="flex flex-col gap-4">
            {/* Центральный элемент */}
            <Link
                href="/assistant"
                className="group flex items-center gap-4 rounded-2xl border border-accent/25 bg-accent/[0.06] px-5 py-4 transition-all duration-200 hover:border-accent/50 hover:bg-accent/[0.10]"
            >
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-accent/50 shadow-[0_0_20px_rgba(245,184,0,0.2)]">
                    <span aria-hidden="true" className="absolute inset-0 rounded-full bg-accent/10 animate-pulse" style={{ animationDuration: "3s" }} />
                    <Image
                        src="/logo_ai_assistant.png"
                        alt=""
                        aria-hidden="true"
                        width={48}
                        height={48}
                        className="relative rounded-full"
                    />
                </span>
                <div>
                    <p className="text-sm font-bold text-accent">Вера — карьерный консультант</p>
                    <p className="text-xs text-muted">Сопроводительные письма и советы по резюме</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-auto shrink-0 text-accent/60">
                    <path d="M9 18l6-6-6-6" />
                </svg>
            </Link>

            {/* Сетка функций */}
            <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {FEATURES.map((feature) => {
                    const inner = (
                        <>
                            <span className={feature.ai ? "text-accent" : "text-accent/70"}>
                                {feature.icon}
                            </span>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-[13px] font-semibold text-foreground leading-tight">
                                    {feature.title}
                                </p>
                                <p className="text-[11px] text-muted leading-snug">
                                    {feature.description}
                                </p>
                            </div>
                            {feature.ai && (
                                <span className="self-start rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                                    AI
                                </span>
                            )}
                        </>
                    );

                    const cardClass =
                        "flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 transition-all hover:border-white/20 hover:bg-white/[0.07]";

                    return (
                        <li key={feature.title}>
                            {feature.href ? (
                                <Link href={feature.href} className={cardClass}>
                                    {inner}
                                </Link>
                            ) : (
                                <div className={cardClass}>{inner}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

// ─── Экспорт ──────────────────────────────────────────────────────────────────

export const FeatureCards: FC = () => {
    return (
        <>
            <div className="hidden lg:block">
                <OrbitalDiagram />
            </div>
            <div className="lg:hidden">
                <MobileGrid />
            </div>
        </>
    );
};
