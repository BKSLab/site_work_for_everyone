import Link from "next/link";

interface BlogPaginationProps {
    currentPage: number;
    totalPages: number;
    buildHref: (page: number) => string;
}

export function BlogPagination({ currentPage, totalPages, buildHref }: BlogPaginationProps) {
    if (totalPages <= 1) return null;

    const pages: (number | "…")[] = [];

    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push("…");
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i);
        }
        if (currentPage < totalPages - 2) pages.push("…");
        pages.push(totalPages);
    }

    const btnBase = "flex h-10 min-w-[2.5rem] items-center justify-center rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
    const btnIdle = "border border-white/15 bg-white/5 text-foreground hover:border-accent/60 hover:bg-white/10";
    const btnActive = "border border-accent/50 bg-accent/10 text-accent cursor-default font-bold";
    const btnDisabled = "border border-white/8 text-muted/30 pointer-events-none";

    return (
        <nav aria-label="Страницы блога" className="flex flex-wrap items-center justify-center gap-1.5 py-8">

            <Link
                href={buildHref(currentPage - 1)}
                aria-disabled={currentPage === 1}
                tabIndex={currentPage === 1 ? -1 : undefined}
                aria-label="Предыдущая страница"
                className={`${btnBase} ${currentPage === 1 ? btnDisabled : btnIdle}`}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                </svg>
            </Link>

            {pages.map((p, i) =>
                p === "…" ? (
                    <span key={`ellipsis-${i}`} aria-hidden="true" className="flex h-10 min-w-[2.5rem] items-center justify-center text-sm text-muted">
                        …
                    </span>
                ) : (
                    <Link
                        key={p}
                        href={buildHref(p)}
                        aria-current={p === currentPage ? "page" : undefined}
                        className={`${btnBase} ${p === currentPage ? btnActive : btnIdle}`}
                    >
                        <span className="sr-only">Страница </span>{p}
                    </Link>
                )
            )}

            <Link
                href={buildHref(currentPage + 1)}
                aria-disabled={currentPage === totalPages}
                tabIndex={currentPage === totalPages ? -1 : undefined}
                aria-label="Следующая страница"
                className={`${btnBase} ${currentPage === totalPages ? btnDisabled : btnIdle}`}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                </svg>
            </Link>

        </nav>
    );
}
