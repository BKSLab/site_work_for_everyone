"use client";

interface OtpCodeInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}

export function OtpCodeInput({ id, value, onChange, error }: OtpCodeInputProps) {
    const errorId = `${id}-error`;

    return (
        <div className="flex flex-col gap-1">
            <label
                htmlFor={id}
                className="text-sm font-medium text-foreground"
            >
                Код подтверждения
                <span aria-hidden="true" className="ml-1 text-accent">
                    *
                </span>
                <span className="sr-only"> (обязательное поле)</span>
            </label>
            <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Введите код из письма"
                aria-required="true"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="rounded border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            {error && (
                <span id={errorId} role="alert" className="text-sm text-red-400">
                    {error}
                </span>
            )}
        </div>
    );
}
