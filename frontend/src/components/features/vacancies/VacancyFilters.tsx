"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";

interface VacancyFiltersProps {
    isOpen: boolean;
    onClose: () => void;
    currentKeyword: string;
    currentSource: string;
    currentPageSize: number;
    onApply: (keyword: string, source: string, pageSize: number) => void;
}

const SOURCE_OPTIONS = [
    { value: "", label: "Все источники" },
    { value: "hh.ru", label: "hh.ru" },
    { value: "trudvsem.ru", label: "Работа России" },
] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function VacancyFilters({
    isOpen,
    onClose,
    currentKeyword,
    currentSource,
    currentPageSize,
    onApply,
}: VacancyFiltersProps) {
    const [keyword, setKeyword] = useState(currentKeyword);
    const [source, setSource] = useState(currentSource);
    const [pageSize, setPageSize] = useState(currentPageSize);
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

    // Синхронизируем форму с текущими значениями при каждом открытии (derived state pattern)
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setKeyword(currentKeyword);
            setSource(currentSource);
            setPageSize(currentPageSize);
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onApply(keyword.trim(), source, pageSize);
    }

    function handleReset() {
        onApply("", "", 20);
    }

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose} title="Фильтры">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                {/* Ключевое слово */}
                <div className="flex flex-col gap-2">
                    <label
                        htmlFor="filter-keyword"
                        className="text-xs font-medium uppercase tracking-[0.12em] text-muted"
                    >
                        Ключевое слово
                    </label>
                    <input
                        id="filter-keyword"
                        type="text"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="Поиск по названию и описанию"
                        className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 backdrop-blur-sm transition-colors focus-visible:border-accent/50 focus-visible:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
                    />
                </div>

                {/* Источник — radio-пилюли */}
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">
                        Источник
                    </legend>
                    <div className="flex flex-col gap-2">
                        {SOURCE_OPTIONS.map(({ value, label }) => {
                            const isSelected = source === value;
                            return (
                                <label
                                    key={value || "all"}
                                    className={[
                                        "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-all duration-150",
                                        isSelected
                                            ? "border-accent/50 bg-accent/[0.08] shadow-[0_0_12px_rgba(245,184,0,0.08)]"
                                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
                                    ].join(" ")}
                                >
                                    <input
                                        type="radio"
                                        name="vacancy-source"
                                        value={value}
                                        checked={isSelected}
                                        onChange={() => setSource(value)}
                                        className="sr-only"
                                    />
                                    {/* Кружок-индикатор */}
                                    <span
                                        aria-hidden="true"
                                        className={[
                                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                            isSelected
                                                ? "border-accent bg-accent"
                                                : "border-white/30 bg-transparent",
                                        ].join(" ")}
                                    >
                                        {isSelected && (
                                            <span className="h-1.5 w-1.5 rounded-full bg-background" />
                                        )}
                                    </span>
                                    {value ? (
                                        <SourceBadge source={value} withLabel />
                                    ) : (
                                        <span className="text-sm text-foreground">
                                            {label}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                {/* Вакансий на странице */}
                <div className="flex flex-col gap-2">
                    <label
                        htmlFor="filter-page-size"
                        className="text-xs font-medium uppercase tracking-[0.12em] text-muted"
                    >
                        Вакансий на странице
                    </label>
                    <div className="relative">
                        <select
                            id="filter-page-size"
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="w-full appearance-none rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 pr-9 text-sm text-foreground backdrop-blur-sm transition-colors focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
                        >
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <option key={n} value={n} className="bg-surface">
                                    {n}
                                </option>
                            ))}
                        </select>
                        {/* Стрелка вниз */}
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                        >
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </div>

                {/* Разделитель */}
                <div
                    aria-hidden="true"
                    className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
                />

                {/* Кнопки */}
                <div className="flex gap-3">
                    <Button type="submit" className="flex-1">
                        Применить
                    </Button>
                    <Button type="button" onClick={handleReset} className="flex-1">
                        Сбросить
                    </Button>
                </div>

            </form>
        </Modal>
    );
}
