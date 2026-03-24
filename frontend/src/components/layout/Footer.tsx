import Link from "next/link";

export function Footer() {
    return (
        <footer className="border-t border-border bg-surface">
            <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col items-center gap-3">
                <Link
                    href="/contact"
                    className="text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Обратная связь с автором
                </Link>
                <p className="text-center text-sm text-muted">
                    Работа для всех — сервис поиска вакансий для людей с инвалидностью
                </p>
            </div>
        </footer>
    );
}
