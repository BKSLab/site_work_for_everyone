import Image from "next/image";
import Link from "next/link";
import { btnClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import styles from "./VeraChatBanner.module.css";

interface VeraChatBannerProps {
    title?: string;
    description?: string;
    ctaLabel?: string;
    variant?: "portrait" | "compact";
}

const DEFAULT_TITLE = "Есть вопрос по трудовым правам?";
const DEFAULT_DESCRIPTION =
    "Вера поможет разобраться в квотах, льготах и трудоустройстве.";
const DEFAULT_CTA_LABEL = "Спросить Веру";

/**
 * Приглашение в чат консультаций по трудовым правам.
 * Текст можно переопределить под контекст страницы.
 */
export function VeraChatBanner({
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    ctaLabel = DEFAULT_CTA_LABEL,
    variant = "portrait",
}: VeraChatBannerProps) {
    const compact = variant === "compact";

    return (
        <aside id="vera-chat-banner" aria-label="Консультация Ассистента Веры" className={cn(styles.banner, compact && styles.compact)}>
            <div className={styles.content}>
                {compact ? (
                    <span className={styles.compactSymbol} aria-hidden="true">
                        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
                            <path d="M8 9h8M8 13h5" />
                        </svg>
                    </span>
                ) : (
                <div className={styles.visual} aria-hidden="true">
                    <span className={styles.orbit} />
                    <span className={styles.porthole}>
                        <Image
                            src="/logo_ai_assistant.png"
                            alt=""
                            width={176}
                            height={176}
                            className={styles.portrait}
                        />
                    </span>
                    <span className={styles.chatMark}>
                        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
                            <path d="M8 9h8M8 13h5" />
                        </svg>
                    </span>
                </div>
                )}
                <div className={styles.message}>
                    {!compact && <p className={styles.eyebrow}>Ассистент Вера</p>}
                    <p className={styles.title}>{title}</p>
                    <p className={styles.description}>
                        {description}{" "}
                        <span className={styles.terms}>Бесплатно · Без регистрации</span>
                    </p>
                </div>
                <div className={styles.action}>
                    <Link href="/assistant/chat" className={btnClass("secondary", styles.cta)}>
                        {ctaLabel}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </Link>
                </div>
            </div>
        </aside>
    );
}
