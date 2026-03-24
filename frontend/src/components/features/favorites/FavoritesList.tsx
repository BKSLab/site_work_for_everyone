"use client";

import Link from "next/link";
import { Pagination } from "@/components/ui/Pagination";
import { Button, btnClass } from "@/components/ui/Button";
import { SourceBadge, getSourceLabel } from "@/components/ui/SourceBadge";
import type { VacancyDetail } from "@/types/vacancy";

interface FavoritesListProps {
    items: VacancyDetail[];
    total: number;
    pageSize: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onRemove: (vacancyId: string) => void;
    removingId: string | null;
}

function truncateText(text: string, maxLength: number = 300): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
}

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => {
    if (!value) return null;
    return (
        <>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-sm font-semibold text-foreground">{value}</dd>
        </>
    );
};

export function FavoritesList({
    items,
    total,
    pageSize,
    currentPage,
    onPageChange,
    onRemove,
    removingId,
}: FavoritesListProps) {
    const totalPages = Math.ceil(total / pageSize);

    if (items.length === 0) {
        return (
            <div
                role="status"
                className="flex flex-col items-center gap-6 py-20 text-center"
            >
                {/* Иконка закладки */}
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-sm">
                    <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-accent/70"
                        aria-hidden="true"
                    >
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                </div>

                <div className="max-w-sm">
                    <h2 className="text-xl font-bold text-foreground">
                        Список избранного пуст
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                        Добавляйте вакансии в избранное, чтобы вернуться к ним
                        в любой момент
                    </p>
                </div>

                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded border border-accent/50 bg-white/10 px-4 py-2 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    Найти вакансии
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <p role="status" aria-live="polite" className="text-sm text-muted">
                Сохранено вакансий:{" "}
                <span className="font-semibold text-foreground">{total}</span>
            </p>

            <ul role="list" className="flex flex-col gap-4">
                {items.map((vacancy) => {
                    const titleId = `fav-${vacancy.vacancy_id}-title`;
                    return (
                        <li key={vacancy.vacancy_id}>
                            <article
                                aria-labelledby={titleId}
                                className="flex flex-col gap-4 rounded-lg border border-white/20 bg-surface bg-[radial-gradient(circle_at_top_left,rgba(245,184,0,0.07),transparent_50%)] p-6"
                            >
                                <h2
                                    id={titleId}
                                    className="text-xl font-bold text-foreground"
                                >
                                    {vacancy.vacancy_name}
                                </h2>

                                <hr className="border-t-2 border-accent" />

                                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                                    <dt className="text-sm text-muted">Источник:</dt>
                                    <dd className="text-sm font-semibold text-foreground">
                                        <SourceBadge source={vacancy.vacancy_source} />
                                    </dd>
                                    <InfoRow
                                        label="Заработная плата:"
                                        value={vacancy.salary}
                                    />
                                    <InfoRow
                                        label="Работодатель:"
                                        value={vacancy.employer_name}
                                    />
                                </dl>

                                {vacancy.description && (
                                    <p className="text-sm text-foreground">
                                        {truncateText(vacancy.description, 300)}
                                    </p>
                                )}

                                <div className="mt-auto flex flex-wrap gap-3 pt-4">
                                    <Link
                                        href={`/favorites/${vacancy.vacancy_id}`}
                                        className={btnClass()}
                                    >
                                        Подробнее
                                    </Link>
                                    <Link
                                        href={`/assistant?vacancy_id=${vacancy.vacancy_id}`}
                                        className={btnClass()}
                                        aria-label={`Открыть карьерного ассистента для вакансии: ${vacancy.vacancy_name}`}
                                    >
                                        Карьерный ассистент
                                    </Link>
                                    <Button
                                        onClick={() => onRemove(vacancy.vacancy_id)}
                                        disabled={removingId === vacancy.vacancy_id}
                                        aria-label={`Удалить из избранного: ${vacancy.vacancy_name}`}
                                    >
                                        {removingId === vacancy.vacancy_id
                                            ? "Удаление…"
                                            : "Удалить из избранного"}
                                    </Button>
                                    {vacancy.vacancy_url && (
                                        <a
                                            href={vacancy.vacancy_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={btnClass()}
                                        >
                                            {`Открыть на ${getSourceLabel(vacancy.vacancy_source)}`}
                                            <span className="sr-only">, откроется в новом окне</span>
                                        </a>
                                    )}
                                </div>
                            </article>
                        </li>
                    );
                })}
            </ul>

            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                />
            )}
        </div>
    );
}
