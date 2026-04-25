"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { vacanciesApi } from "@/lib/api";
import { useFavoriteToggle } from "@/hooks/useFavoriteToggle";
import { SourceBadge, getSourceLabel } from "@/components/ui/SourceBadge";
import type { VacancyOut } from "@/types/vacancy";

interface VacancyCardProps {
    vacancy: VacancyOut;
}

function truncateText(text: string, maxLength: number = 300): string {
    if (text.length <= maxLength) {
        return text;
    }
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

export function VacancyCard({ vacancy }: VacancyCardProps) {
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const { isFavorite, isFavoritePending, favoriteError, handleFavoriteClick } =
        useFavoriteToggle(vacancy.vacancy_id, vacancy.is_favorite);

    function handleDetailHover() {
        queryClient.prefetchQuery({
            queryKey: ["vacancy", vacancy.vacancy_id, user?.email ?? null],
            queryFn: () => vacanciesApi.getById(vacancy.vacancy_id, user?.email),
        });
    }

    return (
        <article
            aria-labelledby={`vacancy-${vacancy.vacancy_id}-title`}
            className="flex flex-col gap-4 rounded-lg border border-white/20 bg-surface bg-[radial-gradient(circle_at_top_left,rgba(245,184,0,0.07),transparent_50%)] p-6"
        >
            {/* Title */}
            <h2
                id={`vacancy-${vacancy.vacancy_id}-title`}
                className="text-xl font-bold text-foreground"
            >
                {vacancy.vacancy_name}
            </h2>

            {/* Divider */}
            <hr className="border-t-2 border-accent" />

            {/* Main Info Section */}
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                <dt className="text-sm text-muted">Источник:</dt>
                <dd className="text-sm font-semibold text-foreground">
                    <SourceBadge source={vacancy.vacancy_source} />
                </dd>
                <InfoRow label="Заработная плата:" value={vacancy.salary} />
                <InfoRow label="Работодатель:" value={vacancy.employer_name} />
            </dl>

            {/* Description */}
            {vacancy.description && (
                <p className="text-sm text-foreground">
                    {truncateText(vacancy.description, 300)}
                </p>
            )}

            <p role="alert" className="text-xs text-red-400 min-h-[1.25rem]">{favoriteError}</p>

            {/* Action Buttons */}
            <div className="mt-auto flex flex-wrap justify-start gap-3 pt-4">
                <Link
                    href={`/vacancies/${vacancy.vacancy_id}`}
                    id={`detail-link-${vacancy.vacancy_id}`}
                    onClick={() => sessionStorage.setItem('returnFocusVacancyId', vacancy.vacancy_id)}
                    onMouseEnter={handleDetailHover}
                    onFocus={handleDetailHover}
                    className="rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-center text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Подробнее
                </Link>
                <button
                    type="button"
                    onClick={handleFavoriteClick}
                    disabled={isFavoritePending}
                    className="rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isFavorite ? "Удалить из избранного" : "В избранное"}
                </button>
                <a
                    href={vacancy.vacancy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-accent/50 bg-white/10 px-3 py-1.5 text-center text-sm font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {`Открыть на ${getSourceLabel(vacancy.vacancy_source)}`}
                    <span className="sr-only">, откроется в новом окне</span>
                </a>
            </div>
        </article>
    );
}
