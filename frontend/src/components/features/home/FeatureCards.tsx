import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./FeatureCards.module.css";

// ─── Данные ───────────────────────────────────────────────────────────────────

interface Feature {
    id: string;
    title: string;
    description: string;
    icon: ReactNode;
    href?: string;
    ai?: boolean;
}

const FEATURES: Feature[] = [
    {
        id: "sources",
        title: "Два источника",
        description: "Находите вакансии с hh.ru и Работы России",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="12" r="6" />
                <circle cx="15" cy="12" r="6" />
            </svg>
        ),
    },
    {
        id: "search",
        title: "Поиск и фильтры",
        description: "Фильтруйте по региону, словам и источнику",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        ),
    },
    {
        id: "details",
        title: "Карточка вакансии",
        description: "Изучайте условия, зарплату и контакты",
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
        id: "favorites",
        title: "Избранное",
        description: "Сохраняйте вакансии, чтобы вернуться позже",
        href: "/favorites",
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
        ),
    },
    {
        id: "letter",
        title: "Сопроводительное письмо",
        description: "Получайте письмо под выбранную вакансию",
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
        id: "resume",
        title: "Советы по резюме",
        description: "Улучшайте резюме под требования вакансии",
        href: "/assistant",
        ai: true,
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
        ),
    },
    {
        id: "rights",
        title: "Консультация по правам",
        description: "Узнавайте о трудовых правах без регистрации",
        href: "/assistant/chat",
        ai: true,
        icon: (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
        ),
    },
];

// ─── Планеты возможностей ─────────────────────────────────────────────────────

function FeaturePlanet({ feature }: { feature: Feature }) {
    const content = (
        <>
            <span className={styles.sphere} aria-hidden="true">
                {(feature.id === "favorites" || feature.id === "letter") && (
                    <span className={styles.planetRing} />
                )}
                <span className={styles.planetIcon}>{feature.icon}</span>
            </span>
            <div className={styles.caption}>
                {feature.ai && <span className={styles.eyebrow}>Ассистент Вера</span>}
                <h3 className={styles.title}>
                    {feature.title}
                    {feature.href && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 17 17 7M7 7h10v10" />
                        </svg>
                    )}
                </h3>
                <span className={styles.description}>{feature.description}</span>
            </div>
        </>
    );

    return (
        <li className={styles.planet} data-planet={feature.id} data-ai={feature.ai || undefined}>
            {feature.href ? (
                <Link href={feature.href} className={cn(styles.planetContent, styles.planetLink)}>
                    {content}
                </Link>
            ) : (
                <div className={styles.planetContent}>{content}</div>
            )}
        </li>
    );
}

export function FeatureCards() {
    return (
        <div className={styles.scene}>
            <svg
                className={styles.orbits}
                viewBox="0 0 1000 700"
                fill="none"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="feature-orbit-light" x1="100" y1="60" x2="850" y2="650" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#F5B800" stopOpacity="0.04" />
                        <stop offset="0.48" stopColor="#F5B800" stopOpacity="0.36" />
                        <stop offset="1" stopColor="#F5B800" stopOpacity="0.07" />
                    </linearGradient>
                </defs>
                <ellipse cx="480" cy="335" rx="465" ry="245" transform="rotate(-17 480 335)" stroke="url(#feature-orbit-light)" />
                <ellipse cx="480" cy="335" rx="365" ry="220" transform="rotate(25 480 335)" stroke="url(#feature-orbit-light)" />
                <ellipse cx="480" cy="335" rx="250" ry="135" transform="rotate(-24 480 335)" stroke="rgba(245,184,0,0.13)" strokeDasharray="2 8" />
                <path d="M79 455C205 585 626 655 914 323" stroke="rgba(245,184,0,0.11)" />
                <g fill="#F0F0F0">
                    <circle cx="91" cy="130" r="1.2" opacity="0.35" />
                    <circle cx="368" cy="56" r="1" opacity="0.25" />
                    <circle cx="788" cy="91" r="1.4" opacity="0.3" />
                    <circle cx="947" cy="181" r="1" opacity="0.3" />
                    <circle cx="355" cy="235" r="1" opacity="0.3" />
                    <circle cx="696" cy="345" r="1.4" opacity="0.2" />
                    <circle cx="57" cy="552" r="1" opacity="0.25" />
                    <circle cx="453" cy="632" r="1.4" opacity="0.3" />
                    <circle cx="926" cy="610" r="1.2" opacity="0.35" />
                </g>
            </svg>

            <Link href="/assistant" className={styles.hub}>
                <span className={styles.hubVisual}>
                    <span className={styles.hubHalo} aria-hidden="true" />
                    <Image
                        src="/logo_ai_assistant.png"
                        alt=""
                        aria-hidden="true"
                        width={180}
                        height={180}
                        className={styles.hubImage}
                    />
                </span>
                <span className={styles.hubCaption}>
                    <span className={styles.hubTitle}>Ассистент Вера</span>
                    <span className={styles.hubSubtitle}>Ваш карьерный навигатор</span>
                </span>
            </Link>

            <ul role="list" aria-label="Возможности сервиса" className={styles.planets}>
                {FEATURES.map((feature) => (
                    <FeaturePlanet key={feature.id} feature={feature} />
                ))}
            </ul>
        </div>
    );
}
