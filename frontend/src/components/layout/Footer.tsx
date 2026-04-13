import Link from "next/link";

export function Footer() {
    return (
        <footer className="border-t border-border bg-surface" aria-label="Подвал сайта">
            <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col items-center gap-3">
                <nav aria-label="Ссылки подвала" className="flex items-center gap-6">
                    <Link
                        href="/contact"
                        className="text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Обратная связь
                    </Link>
                    <Link
                        href="/privacy"
                        className="text-sm text-muted hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Политика конфиденциальности
                    </Link>
                </nav>
                <p className="text-center text-sm text-muted">
                    Работа для всех — сервис поиска вакансий для людей с инвалидностью
                </p>
            </div>
        </footer>
    );
}
