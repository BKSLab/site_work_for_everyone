import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import styles from "./SiteChrome.module.css";

export function Footer() {
    return (
        <footer className={cn("site-footer border-t border-border bg-surface", styles.footer)} aria-label="Подвал сайта">
            <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col items-center gap-3">
                <nav aria-label="Ссылки подвала" className={cn("flex items-center gap-6", styles.footerLinks)}>
                    <Link
                        href="/contact"
                        className={cn("text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", styles.footerLink)}
                    >
                        Обратная связь
                    </Link>
                    <Link
                        href="/help"
                        className={cn("text-sm text-muted hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", styles.footerLink)}
                    >
                        Справка
                    </Link>
                    <Link
                        href="/privacy"
                        className={cn("text-sm text-muted hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", styles.footerLink)}
                    >
                        Политика конфиденциальности
                    </Link>
                </nav>
                <p className={cn("text-center text-sm text-muted", styles.tagline)}>
                    Работа для всех — сервис поиска вакансий для людей с инвалидностью
                </p>
            </div>
        </footer>
    );
}
