import Image from "next/image";
import { memo } from "react";
import { cn } from "@/lib/utils/cn";
import {
    SIMPLIFY_WAITING_TEXT,
    type VeraChatMessage,
    type VeraWaitingStage,
} from "@/hooks/useVeraChat";
import { MessageCopyButton } from "./MessageCopyButton";
import { MessageFeedbackControls } from "./MessageFeedbackControls";
import { SimplifyAnswerButton } from "./SimplifyAnswerButton";

interface ChatMessageProps {
    message: VeraChatMessage;
    sessionId: string;
    waitingStage?: VeraWaitingStage;
    /** показывать кнопку «Объяснить проще» под этим ответом */
    canSimplify?: boolean;
    isSimplifyDisabled?: boolean;
    onSimplify?: () => void;
}

export const ChatMessage = memo(function ChatMessage({
    message,
    sessionId,
    waitingStage = "initial",
    canSimplify = false,
    isSimplifyDisabled = false,
    onSimplify,
}: ChatMessageProps) {
    const isUser = message.role === "user";
    const isPreparing = !isUser && message.streaming && !message.content;
    const preparingText =
        waitingStage === "expected-delay"
            ? "Проверяю информацию"
            : waitingStage === "extended"
              ? "Готовлю ответ — нужно ещё немного времени"
              : message.waitingVariant === "simplify"
                ? SIMPLIFY_WAITING_TEXT
                : "Разбираюсь в вопросе";
    const isUnknownAnswer =
        !isUser && !message.content && message.deliveryState === "unknown";
    const isFailedAnswer =
        !isUser && !message.content && message.deliveryState === "failed";
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
            role="listitem"
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
                    "min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isUser
                        ? "max-w-[85%] bg-accent/[0.14] text-foreground"
                        : // Ответ Веры длиннее вопроса, и на широком экране
                          // 90% ширины дают неудобно длинную строку. 74ch
                          // удерживает строку в комфортном для чтения
                          // диапазоне, сохраняя достаточно места длинной
                          // юридической консультации.
                          "max-w-[min(90%,74ch)] border border-white/10 bg-white/[0.04] text-foreground",
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
                        <span>{preparingText}</span>
                        <span
                            aria-hidden="true"
                            className="flex shrink-0 gap-1"
                        >
                            <span className="h-1.5 w-1.5 rounded-full [animation:braille-dot_1.4s_ease-in-out_infinite] motion-reduce:animate-none" />
                            <span className="h-1.5 w-1.5 rounded-full [animation:braille-dot_1.4s_ease-in-out_0.2s_infinite] motion-reduce:animate-none" />
                            <span className="h-1.5 w-1.5 rounded-full [animation:braille-dot_1.4s_ease-in-out_0.4s_infinite] motion-reduce:animate-none" />
                        </span>
                    </span>
                ) : isUnknownAnswer ? (
                    <span className="text-muted">
                        Статус ответа пока неизвестен. Он может появиться в
                        истории после обновления страницы.
                    </span>
                ) : isFailedAnswer ? (
                    <span className="text-muted">
                        Не удалось подготовить ответ.
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
                {!isUser &&
                    Boolean(message.content) &&
                    message.deliveryState === "failed" && (
                        <span className="mt-2 block text-xs text-muted">
                            Ответ завершился с ошибкой и может быть неполным.
                        </span>
                    )}
                {!isUser &&
                    Boolean(message.content) &&
                    message.deliveryState === "unknown" && (
                        <span className="mt-2 block text-xs text-muted">
                            Статус ответа неизвестен; текст может быть
                            неполным.
                        </span>
                    )}
                {isUser && deliveryLabel && (
                    <span className="mt-1 block text-right text-xs text-muted">
                        {deliveryLabel}
                    </span>
                )}
                {!isUser && Boolean(message.content) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                        {canSimplify && onSimplify && (
                            <SimplifyAnswerButton
                                disabled={isSimplifyDisabled}
                                onSimplify={onSimplify}
                            />
                        )}
                        <MessageCopyButton text={message.content} />
                        {canRate && (
                            <MessageFeedbackControls
                                sessionId={sessionId}
                                requestId={message.requestId!}
                                initialValue={message.feedbackValue}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});
