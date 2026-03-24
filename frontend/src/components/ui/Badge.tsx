import { cn } from "@/lib/utils/cn";

interface BadgeProps {
    children: React.ReactNode;
    variant?: "hh" | "trudvsem" | "default";
}

export function Badge({ children, variant = "default" }: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
                variant === "hh" && "bg-red-400/20 text-red-400",
                variant === "trudvsem" && "bg-blue-400/20 text-blue-400",
                variant === "default" && "bg-border text-muted"
            )}
        >
            {children}
        </span>
    );
}
