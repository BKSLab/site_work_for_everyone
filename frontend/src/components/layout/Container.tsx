import { cn } from "@/lib/utils/cn";

export function Container({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("mx-auto max-w-5xl px-4", className)}>
            {children}
        </div>
    );
}
