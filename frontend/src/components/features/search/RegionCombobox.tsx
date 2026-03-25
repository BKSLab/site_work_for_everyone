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

    const containerRef = useRef<HTMLDivElement>(null);

    // Сбрасываем ввод если regionCode сброшен снаружи
    useEffect(() => {
        if (!regionCode) setInputValue("");
    }, [regionCode]);

    const filtered =
        inputValue.length >= 1
            ? regions
                  .filter((r) =>
                      r.name.toLowerCase().includes(inputValue.toLowerCase())
                  )
                  .slice(0, 10)
            : [];

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
        setIsOpen(false);
        setActiveIndex(-1);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!isOpen) setIsOpen(true);
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
        } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            if (filtered[activeIndex]) handleSelect(filtered[activeIndex]);
        } else if (e.key === "Escape") {
            setIsOpen(false);
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
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col gap-1 md:gap-0" ref={containerRef}> {/* Outer container for field + error */}
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"> {/* For label and input/combobox */}
                <label
                    htmlFor={id}
                    className="flex-none text-sm font-medium text-foreground"
                >
                    Регион
                    <span aria-hidden="true" className="ml-1 text-accent">
                        *
                    </span>
                    <span className="sr-only"> (обязательное поле)</span>
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
                            isLoading ? "Загрузка..." : "Начните вводить название региона"
                        }
                        aria-required="true"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        aria-expanded={isOpen && filtered.length > 0}
                        aria-controls={isOpen ? listId : undefined}
                        aria-autocomplete="list"
                        aria-activedescendant={
                            activeIndex >= 0
                                ? `${listId}-${activeIndex}`
                                : undefined
                        }
                        disabled={isLoading}
                        className="w-full rounded border border-white/20 bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                    />
                    {isOpen && filtered.length > 0 && (
                        <ul
                            id={listId}
                            role="listbox"
                            aria-label="Регионы"
                            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-white/20 bg-surface shadow-lg"
                        >
                            {filtered.map((region, index) => (
                                <li
                                    key={region.region_code}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={region.region_code === regionCode}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(region);
                                    }}
                                    className={`cursor-pointer px-3 py-2 text-sm text-foreground hover:bg-surface-hover ${
                                        index === activeIndex
                                            ? "bg-surface-hover"
                                            : ""
                                    } ${region.region_code === regionCode ? "text-accent" : ""}`}
                                >
                                    {region.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            {error && (
                <span
                    id={errorId}
                    role="alert"
                    className="text-sm text-red-400 md:self-start"
                >
                    {error}
                </span>
            )}
        </div>
    );
}
