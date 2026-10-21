"use client";

import { useState, useRef, useEffect, useId } from "react";
import { useRegions } from "@/hooks/useRegions";
import type { Region } from "@/types/region";

interface RegionComboboxProps {
    regionCode: string;
    onRegionChange: (code: string, name: string) => void;
    error?: string;
}

export function RegionCombobox({
    regionCode,
    onRegionChange,
    error,
}: RegionComboboxProps) {
    const id = useId();
    const listId = `${id}-list`;
    const errorId = `${id}-error`;

    const { data: regions = [], isLoading } = useRegions();

    const [inputValue, setInputValue] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [prevRegionCode, setPrevRegionCode] = useState(regionCode);

    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Сбрасываем ввод если regionCode сброшен снаружи (derived state pattern)
    if (regionCode !== prevRegionCode) {
        setPrevRegionCode(regionCode);
        if (!regionCode) setInputValue("");
    }

    // Когда поле пустое — показываем все регионы (уже загружены);
    // когда введён текст — фильтруем по совпадению, показываем первые 10
    const filtered =
        inputValue.length >= 1
            ? regions
                  .filter((r) =>
                      r.name.toLowerCase().includes(inputValue.toLowerCase())
                  )
                  .slice(0, 10)
            : regions;
    const hasList = isOpen && filtered.length > 0;
    const validActiveIndex = hasList && activeIndex >= 0 && activeIndex < filtered.length
        ? activeIndex
        : -1;

    function closeList() {
        setIsOpen(false);
        setActiveIndex(-1);
    }

    // Scroll only this popup: scrollIntoView can also move the page behind it.
    useEffect(() => {
        const list = listRef.current;
        const option = list?.children[validActiveIndex] as HTMLElement | undefined;
        if (!list || !option) return;
        const bounds = list.getBoundingClientRect();
        const optionBounds = option.getBoundingClientRect();
        if (optionBounds.top < bounds.top) list.scrollTop -= bounds.top - optionBounds.top;
        else if (optionBounds.bottom > bounds.bottom) list.scrollTop += optionBounds.bottom - bounds.bottom;
    }, [validActiveIndex, inputValue, filtered.length]);

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        setInputValue(e.target.value);
        setIsOpen(true);
        setActiveIndex(-1);
        if (regionCode) {
            onRegionChange("", "");
        }
    }

    function handleSelect(region: Region) {
        setInputValue(region.name);
        onRegionChange(region.region_code, region.name);
        closeList();
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!isOpen) {
                // Открываем список и сразу фокусируемся на первом элементе
                setIsOpen(true);
                setActiveIndex(filtered.length ? 0 : -1);
            } else {
                setActiveIndex(Math.min(validActiveIndex + 1, filtered.length - 1));
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex(Math.max(validActiveIndex - 1, -1));
        } else if (e.key === "Enter" && validActiveIndex >= 0) {
            e.preventDefault();
            handleSelect(filtered[validActiveIndex]);
        } else if (e.key === "Escape") {
            closeList();
        }
    }

    // Закрываем по клику вне
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
                setActiveIndex(-1);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col gap-1" ref={containerRef}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) closeList();
            }}>
            <div className="flex flex-col gap-1">
                <label
                    htmlFor={id}
                    className="text-sm font-medium text-foreground"
                >
                    Регион
                    <span aria-hidden="true" className="ml-1 text-accent">
                        *
                    </span>
                </label>
                <div className="relative flex-1">
                    <input
                        id={id}
                        type="text"
                        role="combobox"
                        autoComplete="off"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => inputValue.length >= 1 && setIsOpen(true)}
                        placeholder={
                            isLoading ? "Загрузка..." : "Начните вводить регион"
                        }
                        aria-required="true"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        aria-expanded={hasList}
                        aria-controls={hasList ? listId : undefined}
                        aria-autocomplete="list"
                        aria-activedescendant={
                            validActiveIndex >= 0
                                ? `${listId}-${validActiveIndex}`
                                : undefined
                        }
                        disabled={isLoading}
                        className="w-full rounded border border-input bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                    />
                    {hasList && (
                        <ul
                            ref={listRef}
                            id={listId}
                            role="listbox"
                            aria-label="Регионы"
                            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-white/20 bg-surface p-1 shadow-lg"
                        >
                            {filtered.map((region, index) => (
                                <li
                                    key={region.region_code}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={region.region_code === regionCode}
                                    onMouseMove={() => setActiveIndex(index)}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(region);
                                    }}
                                    className={`cursor-pointer rounded-md px-3 py-2 text-sm text-foreground ${
                                        index === validActiveIndex
                                            ? "bg-accent/10 outline-2 -outline-offset-2 outline-accent"
                                            : ""
                                    } ${region.region_code === regionCode ? "text-accent" : ""}`}
                                >
                                    {region.name}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* «Нет совпадений» — только когда введён текст, но ничего не найдено */}
                    {isOpen && inputValue.length >= 1 && !isLoading && filtered.length === 0 && (
                        <p
                            role="status"
                            className="absolute z-10 mt-1 w-full rounded border border-white/20 bg-surface px-3 py-2 text-sm text-muted shadow-lg"
                        >
                            Регионов не найдено
                        </p>
                    )}
                </div>
            </div>
            <span
                id={errorId}
                role="alert"
                className="block min-h-[1.25rem] text-sm text-red-400 md:self-start"
            >
                {error}
            </span>
        </div>
    );
}
