"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { VacancyList } from "@/components/features/vacancies/VacancyList";
import { VacancyFilters } from "@/components/features/vacancies/VacancyFilters";
import { SearchResultsSummary } from "@/components/features/vacancies/SearchResultsSummary";
import { VeraChatBanner } from "@/components/features/vera/VeraChatBanner";
import { useVacancies } from "@/hooks/useVacancies";
import { useSearchStore } from "@/stores/search";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ServiceError } from "@/components/ui/ServiceError";
import { getSourceLabel } from "@/components/ui/SourceBadge";

const DEFAULT_PAGE_SIZE = 20;

export function VacanciesContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const location = searchParams.get("location") ?? "";
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE));
    const keyword = searchParams.get("keyword") ?? "";
    const source = searchParams.get("source") ?? "";

    const summary = useSearchStore((state) => state.summary);
    const userId = useAuthStore((s) => s.user?.email);

    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const h1Ref = useRef<HTMLHeadingElement>(null);

    const {
        data,
        isFetching,
        isPlaceholderData,
        isError: isListError,
    } = useVacancies(location, page, pageSize, userId, keyword, source);

    useEffect(() => {
        if (sessionStorage.getItem("returnFocusVacancyId")) return;
        h1Ref.current?.focus();
    }, [location, page, keyword, source]);

    useEffect(() => {
        if (!data || isPlaceholderData || isFetching) return;
        const savedId = sessionStorage.getItem('returnFocusVacancyId');
        if (!savedId) return;
        const frame = requestAnimationFrame(() => {
            const target = document.getElementById(`detail-link-${savedId}`);
            const active = document.activeElement;
            if (!target || (active !== document.body && active !== h1Ref.current && active?.tagName !== "MAIN")) return;
            target.focus();
            if (document.activeElement === target) sessionStorage.removeItem("returnFocusVacancyId");
        });
        return () => cancelAnimationFrame(frame);
    }, [data, isPlaceholderData, isFetching]);

    const activeFilterCount = (keyword ? 1 : 0) + (source ? 1 : 0);

    function handlePageChange(newPage: number) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(newPage));
        router.push(`/vacancies?${params.toString()}`);
    }

    function handleApplyFilters(
        newKeyword: string,
        newSource: string,
        newPageSize: number,
    ) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", "1");
        if (newKeyword) params.set("keyword", newKeyword);
        else params.delete("keyword");
        if (newSource) params.set("source", newSource);
        else params.delete("source");
        params.set("page_size", String(newPageSize));
        router.push(`/vacancies?${params.toString()}`);
        setIsFiltersOpen(false);
    }

    function handleResetFilters() {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("keyword");
        params.delete("source");
        params.set("page", "1");
        router.push(`/vacancies?${params.toString()}`);
    }

    if (!location) {
        return (
            <Container className="py-12">
                <h1 ref={h1Ref} tabIndex={-1} className="mb-4 scroll-mt-28 text-2xl font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Результаты поиска</h1>
                <p className="text-sm text-muted">
                    Введите параметры поиска на{" "}
                    <Link
                        href="/"
                        className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        главной странице
                    </Link>
                    .
                </p>
            </Container>
        );
    }

    // Кнопки фильтра — появляются только после первой загрузки
    const filterActions = data !== undefined ? (
        <>
            <Button
                onClick={() => setIsFiltersOpen(true)}
                disabled={isFetching}
                aria-haspopup="dialog"
                aria-label={
                    activeFilterCount > 0
                        ? `Открыть фильтры, активно ${activeFilterCount}`
                        : "Открыть фильтры"
                }
                className="inline-flex items-center gap-1.5"
            >
                {/* Иконка воронки (Material Design — filter_list) */}
                <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                </svg>
                {activeFilterCount > 0
                    ? `Фильтры (${activeFilterCount})`
                    : "Фильтры"}
            </Button>

            {activeFilterCount > 0 && (
                <Button
                    onClick={handleResetFilters}
                    aria-label="Сбросить все активные фильтры"
                >
                    Сбросить
                </Button>
            )}
        </>
    ) : undefined;

    return (
        <Container className="py-12">
            <h1
                ref={h1Ref}
                tabIndex={-1}
                className="mb-8 scroll-mt-28 text-3xl font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
                Результаты поиска
            </h1>

            <SearchResultsSummary
                summary={summary}
                actions={filterActions}
                filteredTotal={isPlaceholderData ? undefined : data?.total}
                isFiltered={activeFilterCount > 0}
                filteredCountHh={isPlaceholderData ? undefined : data?.vacancies_count_hh}
                filteredCountTv={isPlaceholderData ? undefined : data?.vacancies_count_tv}
            />

            <p role="status" aria-atomic="true" className="mb-4 text-sm text-muted">
                {data && !isPlaceholderData && !isListError
                    ? `Найдено вакансий: ${data.total}. ${location}.${keyword ? ` Ключевое слово: ${keyword}.` : ""}${source ? ` Источник: ${getSourceLabel(source)}.` : " Все источники."}${data.total > 0 ? ` Страница ${data.page}, вакансии ${(data.page - 1) * data.page_size + 1}–${(data.page - 1) * data.page_size + data.items.length}.` : " Попробуйте изменить параметры поиска."}`
                    : isFetching && !data ? "Загружаем вакансии…" : ""}
            </p>

            {isListError && !isFetching && (
                <ServiceError />
            )}

            {/* Спиннер при первой загрузке (данных ещё нет) */}
            {isFetching && !data && (
                <div className="flex items-center gap-3 py-8" aria-hidden="true">
                    <Spinner />
                </div>
            )}

            {/* Список — остаётся видимым при смене страницы/фильтров (keepPreviousData) */}
            {data && (
                <div aria-busy={isFetching} className={isFetching ? "opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"}>
                    <VacancyList
                        data={data}
                        currentPage={page}
                        onPageChange={handlePageChange}
                    />
                </div>
            )}

            {/* Баннер в чат с Ассистентом Верой — после результатов поиска */}
            {data && <VeraChatBanner />}

            <VacancyFilters
                isOpen={isFiltersOpen}
                onClose={() => setIsFiltersOpen(false)}
                currentKeyword={keyword}
                currentSource={source}
                currentPageSize={pageSize}
                onApply={handleApplyFilters}
            />
        </Container>
    );
}
