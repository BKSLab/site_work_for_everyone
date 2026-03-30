"use client";

import { useId } from "react"; // Use useId for unique ID

interface LocationInputProps {
    value: string;
    onChange: (value: string) => void;
    error?: string;
}

export function LocationInput({ value, onChange, error }: LocationInputProps) {
    const inputId = useId(); // Use useId for unique ID
    const errorId = `${inputId}-error`;

    return (
        <div className="flex flex-col gap-1 md:gap-0"> {/* Outer container for field + error */}
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"> {/* For label and input */}
                <label
                    htmlFor={inputId}
                    className="flex-none text-sm font-medium text-foreground"
                >
                    Населённый пункт
                    <span aria-hidden="true" className="ml-1 text-accent">
                        *
                    </span>
                </label>
                <input
                    id={inputId}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Например, Ижевск"
                    aria-required="true"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="flex-1 w-full rounded border border-white/20 bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
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
