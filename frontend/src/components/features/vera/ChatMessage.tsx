import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { VeraChatMessage } from "@/hooks/useVeraChat";
import { MessageFeedbackControls } from "./MessageFeedbackControls";

interface ChatMessageProps {
    message: VeraChatMessage;
    sessionId: string;
}

export function ChatMessage({ message, sessionId }: ChatMessageProps) {
    const isUser = message.role === "user";
    const isPreparing = !isUser && message.streaming && !message.content;
    const deliveryLabel =
        message.deliveryStatus === "sending"
            ? "Отправляется…"
            : message.deliveryStatus === "sent"
              ? "Отправлено"
              : message.deliveryStatus === "rejected"
                ? "Не отправлено"
                : message.deliveryStatus === "unknown"
                  ? "Статус отправки неизвестен"
                  : null;
    const canRate =
        !isUser &&
        message.feedbackEligible === true &&
        Boolean(message.requestId) &&
        Boolean(message.content);

    return (
        <div
            className={cn(
                "flex items-start gap-2.5",
                isUser ? "justify-end" : "justify-start",
            )}
        >
            {!isUser && (
                <span
                    aria-hidden="true"
                    className="mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-accent/40 shadow-[0_0_14px_rgba(245,184,0,0.2)]"
                >
                    <Image
                        src="/logo_ai_assistant.png"
                        alt=""
                        width={36}
                        height={36}
                        className="h-full w-full rounded-full object-cover"
                    />
                </span>
            )}
            <div
                className={cn(
                    "min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isUser
                        ? "bg-accent/[0.14] text-foreground"
                        : "border border-white/10 bg-white/[0.04] text-foreground",
                )}
            >
                {!isUser && (
                    <span
                        aria-hidden="true"
                        className="mb-1 block text-xs font-semibold text-accent"
                    >
                        Ассистент Вера
                    </span>
                )}
                <span className="sr-only">
                    {isUser ? "Вы: " : "Ассистент Вера: "}
                </span>
                {isPreparing ? (
                    <span className="flex items-center gap-2 text-muted">
                        <span>Готовлю ответ</span>
                        <span
                            aria-hidden="true"
                            className="flex shrink-0 gap-1"
                        >
                            <span className="h-1.5 w-1.5 rounded-full [animation:braille-dot_1.4s_ease-in-out_infinite] motion-reduce:animate-none" />
                            <span className="h-1.5 w-1.5 rounded-full [animation:braille-dot_1.4s_ease-in-out_0.2s_infinite] motion-reduce:animate-none" />
                            <span className="h-1.5 w-1.5 rounded-full [animation:braille-dot_1.4s_ease-in-out_0.4s_infinite] motion-reduce:animate-none" />
                        </span>
                    </span>
                ) : (
                    <span className="whitespace-pre-wrap">
                        {message.content}
                    </span>
                )}
                {message.streaming && !isPreparing && (
                    <span
                        aria-hidden="true"
                        className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent align-middle"
                    />
                )}
                {isUser && deliveryLabel && (
                    <span className="mt-1 block text-right text-xs text-muted">
                        {deliveryLabel}
                    </span>
                )}
                {canRate && (
                    <MessageFeedbackControls
                        sessionId={sessionId}
                        requestId={message.requestId!}
                        initialValue={message.feedbackValue}
                    />
                )}
            </div>
        </div>
    );
}
