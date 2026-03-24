import { cn } from "@/lib/utils/cn";

interface SubmitButtonProps {
    children: React.ReactNode;
    isLoading?: boolean;
    className?: string;
}

export function SubmitButton({
    children,
    isLoading,
    className,
}: SubmitButtonProps) {
    return (
        <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading || undefined}
            className={cn(
                "w-full rounded bg-accent px-6 py-3 font-semibold text-accent-foreground",
                "hover:bg-accent-hover",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
        >
            {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                    <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent motion-reduce:animate-none"
                        aria-hidden="true"
                    />
                    <span>Загрузка...</span>
                </span>
            ) : (
                children
            )}
        </button>
    );
}
