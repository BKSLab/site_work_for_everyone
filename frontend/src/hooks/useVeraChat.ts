"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { ApiRequestError } from "@/lib/api/client";
import type {
    VeraChatHistoryResponse,
    VeraChatHistoryTurn,
} from "@/lib/api/vera";
import { veraApi } from "@/lib/api/vera";
import { veraChatSchema } from "@/lib/schemas/vera";
import { useAuthStore } from "@/stores/auth";

const SESSION_STORAGE_KEY = "vera_session_id";

// 24ч — совпадает с REDIS_SESSION_TTL_SECONDS в vera_agent_service
// (LangGraph checkpointer теряет историю после этого TTL, значит и на
// клиенте разумно начинать видимо новый разговор).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Если за это время не пришло ни одного SSE-события (ни token, ни done,
// ни error) — считаем, что agent_service/RabbitMQ недоступны с точки
// зрения сайта (см. docs/VERA_AGENT_INTEGRATION_PLAN.md, "Обработка
// деградации"). Значение с запасом: analyze_intent + call_kb_search
// (пока нет первого токена) может занимать заметное время.
const RESPONSE_TIMEOUT_MS = 100_000;
const HISTORY_POLL_INTERVAL_MS = 2_000;

export interface VeraChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** request_id пары «вопрос пользователя — ответ Ассистента Веры» */
    requestId?: string;
    /** true, пока ассистент ещё стримит токены в это сообщение */
    streaming?: boolean;
    /** true только после подтверждённого SSE-события done */
    feedbackEligible?: boolean;
    /** ранее сохранённая оценка ответа */
    feedbackValue?: "up" | "down";
    /** состояние доставки исходного сообщения пользователя */
    deliveryStatus?: "sending" | "sent" | "rejected" | "unknown";
}

export interface VeraSendMessageResult {
    outcome: "accepted" | "rejected" | "unknown";
    restoreDraft: boolean;
}

type ChatStatus = "idle" | "waiting" | "streaming" | "unavailable";

type SseEvent =
    | { type: "token"; content: string }
    | { type: "done" }
    | { type: "error"; detail?: string };

function readOrCreateSessionId(): string {
    if (typeof window === "undefined") return "";

    try {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { id: string; createdAt: number };
            if (Date.now() - parsed.createdAt < SESSION_TTL_MS) {
                return parsed.id;
            }
        }
    } catch {
        // Повреждённые данные в sessionStorage — генерируем новую сессию.
    }

    const id = crypto.randomUUID();
    window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ id, createdAt: Date.now() }),
    );
    return id;
}

function storeSessionId(id: string) {
    window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ id, createdAt: Date.now() }),
    );
}

function resetSessionId(): string {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return readOrCreateSessionId();
}

function historyTurnToMessages(turn: VeraChatHistoryTurn): VeraChatMessage[] {
    const messages: VeraChatMessage[] = [
        {
            id: `${turn.request_id}:user`,
            role: "user",
            content: turn.question,
            deliveryStatus: "sent",
        },
    ];
    const isProcessing = turn.status === "processing";
    if (turn.answer || isProcessing) {
        messages.push({
            id: `${turn.request_id}:assistant`,
            role: "assistant",
            content: turn.answer ?? "",
            requestId: turn.request_id,
            streaming: isProcessing,
            feedbackEligible:
                turn.status === "completed" && Boolean(turn.answer),
            feedbackValue: turn.feedback_value ?? undefined,
        });
    }
    return messages;
}

function historyToMessages(
    history: VeraChatHistoryResponse,
): VeraChatMessage[] {
    return history.turns.flatMap(historyTurnToMessages);
}

function waitForHistoryPoll(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, HISTORY_POLL_INTERVAL_MS);
    });
}

export function useVeraChat() {
    const isAuthLoading = useAuthStore((state) => state.isLoading);
    const authUserId = useAuthStore((state) => state.user?.email ?? null);
    const [sessionId, setSessionId] = useState("");
    const [messages, setMessages] = useState<VeraChatMessage[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [historyCursor, setHistoryCursor] = useState<number | null>(null);
    const [isOlderHistoryLoading, setIsOlderHistoryLoading] = useState(false);
    const [status, setStatus] = useState<ChatStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    // Единственный управляемый статус для программ экранного доступа.
    // Токены и полный ответ сюда не попадают: длинную консультацию пользователь
    // читает в истории в удобном ему темпе.
    const [announcement, setAnnouncement] = useState("");

    const eventSourceRef = useRef<EventSource | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messagesRevisionRef = useRef(0);

    const closeStream = useCallback(() => {
        // Обязательное явное закрытие: EventSource по умолчанию сам
        // переподключается при разрыве соединения сервером, а сервер
        // (vera_agent_service) держит только один активный SSE-коннект на
        // запрос — молчаливый реконнект создал бы гонку за уже закрытую
        // на сервере подписку.
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const finishAssistantMessageAfterError = useCallback(
        (messageId: string) => {
            setMessages((prev) =>
                prev
                    .filter(
                        (message) =>
                            message.id !== messageId ||
                            Boolean(message.content),
                    )
                    .map((message) =>
                        message.id === messageId
                            ? { ...message, streaming: false }
                            : message,
                    ),
            );
        },
        [],
    );

    useEffect(() => closeStream, [closeStream]);

    useEffect(() => {
        if (isAuthLoading) return;

        const controller = new AbortController();
        let cancelled = false;

        async function resolveCurrentSession() {
            setIsHistoryLoading(true);
            setHistoryError(null);
            try {
                const currentSession = await veraApi.getCurrentSession(
                    controller.signal,
                );
                if (cancelled) return;

                const resolvedSessionId =
                    currentSession.session_id ?? readOrCreateSessionId();
                if (currentSession.session_id) {
                    storeSessionId(currentSession.session_id);
                }
                setSessionId(resolvedSessionId);
            } catch (error) {
                if (cancelled || controller.signal.aborted) return;
                setIsHistoryLoading(false);
                setHistoryError(
                    error instanceof ApiRequestError
                        ? error.detail
                        : "Не удалось определить текущий диалог.",
                );
            }
        }

        void resolveCurrentSession();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [authUserId, isAuthLoading]);

    useEffect(() => {
        if (!sessionId) return;

        const controller = new AbortController();
        let cancelled = false;
        const messagesRevision = messagesRevisionRef.current;

        async function restoreHistory() {
            const startedAt = Date.now();
            setIsHistoryLoading(true);
            setHistoryError(null);

            try {
                while (!cancelled) {
                    let history: VeraChatHistoryResponse;
                    try {
                        history = await veraApi.getHistory(sessionId, {
                            signal: controller.signal,
                        });
                    } catch (error) {
                        if (cancelled || controller.signal.aborted) return;
                        if (messagesRevisionRef.current !== messagesRevision) {
                            return;
                        }
                        if (
                            error instanceof ApiRequestError &&
                            error.status === 404
                        ) {
                            setMessages([]);
                            return;
                        }
                        if (
                            error instanceof ApiRequestError &&
                            (error.status === 401 || error.status === 403)
                        ) {
                            setSessionId(resetSessionId());
                            return;
                        }
                        setHistoryError(
                            error instanceof ApiRequestError
                                ? error.detail
                                : "Не удалось восстановить историю диалога.",
                        );
                        return;
                    }

                    if (cancelled) return;
                    if (messagesRevisionRef.current !== messagesRevision) {
                        return;
                    }
                    setMessages(historyToMessages(history));
                    setHistoryCursor(history.next_before_sequence ?? null);

                    const hasProcessingTurn = history.turns.some(
                        (turn) => turn.status === "processing",
                    );
                    if (!hasProcessingTurn) {
                        setStatus("idle");
                        if (history.turns.length > 0) {
                            setAnnouncement("История диалога восстановлена.");
                        }
                        return;
                    }

                    setStatus("waiting");
                    setAnnouncement("Ассистент Вера готовит ответ.");
                    if (Date.now() - startedAt >= RESPONSE_TIMEOUT_MS) {
                        setMessages((current) =>
                            current.filter(
                                (message) =>
                                    message.role === "user" ||
                                    Boolean(message.content),
                            ),
                        );
                        setStatus("unavailable");
                        setAnnouncement("");
                        setHistoryError(
                            "Ответ Ассистента Веры ещё не готов. Попробуйте обновить страницу позже.",
                        );
                        return;
                    }

                    await waitForHistoryPoll();
                }
            } finally {
                if (!cancelled) {
                    setIsHistoryLoading(false);
                }
            }
        }

        void restoreHistory();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [sessionId]);

    const loadOlderHistory = useCallback(async () => {
        if (!sessionId || historyCursor === null || isOlderHistoryLoading) {
            return;
        }
        setIsOlderHistoryLoading(true);
        setHistoryError(null);
        try {
            const history = await veraApi.getHistory(sessionId, {
                beforeSequence: historyCursor,
            });
            const olderMessages = historyToMessages(history);
            setMessages((current) => {
                const currentIds = new Set(
                    current.map((message) => message.id),
                );
                return [
                    ...olderMessages.filter(
                        (message) => !currentIds.has(message.id),
                    ),
                    ...current,
                ];
            });
            setHistoryCursor(history.next_before_sequence ?? null);
        } catch (error) {
            setHistoryError(
                error instanceof ApiRequestError
                    ? error.detail
                    : "Не удалось загрузить предыдущие сообщения.",
            );
        } finally {
            setIsOlderHistoryLoading(false);
        }
    }, [historyCursor, isOlderHistoryLoading, sessionId]);

    const sendMessage = useCallback(
        async (text: string): Promise<VeraSendMessageResult> => {
            if (!sessionId) {
                setError(
                    "Чат ещё загружается. Попробуйте отправить сообщение ещё раз.",
                );
                return { outcome: "rejected", restoreDraft: true };
            }

            const requestId = crypto.randomUUID();
            const payload = veraChatSchema.safeParse({
                session_id: sessionId,
                request_id: requestId,
                message: text,
            });
            if (!payload.success) {
                setError(
                    payload.error.issues[0]?.message ??
                        "Не удалось проверить сообщение.",
                );
                return { outcome: "rejected", restoreDraft: true };
            }

            setError(null);
            setStatus("waiting");
            setAnnouncement("Ассистент Вера готовит ответ.");
            messagesRevisionRef.current += 1;

            const userMessageId = crypto.randomUUID();
            const assistantMessageId = crypto.randomUUID();
            setMessages((prev) => [
                ...prev,
                {
                    id: userMessageId,
                    role: "user",
                    content: payload.data.message,
                    deliveryStatus: "sending",
                },
                {
                    id: assistantMessageId,
                    role: "assistant",
                    content: "",
                    requestId,
                    streaming: true,
                    feedbackEligible: false,
                },
            ]);

            // Открываем SSE до публикации сообщения в очередь — проще
            // рассуждать о порядке событий, хотя буфер позднего
            // подключения на стороне agent_service (session_bus.py,
            // LATE_CONNECT_BUFFER_SECONDS = 60s) страхует и обратный порядок.
            const eventSource = new EventSource(
                `/vera/sse/${encodeURIComponent(requestId)}`,
            );
            eventSourceRef.current = eventSource;

            timeoutRef.current = setTimeout(() => {
                closeStream();
                finishAssistantMessageAfterError(assistantMessageId);
                setStatus("unavailable");
                setAnnouncement("");
                setError("Ассистент Вера сейчас недоступен. Попробуйте позже.");
            }, RESPONSE_TIMEOUT_MS);

            eventSource.onmessage = (event) => {
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }

                let data: SseEvent;
                try {
                    data = JSON.parse(event.data) as SseEvent;
                } catch {
                    closeStream();
                    finishAssistantMessageAfterError(assistantMessageId);
                    setStatus("unavailable");
                    setAnnouncement("");
                    setError(
                        "Не удалось обработать ответ Ассистента Веры. Попробуйте ещё раз.",
                    );
                    return;
                }

                if (data.type === "token") {
                    setStatus("streaming");
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMessageId
                                ? { ...m, content: m.content + data.content }
                                : m,
                        ),
                    );
                    return;
                }

                if (data.type === "done") {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMessageId
                                ? {
                                      ...m,
                                      streaming: false,
                                      feedbackEligible: true,
                                  }
                                : m,
                        ),
                    );
                    setAnnouncement("Ответ Ассистента Веры готов.");
                    setStatus("idle");
                    closeStream();
                    return;
                }

                // data.type === "error"
                finishAssistantMessageAfterError(assistantMessageId);
                setStatus("idle");
                setAnnouncement("");
                setError(
                    data.detail ||
                        "Не удалось подготовить ответ. Попробуйте ещё раз.",
                );
                closeStream();
            };

            eventSource.onerror = () => {
                closeStream();
                finishAssistantMessageAfterError(assistantMessageId);
                setStatus("unavailable");
                setAnnouncement("");
                setError(
                    "Не удалось получить ответ Ассистента Веры. Проверьте соединение.",
                );
            };

            try {
                await veraApi.sendMessage({
                    session_id: payload.data.session_id,
                    request_id: payload.data.request_id,
                    message: payload.data.message,
                });
                setMessages((prev) =>
                    prev.map((message) =>
                        message.id === userMessageId
                            ? { ...message, deliveryStatus: "sent" }
                            : message,
                    ),
                );
                return { outcome: "accepted", restoreDraft: false };
            } catch (err) {
                closeStream();
                setStatus("idle");
                const isApiError = err instanceof ApiRequestError;
                const isDefinitelyRejected =
                    isApiError && (err.status === 422 || err.status === 429);
                const deliveryStatus =
                    isApiError &&
                    (err.status === 401 ||
                        err.status === 403 ||
                        isDefinitelyRejected)
                        ? "rejected"
                        : "unknown";
                setMessages((prev) =>
                    prev
                        .filter((message) => message.id !== assistantMessageId)
                        .map((message) =>
                            message.id === userMessageId
                                ? { ...message, deliveryStatus }
                                : message,
                        ),
                );
                setAnnouncement("");
                if (
                    isApiError &&
                    (err.status === 401 || err.status === 403)
                ) {
                    setSessionId(resetSessionId());
                    setError(
                        "Сессия чата обновлена. Отправьте сообщение ещё раз.",
                    );
                    return { outcome: "rejected", restoreDraft: false };
                }
                setError(
                    err instanceof Error
                        ? err.message
                        : "Не удалось отправить сообщение.",
                );
                return {
                    outcome: deliveryStatus,
                    restoreDraft: isDefinitelyRejected,
                };
            }
        },
        [sessionId, closeStream, finishAssistantMessageAfterError],
    );

    return {
        sessionId,
        messages,
        sendMessage,
        status,
        error,
        announcement,
        isHistoryLoading,
        historyError,
        hasOlderHistory: historyCursor !== null,
        isOlderHistoryLoading,
        loadOlderHistory,
    };
}
