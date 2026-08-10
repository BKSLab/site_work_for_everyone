"use client";

import Image from "next/image";
import {
    Fragment,
    memo,
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import {
    type VeraChatMessage,
    useVeraChat,
} from "@/hooks/useVeraChat";
import { VERA_MESSAGE_MAX_LENGTH } from "@/lib/schemas/vera";
import { ChatMessage } from "./ChatMessage";
import { VeraFeedbackModal } from "./VeraFeedbackModal";

const SUGGESTED_QUESTIONS = [
    "Какие квоты действуют при трудоустройстве?",
    "Могут ли уволить сотрудника с инвалидностью?",
    "Какие льготы положены работнику?",
    "Что такое соглашение о трудоустройстве инвалидов?",
];

const SCROLL_BOTTOM_THRESHOLD_PX = 80;

const ChatMessageList = memo(function ChatMessageList({
    messages,
    sessionId,
}: {
    messages: VeraChatMessage[];
    sessionId: string;
}) {
    if (messages.length === 0) return null;

    /* Реплики объединены в список: скринридер сообщает их количество и
       позицию, а по сообщениям становится доступна навигация по элементам
       списка — без этого длинную консультацию можно читать только подряд.
       `gap-4` повторяет прежний интервал родительского контейнера, чтобы
       обёртка не меняла внешний вид. */
    return (
        <div
            role="list"
            aria-label="Сообщения диалога"
            className="flex flex-col gap-4"
        >
            {messages.map((message) => (
                <ChatMessage
                    key={message.id}
                    message={message}
                    sessionId={sessionId}
                />
            ))}
        </div>
    );
});

export function ChatWindow() {
    const {
        sessionId,
        messages,
        previousSessionGroups = [],
        sendMessage,
        // `startNewDialog` намеренно не вызывается из UI: кнопка «Новый
        // диалог» скрыта до появления полноценного каталога чатов, иначе
        // предыдущий разговор исчезает из интерфейса после reload. Серверные
        // create/close (VERA-029) остаются и используются lifecycle-логикой
        // и TTL-rollover. Флаги ниже по-прежнему нужны: их выставляет
        // восстановление незавершённого создания сессии после перезагрузки.
        isStartingNewDialog = false,
        hasPendingNewDialog = false,
        status,
        deliveryState,
        error,
        announcement,
        isHistoryLoading,
        historyError,
        hasOlderHistory,
        isOlderHistoryLoading,
        loadOlderHistory,
        olderPreviousHistorySessionId = null,
        loadOlderPreviousHistory = () => undefined,
    } = useVeraChat();
    const [input, setInput] = useState("");
    const [isNearHistoryBottom, setIsNearHistoryBottom] = useState(true);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pendingHistoryAnchorRef = useRef<{
        kind: "current" | "previous";
        sessionId?: string;
        firstMessageId: string | null;
        scrollHeight: number;
    } | null>(null);
    const shouldAutoScrollRef = useRef(true);
    const hasVisibleMessages =
        messages.length > 0 ||
        previousSessionGroups.some((group) => group.messages.length > 0);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;

        const anchor = pendingHistoryAnchorRef.current;
        if (anchor) {
            const anchoredMessages =
                anchor.kind === "current"
                    ? messages
                    : (previousSessionGroups.find(
                          (group) => group.sessionId === anchor.sessionId,
                      )?.messages ?? []);
            const firstMessageId = anchoredMessages[0]?.id ?? null;
            const didPrepend =
                anchor.firstMessageId === null
                    ? anchoredMessages.length > 0
                    : firstMessageId !== anchor.firstMessageId &&
                      anchoredMessages.some(
                          (message) => message.id === anchor.firstMessageId,
                      );

            if (didPrepend) {
                list.scrollTop += list.scrollHeight - anchor.scrollHeight;
                pendingHistoryAnchorRef.current = null;
                return;
            }

            const isAnchoredHistoryLoading =
                anchor.kind === "current"
                    ? isOlderHistoryLoading
                    : olderPreviousHistorySessionId === anchor.sessionId;
            if (isAnchoredHistoryLoading) {
                // Append/stream update во время загрузки не должен съесть
                // marker будущего prepend или попасть в его высоту.
                anchor.scrollHeight = list.scrollHeight;
                return;
            }

            pendingHistoryAnchorRef.current = null;
            return;
        }

        if (shouldAutoScrollRef.current) {
            list.scrollTo({
                top: list.scrollHeight,
                behavior: "auto",
            });
        }
    }, [
        isOlderHistoryLoading,
        messages,
        olderPreviousHistorySessionId,
        previousSessionGroups,
        status,
    ]);

    function handleHistoryScroll() {
        const list = listRef.current;
        if (!list) return;

        const isNearBottom =
            list.scrollHeight - list.scrollTop - list.clientHeight <=
            SCROLL_BOTTOM_THRESHOLD_PX;
        shouldAutoScrollRef.current = isNearBottom;
        setIsNearHistoryBottom(isNearBottom);
    }

    function handleJumpToLatest() {
        const list = listRef.current;
        if (!list) return;

        shouldAutoScrollRef.current = true;
        setIsNearHistoryBottom(true);
        list.scrollTo({
            top: list.scrollHeight,
            behavior: "smooth",
        });
    }

    function handleLoadOlderHistory() {
        if (listRef.current) {
            pendingHistoryAnchorRef.current = {
                kind: "current",
                firstMessageId: messages[0]?.id ?? null,
                scrollHeight: listRef.current.scrollHeight,
            };
        }
        void loadOlderHistory();
    }

    function handleLoadOlderPreviousHistory(group: {
        sessionId: string;
        messages: VeraChatMessage[];
    }) {
        if (listRef.current) {
            pendingHistoryAnchorRef.current = {
                kind: "previous",
                sessionId: group.sessionId,
                firstMessageId: group.messages[0]?.id ?? null,
                scrollHeight: listRef.current.scrollHeight,
            };
        }
        void loadOlderPreviousHistory(group.sessionId);
    }

    const isDeliveryProcessing = deliveryState
        ? [
              "submitting",
              "accepted",
              "processing",
              "streaming",
          ].includes(deliveryState)
        : false;
    const isBusy =
        isDeliveryProcessing ||
        status === "waiting" ||
        status === "long-running" ||
        status === "streaming";
    const blocksSubmission =
        isBusy ||
        isStartingNewDialog ||
        hasPendingNewDialog ||
        deliveryState === "unknown";
    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const text = input.trim();
        if (!text || blocksSubmission || isHistoryLoading || !sessionId) {
            return;
        }
        setInput("");
        const result = await sendMessage(text);
        if (result?.restoreDraft) {
            setInput((current) => current || text);
            inputRef.current?.focus();
        }
    }

    function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
        }
    }

    function selectSuggestedQuestion(question: string) {
        setInput(question);
        inputRef.current?.focus();
    }

    return (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
            <section
                aria-label="Чат с Ассистентом Верой"
                className="flex h-[calc(100dvh-7rem)] min-h-[34rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.3)]"
            >
                <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                    <span
                        aria-hidden="true"
                        className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-accent/45"
                    >
                        <Image
                            src="/logo_ai_assistant.png"
                            alt=""
                            width={44}
                            height={44}
                            priority
                            className="h-full w-full object-cover"
                        />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-bold text-foreground">
                            Ассистент Вера
                        </h1>
                        <p className="truncate text-xs text-muted sm:text-sm">
                            Консультант по трудовым правам
                        </p>
                        <p
                            id="vera-login-dialog-policy"
                            className="mt-1 text-[11px] leading-snug text-muted"
                        >
                            При входе в аккаунт текущий диалог сохраняется и
                            продолжается.
                        </p>
                    </div>
                </header>

                <div
                    id="vera-chat-status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="sr-only"
                >
                    {announcement}
                </div>

                <div className="relative min-h-0 flex-1">
                    <div
                        ref={listRef}
                        id="vera-chat-history"
                        role="region"
                        aria-label="История переписки с Ассистентом Верой"
                        aria-busy={
                            isBusy || isStartingNewDialog || isHistoryLoading
                        }
                        onScroll={handleHistoryScroll}
                        className="vera-chat-scrollbar flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6"
                    >
                        {previousSessionGroups.map((group) => (
                            <Fragment key={group.sessionId}>
                                {group.historyCursor != null && (
                                    <div className="flex justify-center">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={
                                                olderPreviousHistorySessionId !==
                                                null
                                            }
                                            onClick={() =>
                                                handleLoadOlderPreviousHistory(
                                                    group,
                                                )
                                            }
                                        >
                                            {olderPreviousHistorySessionId ===
                                            group.sessionId
                                                ? "Загружаю…"
                                                : "Показать предыдущие в завершённом диалоге"}
                                        </Button>
                                    </div>
                                )}
                                <ChatMessageList
                                    messages={group.messages}
                                    sessionId={group.sessionId}
                                />
                                <div
                                    role="separator"
                                    aria-label="Начало нового диалога"
                                    className="flex items-center gap-3 py-1 text-xs text-muted"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="h-px flex-1 bg-border"
                                    />
                                    <span className="shrink-0">
                                        Контекст предыдущего диалога завершён
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className="h-px flex-1 bg-border"
                                    />
                                </div>
                            </Fragment>
                        ))}
                        {hasOlderHistory && (
                            <div className="flex justify-center">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={isOlderHistoryLoading}
                                    onClick={handleLoadOlderHistory}
                                >
                                    {isOlderHistoryLoading
                                        ? "Загружаю…"
                                        : "Показать предыдущие"}
                                </Button>
                            </div>
                        )}
                        {isHistoryLoading && messages.length === 0 && (
                            <div className="m-auto flex items-center gap-2 text-sm text-muted">
                                <span
                                    aria-hidden="true"
                                    className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
                                />
                                <span>Восстанавливаю историю диалога…</span>
                            </div>
                        )}
                        {!isHistoryLoading && messages.length === 0 && (
                            <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-5 py-6 text-center">
                                <div className="space-y-2">
                                    <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                                        Чем я могу помочь?
                                    </h2>
                                    <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
                                        Спросите о правах, льготах или
                                        трудоустройстве. Ассистент Вера ответит
                                        на основе базы знаний.
                                    </p>
                                </div>
                                <div
                                    role="group"
                                    aria-label="Примеры вопросов"
                                    className="grid w-full gap-2 sm:grid-cols-2"
                                >
                                    {SUGGESTED_QUESTIONS.map((question) => (
                                        <button
                                            key={question}
                                            type="button"
                                            onClick={() =>
                                                selectSuggestedQuestion(
                                                    question,
                                                )
                                            }
                                            className="min-h-11 rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-left text-sm leading-snug text-muted transition-colors hover:border-accent/50 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                        >
                                            {question}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <ChatMessageList
                            messages={messages}
                            sessionId={sessionId}
                        />
                        {status === "long-running" && (
                            <div className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-muted">
                                <span
                                    aria-hidden="true"
                                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
                                />
                                <span>
                                    Запрос выполняется. Если вы попросили
                                    отправить консультацию на почту, это может
                                    занять несколько минут.
                                </span>
                            </div>
                        )}
                    </div>
                    {!isNearHistoryBottom && hasVisibleMessages && (
                        <Button
                            type="button"
                            variant="secondary"
                            aria-controls="vera-chat-history"
                            onClick={handleJumpToLatest}
                            className="absolute bottom-3 right-3 shadow-lg"
                        >
                            К новому сообщению
                        </Button>
                    )}
                </div>

                {(error || historyError) && (
                    <div className="space-y-2 border-t border-border px-3 py-2 sm:px-4">
                        {error && (
                            <ErrorMessage
                                title="Ассистент Вера временно недоступен"
                                message={error}
                            />
                        )}
                        {historyError && (
                            <ErrorMessage
                                title="Не удалось восстановить историю"
                                message={historyError}
                            />
                        )}
                    </div>
                )}

                <form
                    aria-label="Отправка сообщения Ассистенту Вере"
                    onSubmit={handleSubmit}
                    className="min-w-0 shrink-0 border-t border-border bg-background/45 p-3 sm:p-4"
                >
                    <label htmlFor="vera-chat-input" className="sr-only">
                        Сообщение для Ассистента Веры
                    </label>
                    <div className="flex min-w-0 items-end gap-2 rounded-2xl border border-border bg-surface-hover/45 p-2 pl-4 focus-within:border-accent/60 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                        {/* Счётчик символов намеренно не входит в
                            `aria-describedby`: его текст меняется на каждое
                            нажатие, а скринридер при изменении описания
                            переозвучивает описание целиком — из-за этого
                            подсказка «Enter — отправить» повторялась после
                            каждой буквы. Счётчик остаётся видимым и
                            читается в режиме обзора. */}
                        <textarea
                            ref={inputRef}
                            id="vera-chat-input"
                            value={input}
                            onChange={(event) =>
                                setInput(event.target.value)
                            }
                            onKeyDown={handleInputKeyDown}
                            disabled={
                                isHistoryLoading ||
                                isStartingNewDialog ||
                                hasPendingNewDialog
                            }
                            maxLength={VERA_MESSAGE_MAX_LENGTH}
                            rows={1}
                            aria-describedby="vera-chat-input-hint"
                            placeholder="Напишите вопрос Ассистенту Вере…"
                            className="max-h-36 min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 [field-sizing:content]"
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            aria-label="Отправить"
                            title="Отправить"
                            disabled={
                                blocksSubmission ||
                                isHistoryLoading ||
                                !sessionId ||
                                !input.trim()
                            }
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl p-0"
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="m22 2-7 20-4-9-9-4Z" />
                                <path d="M22 2 11 13" />
                            </svg>
                        </Button>
                    </div>
                    <div className="flex items-start justify-between gap-3 px-2 pt-2 text-xs leading-relaxed text-muted">
                        <p id="vera-chat-input-hint" className="break-words">
                            <span className="block">
                                Enter — отправить, Shift+Enter — новая строка.
                                Ассистент Вера может ошибаться — проверяйте
                                важную информацию.
                            </span>
                            <span className="mt-0.5 block">
                                Консультацию можно отправить на почту —
                                попросите об этом в сообщении и укажите адрес.
                            </span>
                        </p>
                        <span
                            id="vera-chat-input-counter"
                            className="shrink-0 tabular-nums"
                        >
                            {`${input.length} / ${VERA_MESSAGE_MAX_LENGTH}`}
                        </span>
                    </div>
                </form>
            </section>

            <div className="flex justify-end">
                <VeraFeedbackModal sessionId={sessionId} />
            </div>
        </div>
    );
}
