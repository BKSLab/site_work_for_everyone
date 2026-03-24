"use client";

import { SourceBadge } from "@/components/ui/SourceBadge";
import type { VacanciesInfo } from "@/types/vacancy";

interface SearchResultsSummaryProps {
    summary: VacanciesInfo | null;
    /** Слот для кнопок управления (фильтры, сброс) */
    actions?: React.ReactNode;
    /** Число вакансий с учётом активных фильтров */
    filteredTotal?: number;
    /** Есть ли активные фильтры */
    isFiltered?: boolean;
    /** Число вакансий hh.ru с учётом фильтров */
    filteredCountHh?: number;
    /** Число вакансий Работа России с учётом фильтров */
    filteredCountTv?: number;
}

const MapPinIcon = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-accent"
        aria-hidden="true"
    >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-muted";
const VALUE = "text-sm font-semibold text-foreground truncate";

export function SearchResultsSummary({ summary, actions, filteredTotal, isFiltered, filteredCountHh, filteredCountTv }: SearchResultsSummaryProps) {
    const showFiltered = isFiltered && filteredTotal !== undefined;
    if (!summary && !actions) return null;

    return (
        <div className="mb-8 overflow-hidden rounded-xl border border-white/10 bg-surface">

            {/* Акцентная полоса сверху */}
            <div
                aria-hidden="true"
                className="h-px bg-gradient-to-r from-transparent via-accent to-transparent"
            />

            {/*
                Сегменты в одну строку на sm+.
                На мобильных — стек с горизонтальными разделителями.
                divide-x / divide-y берут на себя все разделители автоматически.
            */}
            <div className="flex flex-col divide-y divide-white/10 sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">

                {/* ── Сегмент 1: Итоговое число ── */}
                {summary && (
                    <div className="flex shrink-0 items-center justify-center px-7 py-4">
                        <div className="text-center">
                            <p className={LABEL}>{showFiltered ? "По фильтру" : "Найдено"}</p>
                            {showFiltered ? (
                                <p
                                    className="mt-0.5 leading-none tabular-nums"
                                    aria-label={`По фильтру: ${filteredTotal} из ${summary.all_vacancies_count}`}
                                >
                                    <span className="text-3xl font-bold text-accent">{filteredTotal}</span>
                                    <span className="text-base font-semibold text-muted"> из {summary.all_vacancies_count}</span>
                                </p>
                            ) : (
                                <p
                                    className="mt-0.5 text-3xl font-bold leading-none tabular-nums text-accent"
                                    aria-label={`Найдено вакансий: ${summary.all_vacancies_count}`}
                                >
                                    {summary.all_vacancies_count}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Сегмент 2: По источникам ── */}
                {summary && (
                    <div className="flex shrink-0 flex-col">
                        {showFiltered && (
                            <p
                                aria-hidden="true"
                                className="border-b border-white/10 px-5 py-1 text-center text-[9px] font-medium uppercase tracking-widest text-muted/60"
                            >
                                по фильтру / всего
                            </p>
                        )}
                        <div className="flex flex-1 items-stretch divide-x divide-white/10">
                            <div className="flex items-center gap-2.5 px-5 py-4">
                                <div>
                                    <p className={LABEL}>hh.ru</p>
                                    {showFiltered && filteredCountHh !== undefined ? (
                                        <p
                                            className="mt-0.5 leading-none tabular-nums"
                                            aria-label={`hh.ru по фильтру: ${filteredCountHh} из ${summary.vacancies_count_hh}`}
                                        >
                                            <span className="text-lg font-bold text-accent">{filteredCountHh}</span>
                                            <span className="text-xs font-semibold text-muted"> из {summary.vacancies_count_hh}</span>
                                        </p>
                                    ) : (
                                        <p className="mt-0.5 text-lg font-bold leading-none tabular-nums text-foreground">
                                            {summary.vacancies_count_hh}
                                        </p>
                                    )}
                                </div>
                                <SourceBadge source="hh.ru" className="opacity-70" />
                            </div>
                            <div className="flex items-center gap-2.5 px-5 py-4">
                                <div>
                                    <p className={LABEL}>Работа России</p>
                                    {showFiltered && filteredCountTv !== undefined ? (
                                        <p
                                            className="mt-0.5 leading-none tabular-nums"
                                            aria-label={`Работа России по фильтру: ${filteredCountTv} из ${summary.vacancies_count_tv}`}
                                        >
                                            <span className="text-lg font-bold text-accent">{filteredCountTv}</span>
                                            <span className="text-xs font-semibold text-muted"> из {summary.vacancies_count_tv}</span>
                                        </p>
                                    ) : (
                                        <p className="mt-0.5 text-lg font-bold leading-none tabular-nums text-foreground">
                                            {summary.vacancies_count_tv}
                                        </p>
                                    )}
                                </div>
                                <SourceBadge source="trudvsem.ru" className="opacity-70" />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Сегмент 3: Местоположение ── */}
                {summary && (
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-5 py-4">
                        <MapPinIcon />
                        <div className="min-w-0">
                            <p className={LABEL}>Местоположение</p>
                            {summary.location && (
                                <p className={VALUE}>{summary.location}</p>
                            )}
                            {summary.region_name && (
                                <p className="truncate text-xs text-muted">
                                    {summary.region_name}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Сегмент 4: Действия ── */}
                {actions && (
                    <div className="flex shrink-0 items-center gap-2 px-4 py-3">
                        {actions}
                    </div>
                )}

            </div>

            {/* Нижняя тёмная полоса */}
            <div
                aria-hidden="true"
                className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"
            />

        </div>
    );
}
