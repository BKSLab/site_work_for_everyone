"use client";

import Image from "next/image";
import {
    Fragment,
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import {
    SIMPLIFY_ANSWER_REQUEST,
    type VeraChatMessage,
    type VeraWaitingStage,
    useVeraChat,
} from "@/hooks/useVeraChat";
import { VERA_MESSAGE_MAX_LENGTH } from "@/lib/schemas/vera";
import { useAuthStore } from "@/stores/auth";
import { ChatMessage } from "./ChatMessage";
import { VeraFeedbackModal } from "./VeraFeedbackModal";
import { veraHistoryStartId, veraMessageStartId } from "./message-navigation";
import { useVeraDraft } from "./useVeraDraft";

const SUGGESTED_QUESTIONS = [
    "Какие квоты действуют при трудоустройстве?",
    "Могут ли уволить сотрудника с инвалидностью?",
    "Какие льготы положены работнику?",
    "Что такое соглашение о трудоустройстве инвалидов?",
];

const SCROLL_BOTTOM_THRESHOLD_PX = 80;
const MOBILE_COUNTER_VISIBLE_FROM = Math.floor(VERA_MESSAGE_MAX_LENGTH * 0.8);
const HISTORY_FOCUS_PADDING_PX = 8;

function scrollHistoryTarget(
    list: HTMLDivElement,
    target: HTMLElement,
    alignment: "start" | "nearest",
    behavior: ScrollBehavior = "auto",
) {
    const bounds = list.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    let delta: number;
    if (
        alignment === "start" ||
        targetBounds.top < bounds.top + HISTORY_FOCUS_PADDING_PX
    ) {
        delta = targetBounds.top - bounds.top - HISTORY_FOCUS_PADDING_PX;
    } else if (targetBounds.bottom > bounds.bottom - HISTORY_FOCUS_PADDING_PX) {
        delta = targetBounds.bottom - bounds.bottom + HISTORY_FOCUS_PADDING_PX;
    } else {
        return;
    }
    // scrollIntoView also scrolls overflow-hidden ancestors of the chat,
    // which can move its header underneath the sticky site navigation.
    list.scrollTo({ top: Math.max(0, list.scrollTop + delta), behavior });
}

const ChatMessageList = memo(function ChatMessageList({
    messages,
    sessionId,
    waitingStage = "initial",
    simplifiableMessageId = null,
    isSimplifyDisabled = false,
    onSimplify,
    onReturnToInput,
}: {
    messages: VeraChatMessage[];
    sessionId: string;
    waitingStage?: VeraWaitingStage;
    /* Кнопку «Объяснить проще» получает ровно одно сообщение списка —
       остальным передаётся `false`. Завершённые диалоги в
       `previousSessionGroups` не передают этот проп вовсе: их контекст уже
       закрыт, упрощать в них нечего. */
    simplifiableMessageId?: string | null;
    isSimplifyDisabled?: boolean;
    onSimplify?: () => void;
    onReturnToInput?: () => void;
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
                    waitingStage={
                        message.role === "assistant" &&
                        message.streaming &&
                        !message.content
                            ? waitingStage
                            : undefined
                    }
                    canSimplify={message.id === simplifiableMessageId}
                    isSimplifyDisabled={isSimplifyDisabled}
                    onSimplify={onSimplify}
                    onReturnToInput={onReturnToInput}
                />
            ))}
        </div>
    );
});

export function ChatWindow() {
    const feedbackOwner = useAuthStore((state) => state.user?.email ?? null);
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
        waitingStage = "initial",
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
    const { input, setInput, isDraftReady, draftStorageError } = useVeraDraft(
        sessionId,
        isHistoryLoading,
    );
    const [showAllSuggestedQuestions, setShowAllSuggestedQuestions] =
        useState(false);
    const [isNearHistoryBottom, setIsNearHistoryBottom] = useState(true);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const composerRef = useRef<HTMLFormElement>(null);
    const lastFocusedElementRef = useRef<Element | null>(null);
    const simplifyTriggerRef = useRef<Element | null>(null);
    const pendingHistoryAnchorRef = useRef<{
        kind: "current" | "previous";
        sessionId?: string;
        firstMessageId: string | null;
        scrollHeight: number;
        trigger: Element | null;
    } | null>(null);
    const shouldAutoScrollRef = useRef(true);
    const isReadingAnswerStartRef = useRef(false);
    const hasVisibleMessages =
        messages.length > 0 ||
        previousSessionGroups.some((group) => group.messages.length > 0);
    const allMessageGroups = [
        ...previousSessionGroups,
        { sessionId, messages },
    ];
    const latestAssistant = allMessageGroups
        .flatMap((group) =>
            group.messages
                .filter((message) => message.role === "assistant")
                .map((message) => ({ message, sessionId: group.sessionId })),
        )
        .at(-1);

    const returnToInput = useCallback(() => inputRef.current?.focus(), []);

    useEffect(() => {
        const active = document.activeElement;
        if (active === document.body || active?.tagName === "MAIN") {
            headingRef.current?.focus({ preventScroll: true });
        }
    }, []);

    useEffect(() => {
        const rememberFocus = (event: FocusEvent) => {
            lastFocusedElementRef.current = event.target as Element;
        };
        document.addEventListener("focusin", rememberFocus);
        return () => document.removeEventListener("focusin", rememberFocus);
    }, []);

    useEffect(() => {
        const trigger = simplifyTriggerRef.current;
        if (!trigger || trigger.isConnected) return;
        if (
            lastFocusedElementRef.current === trigger &&
            document.activeElement === document.body
        ) {
            returnToInput();
        }
        simplifyTriggerRef.current = null;
    }, [messages, returnToInput]);

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
                if (
                    anchor.trigger &&
                    !anchor.trigger.isConnected &&
                    lastFocusedElementRef.current === anchor.trigger &&
                    document.activeElement === document.body &&
                    firstMessageId
                ) {
                    const target = document.getElementById(
                        veraMessageStartId(
                            anchor.sessionId ?? sessionId,
                            firstMessageId,
                        ),
                    );
                    target?.focus({ preventScroll: true });
                    if (target) scrollHistoryTarget(list, target, "nearest");
                }
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

            if (
                anchor.trigger &&
                !anchor.trigger.isConnected &&
                lastFocusedElementRef.current === anchor.trigger &&
                document.activeElement === document.body
            ) {
                const target = document.getElementById(
                    veraHistoryStartId(anchor.sessionId ?? sessionId),
                );
                target?.focus({ preventScroll: true });
                if (target) scrollHistoryTarget(list, target, "nearest");
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
        error,
        historyError,
        isOlderHistoryLoading,
        messages,
        olderPreviousHistorySessionId,
        previousSessionGroups,
        status,
        sessionId,
        hasOlderHistory,
    ]);

    function handleHistoryScroll() {
        const list = listRef.current;
        if (!list) return;

        const isNearBottom =
            list.scrollHeight - list.scrollTop - list.clientHeight <=
            SCROLL_BOTTOM_THRESHOLD_PX;
        if (!isReadingAnswerStartRef.current) {
            shouldAutoScrollRef.current = isNearBottom;
        }
        setIsNearHistoryBottom(isNearBottom);
    }

    function handleHistoryScrollIntent() {
        isReadingAnswerStartRef.current = false;
        handleHistoryScroll();
    }

    function handleHistoryScrollKey(event: KeyboardEvent<HTMLDivElement>) {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
        const isScrollKey = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key);
        const isScrollSpace = event.key === " " && !target.closest("button, a");
        if (isScrollKey || isScrollSpace) handleHistoryScrollIntent();
    }

    function handleJumpToLatest() {
        const list = listRef.current;
        if (!latestAssistant || !list) return;
        const target = document.getElementById(
            veraMessageStartId(
                latestAssistant.sessionId,
                latestAssistant.message.id,
            ),
        );
        if (!target) return;
        // Explicit reading starts at the answer's beginning. Following the
        // bottom on the next token would immediately lose that position.
        isReadingAnswerStartRef.current = true;
        shouldAutoScrollRef.current = false;
        target.focus({ preventScroll: true });
        setIsNearHistoryBottom(true);
        scrollHistoryTarget(
            list,
            target,
            "start",
            window.matchMedia?.("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
        );
    }

    function handleLoadOlderHistory() {
        if (listRef.current) {
            pendingHistoryAnchorRef.current = {
                kind: "current",
                firstMessageId: messages[0]?.id ?? null,
                scrollHeight: listRef.current.scrollHeight,
                trigger: document.activeElement,
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
                trigger: document.activeElement,
            };
        }
        void loadOlderPreviousHistory(group.sessionId);
    }

    const isDeliveryProcessing = deliveryState
        ? ["submitting", "accepted", "processing", "streaming"].includes(
              deliveryState,
          )
        : false;
    const isBusy =
        isDeliveryProcessing || status === "waiting" || status === "streaming";
    const blocksSubmission =
        isBusy ||
        isStartingNewDialog ||
        hasPendingNewDialog ||
        deliveryState === "unknown";
    const isSimplifyDisabled =
        blocksSubmission || isHistoryLoading || !sessionId;
    const shouldShowMobileCounter = input.length >= MOBILE_COUNTER_VISIBLE_FROM;
    /* Упрощается последняя реплика диалога — именно её агент видит в истории.
       Поэтому кнопку получает только последний завершённый ответ на основе
       базы знаний: под более старым ответом она переформулировала бы не его.
       После нажатия последним становится новый ответ (прямой, без базы
       знаний), и кнопка исчезает сама — повторных упрощений не возникает. */
    const lastMessage = messages[messages.length - 1];
    const simplifiableMessageId =
        lastMessage !== undefined &&
        lastMessage.role === "assistant" &&
        lastMessage.usedKnowledgeBase === true &&
        !lastMessage.streaming &&
        Boolean(lastMessage.content)
            ? lastMessage.id
            : null;

    const handleSimplify = useCallback(() => {
        if (blocksSubmission || isHistoryLoading || !sessionId) return;
        /* Черновик в поле ввода не трогаем: пользователь мог начать писать
           свой вопрос, и кнопка не должна его затирать или отправлять. */
        simplifyTriggerRef.current = document.activeElement;
        void sendMessage(SIMPLIFY_ANSWER_REQUEST, {
            waitingVariant: "simplify",
        });
    }, [blocksSubmission, isHistoryLoading, sendMessage, sessionId]);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const text = input.trim();
        if (
            !text ||
            blocksSubmission ||
            isHistoryLoading ||
            !sessionId ||
            !isDraftReady
        ) {
            return;
        }
        setInput("");
        const result = await sendMessage(text);
        if (result?.restoreDraft) {
            setInput((current) => current || text);
            if (
                composerRef.current?.contains(document.activeElement) ||
                (document.activeElement === document.body &&
                    composerRef.current?.contains(
                        lastFocusedElementRef.current,
                    ))
            ) {
                inputRef.current?.focus();
            }
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
        <div className="relative flex w-full min-w-0 max-w-full flex-col gap-4 max-sm:h-full max-sm:min-h-0 max-sm:flex-1 max-sm:gap-0">
            <section
                aria-label="Чат с Ассистентом Верой"
                className="flex h-[calc(100dvh-7rem)] min-h-[34rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.3)] max-sm:h-auto max-sm:min-h-0 max-sm:flex-1 max-sm:rounded-none max-sm:border-x-0 max-sm:border-y-0 max-sm:shadow-none"
            >
                <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2 pr-24 sm:gap-3 sm:px-5 sm:py-3 sm:pr-5">
                    <span
                        aria-hidden="true"
                        className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-accent/45 sm:h-11 sm:w-11"
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
                        <h1
                            ref={headingRef}
                            tabIndex={-1}
                            className="scroll-mt-28 rounded text-sm font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:text-base"
                        >
                            Ассистент Вера
                        </h1>
                        <p className="truncate text-[11px] text-muted sm:text-sm">
                            Консультант по трудовым правам
                        </p>
                        <p
                            id="vera-login-dialog-policy"
                            className="mt-1 hidden text-[11px] leading-snug text-muted sm:block"
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
                        onWheel={handleHistoryScrollIntent}
                        onTouchMove={handleHistoryScrollIntent}
                        onPointerDown={(event) => {
                            if (event.target === event.currentTarget) handleHistoryScrollIntent();
                        }}
                        onKeyDown={handleHistoryScrollKey}
                        className="vera-chat-scrollbar flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto overscroll-y-contain p-3 sm:gap-4 sm:p-6"
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
                                {group.historyCursor == null && (
                                    <p
                                        id={veraHistoryStartId(group.sessionId)}
                                        tabIndex={-1}
                                        className="rounded text-center text-xs text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        Вся история завершённого диалога
                                        загружена
                                    </p>
                                )}
                                <ChatMessageList
                                    messages={group.messages}
                                    sessionId={group.sessionId}
                                    onReturnToInput={returnToInput}
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
                        {!hasOlderHistory &&
                            !isHistoryLoading &&
                            messages.length > 0 && (
                                <p
                                    id={veraHistoryStartId(sessionId)}
                                    tabIndex={-1}
                                    className="rounded text-center text-xs text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                    Вся история диалога загружена
                                </p>
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
                            <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-4 py-3 text-center sm:gap-5 sm:py-6">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-bold text-foreground sm:text-2xl">
                                        Чем я могу помочь?
                                    </h2>
                                    <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
                                        Спросите о правах, льготах или
                                        трудоустройстве. Ассистент Вера ответит
                                        на основе базы знаний.
                                    </p>
                                </div>
                                <div
                                    id="vera-suggested-questions"
                                    role="group"
                                    aria-label="Примеры вопросов"
                                    className="grid w-full gap-2 sm:grid-cols-2"
                                >
                                    {SUGGESTED_QUESTIONS.map(
                                        (question, index) => (
                                            <button
                                                key={question}
                                                type="button"
                                                onClick={() =>
                                                    selectSuggestedQuestion(
                                                        question,
                                                    )
                                                }
                                                className={`min-h-11 rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-left text-sm leading-snug text-muted transition-colors hover:border-accent/50 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-4 sm:py-3 ${
                                                    index >= 2 &&
                                                    !showAllSuggestedQuestions
                                                        ? "max-sm:hidden"
                                                        : ""
                                                }`}
                                            >
                                                {question}
                                            </button>
                                        ),
                                    )}
                                    {!showAllSuggestedQuestions && (
                                        <button
                                            type="button"
                                            aria-expanded="false"
                                            aria-controls="vera-suggested-questions"
                                            onClick={() =>
                                                setShowAllSuggestedQuestions(
                                                    true,
                                                )
                                            }
                                            className="min-h-11 rounded-xl border border-accent/30 bg-accent/[0.05] px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent/60 hover:bg-accent/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
                                        >
                                            Ещё примеры вопросов
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        <ChatMessageList
                            messages={messages}
                            sessionId={sessionId}
                            waitingStage={waitingStage}
                            simplifiableMessageId={simplifiableMessageId}
                            isSimplifyDisabled={isSimplifyDisabled}
                            onSimplify={handleSimplify}
                            onReturnToInput={returnToInput}
                        />
                        {(error || historyError) && (
                            <div className="space-y-2 pt-1">
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
                    </div>
                    {!isNearHistoryBottom &&
                        hasVisibleMessages &&
                        latestAssistant && (
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

                <form
                    ref={composerRef}
                    aria-label="Отправка сообщения Ассистенту Вере"
                    onSubmit={handleSubmit}
                    className="vera-chat-composer min-w-0 shrink-0 border-t border-border bg-background/45 p-2 sm:p-4"
                >
                    {latestAssistant && (
                        <button
                            type="button"
                            onClick={handleJumpToLatest}
                            aria-controls={veraMessageStartId(
                                latestAssistant.sessionId,
                                latestAssistant.message.id,
                            )}
                            className="mb-2 rounded px-1 text-xs text-muted underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Перейти к последнему ответу
                        </button>
                    )}
                    <label htmlFor="vera-chat-input" className="sr-only">
                        Сообщение для Ассистента Веры
                    </label>
                    <div className="flex min-w-0 items-end gap-2 rounded-2xl border border-input bg-surface-hover/45 p-1.5 pl-3 focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:p-2 sm:pl-4">
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
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleInputKeyDown}
                            disabled={
                                isHistoryLoading ||
                                isStartingNewDialog ||
                                hasPendingNewDialog ||
                                !isDraftReady
                            }
                            maxLength={VERA_MESSAGE_MAX_LENGTH}
                            rows={1}
                            enterKeyHint="send"
                            aria-describedby="vera-chat-input-hint"
                            placeholder="Напишите вопрос Ассистенту Вере…"
                            className="max-h-24 min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 [field-sizing:content] sm:max-h-36"
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            aria-label="Отправить"
                            title="Отправить"
                            disabled={
                                blocksSubmission ||
                                isHistoryLoading ||
                                !isDraftReady ||
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
                    <div className="flex items-start justify-between gap-2 px-1 pt-1.5 text-[11px] leading-relaxed text-muted sm:gap-3 sm:px-2 sm:pt-2 sm:text-xs">
                        <p id="vera-chat-input-hint" className="break-words">
                            <span className="block">
                                Enter — отправить, Shift+Enter — новая строка.
                            </span>
                            <span className="block sm:hidden">
                                Вера может ошибаться — проверяйте важное.
                            </span>
                            <span className="hidden sm:block">
                                Ассистент Вера может ошибаться — проверяйте
                                важную информацию.
                            </span>
                            <span className="mt-0.5 hidden sm:block">
                                Консультацию можно отправить на почту —
                                попросите об этом в сообщении и укажите адрес.
                            </span>
                        </p>
                        <span
                            id="vera-chat-input-counter"
                            className={`shrink-0 tabular-nums ${
                                shouldShowMobileCounter ? "" : "max-sm:sr-only"
                            }`}
                        >
                            {`${input.length} / ${VERA_MESSAGE_MAX_LENGTH}`}
                        </span>
                    </div>
                    {draftStorageError && (
                        <p role="status" className="mt-1 text-xs text-muted">
                            Не удалось сохранить черновик в браузере. Перед
                            обновлением страницы скопируйте неотправленный
                            вопрос.
                        </p>
                    )}
                </form>
            </section>

            <div className="flex justify-end max-sm:h-0">
                <VeraFeedbackModal
                    key={JSON.stringify([feedbackOwner, sessionId])}
                    sessionId={sessionId}
                    compactOnMobile
                />
            </div>
        </div>
    );
}
