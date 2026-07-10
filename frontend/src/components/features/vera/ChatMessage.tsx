import { cn } from "@/lib/utils/cn";
import type { VeraChatMessage } from "@/hooks/useVeraChat";

interface ChatMessageProps {
    message: VeraChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
    const isUser = message.role === "user";

    return (
        <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isUser
                        ? "bg-accent/[0.14] text-foreground"
                        : "border border-white/10 bg-white/[0.04] text-foreground"
                )}
            >
                {message.content}
                {message.streaming && (
                    <span
                        aria-hidden="true"
                        className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent align-middle"
                    />
                )}
            </div>
        </div>
    );
}
