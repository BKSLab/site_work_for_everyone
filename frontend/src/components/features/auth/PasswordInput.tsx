"use client";

import { useState } from "react";

interface PasswordInputProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    autoComplete?: string;
    placeholder?: string;
}

export function PasswordInput({
    id,
    label,
    value,
    onChange,
    error,
    autoComplete = "current-password",
    placeholder,
}: PasswordInputProps) {
    const [showPassword, setShowPassword] = useState(false);
    const errorId = `${id}-error`;

    return (
        <div className="flex flex-col gap-1">
            <label
                htmlFor={id}
                className="text-sm font-medium text-foreground"
            >
                {label}
                <span aria-hidden="true" className="ml-1 text-accent">
                    *
                </span>
                <span className="sr-only"> (обязательное поле)</span>
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={showPassword ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    aria-required="true"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="w-full rounded border border-border bg-surface px-3 py-2 pr-10 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={
                        showPassword ? "Скрыть пароль" : "Показать пароль"
                    }
                    aria-pressed={showPassword}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        {showPassword ? (
                            <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </>
                        ) : (
                            <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </>
                        )}
                    </svg>
                </button>
            </div>
            {error && (
                <span id={errorId} role="alert" className="text-sm text-red-400">
                    {error}
                </span>
            )}
        </div>
    );
}
