interface EmailInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}

export function EmailInput({ id, value, onChange, error }: EmailInputProps) {
    const errorId = `${id}-error`;

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium text-foreground">
                Email
                <span aria-hidden="true" className="ml-1 text-accent">*</span>
                <span className="sr-only"> (обязательное поле)</span>
            </label>
            <input
                id={id}
                type="email"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                autoComplete="email"
                placeholder="your@email.com"
                aria-required="true"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="rounded border border-input bg-surface px-3 py-2 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            {error && <span id={errorId} className="text-sm text-red-400">{error}</span>}
        </div>
    );
}
