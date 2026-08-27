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
    VeraChatSessionLifecycleResponse,
    VeraChatSessionResolveResponse,
    VeraCurrentChatSessionResponse,
} from "@/lib/api/vera";
import { veraApi } from "@/lib/api/vera";
import {
    veraChatSchema,
    veraSseEventSchema,
    type VeraSseEvent,
} from "@/lib/schemas/vera";
import { useAuthStore } from "@/stores/auth";

const SESSION_STORAGE_KEY = "vera_session_id";
const PENDING_REQUEST_STORAGE_KEY = "vera_pending_request";
const PENDING_SESSION_RESOLUTION_STORAGE_KEY =
    "vera_pending_session_resolution";
const PENDING_NEW_DIALOG_STORAGE_KEY = "vera_pending_new_dialog";

// Agent присылает heartbeat каждые 15с. Поэтому 30с достаточно для первого
// признака жизни, 45с допускают потерю одного heartbeat, а общий deadline
// 450с оставляет клиенту 30с поверх server deadline 420с.
const FIRST_EVENT_TIMEOUT_MS = 30_000;
const INACTIVITY_TIMEOUT_MS = 45_000;
const OVERALL_RESPONSE_DEADLINE_MS = 450_000;
const HISTORY_POLL_INTERVAL_MS = 2_000;
const EXPECTED_DELAY_HINT_MS = 6_000;
const EXTENDED_DELAY_HINT_MS = 20_000;
// BFF обрывает upstream через 15с; ещё 5с ограничивают browser blackhole,
// после чего abort означает unknown transport outcome и запускает history lookup.
const POST_RECEIPT_TIMEOUT_MS = 20_000;
const POST_RECONCILIATION_LOOKUP_TIMEOUT_MS = 30_000;
const ABANDONED_RECOVERY_DETAIL =
    "Не удалось восстановить незавершённую отправку. Начат новый диалог; исходный текст можно отправить повторно.";

/**
 * Текст, который отправляет кнопка «Объяснить проще» под ответом на основе
 * базы знаний. Для агента это обычная реплика пользователя: отдельного поля
 * в контракте очереди и отдельной ветки графа у кнопки нет, сценарий уже
 * описан в системном промпте Веры.
 *
 * Формулировку нельзя менять, не сверившись с
 * `vera_agent_service/app/graph/policy.py` (`SIMPLIFY_ANSWER_REQUEST`): в ней
 * не должно быть слов вроде «право», «закон», «льгота», «квота». Иначе
 * защита VERA-021 примет нажатие кнопки за новый правовой вопрос, уведёт его
 * в поиск по базе знаний и вернёт второй развёрнутый ответ вместо
 * переформулировки предыдущего.
 */
export const SIMPLIFY_ANSWER_REQUEST = "Объясни предыдущий ответ проще";
export const SIMPLIFY_WAITING_TEXT = "Готовлю более простое объяснение";

export type VeraWaitingVariant = "default" | "simplify";

export interface VeraSendMessageOptions {
    /** Клиентский вариант статуса; в API и текст сообщения не попадает. */
    waitingVariant?: VeraWaitingVariant;
}

export type VeraDeliveryState =
    | "draft"
    | "submitting"
    | "accepted"
    | "processing"
    | "streaming"
    | "completed"
    | "failed"
    | "unknown";

function canTransitionDeliveryState(
    currentState: VeraDeliveryState,
    nextState: VeraDeliveryState,
): boolean {
    switch (currentState) {
        case "draft":
        case "completed":
        case "failed":
            return nextState === "submitting";
        case "submitting":
            return ["accepted", "failed", "unknown"].includes(nextState);
        case "accepted":
            return ["processing", "failed", "unknown"].includes(nextState);
        case "processing":
            return ["streaming", "completed", "failed", "unknown"].includes(
                nextState,
            );
        case "streaming":
            return ["completed", "failed", "unknown"].includes(nextState);
        case "unknown":
            return false;
    }
}

const DELIVERY_STATES_ALLOWING_NEW_REQUEST = new Set<VeraDeliveryState>([
    "draft",
    "completed",
    "failed",
]);

const DELIVERY_STATES_ENDING_WAIT = new Set<VeraDeliveryState>([
    "draft",
    "completed",
    "failed",
    "unknown",
]);

const FAILED_HISTORY_STATUSES = new Set([
    "generation_failed",
    "stream_interrupted",
    "cancelled",
]);

function historyStatusToDeliveryState(status: string): VeraDeliveryState {
    if (status === "processing") return "processing";
    if (status === "completed") return "completed";
    if (FAILED_HISTORY_STATUSES.has(status)) return "failed";
    return "unknown";
}

export interface VeraChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** request_id пары «вопрос пользователя — ответ Ассистента Веры» */
    requestId?: string;
    /** true, пока ассистент ещё стримит токены в это сообщение */
    streaming?: boolean;
    /** Вариант начального статуса для оптимистичного ответа. */
    waitingVariant?: VeraWaitingVariant;
    /** true после подтверждённого completed через SSE или историю */
    feedbackEligible?: boolean;
    /** ранее сохранённая оценка ответа */
    feedbackValue?: "up" | "down";
    /**
     * Ответ построен на данных базы знаний. Только для таких ответов есть
     * что упрощать: прямой ответ, честное «не нашлось» и недоступность
     * поиска приходят с `false`.
     */
    usedKnowledgeBase?: boolean;
    /** состояние доставки исходного сообщения пользователя */
    deliveryStatus?: "sending" | "sent" | "rejected" | "unknown";
    /** состояние текущего ответа в явном автомате доставки */
    deliveryState?: VeraDeliveryState;
}

export interface VeraSendMessageResult {
    outcome: "accepted" | "rejected" | "unknown";
    restoreDraft: boolean;
}

export type VeraWaitingStage = "initial" | "expected-delay" | "extended";

export interface VeraPreviousSessionGroup {
    sessionId: string;
    messages: VeraChatMessage[];
    historyCursor: number | null;
}

interface VeraPendingRequest {
    sessionId: string;
    requestId: string;
    message: string;
    createdAt: number;
}

type ChatStatus = "idle" | "waiting" | "streaming" | "unavailable";

type ParsedSseEvent =
    | VeraSseEvent
    | { type: "ignored"; originalType: string };

function parseSseEvent(rawData: unknown): ParsedSseEvent | null {
    if (
        typeof rawData !== "object" ||
        rawData === null ||
        !("type" in rawData) ||
        typeof rawData.type !== "string"
    ) {
        return null;
    }

    if (
        !(["token", "heartbeat", "done", "error"] as string[]).includes(
            rawData.type,
        )
    ) {
        return { type: "ignored", originalType: rawData.type };
    }

    const parsedEvent = veraSseEventSchema.safeParse(rawData);
    return parsedEvent.success ? parsedEvent.data : null;
}

function readStoredSessionId(): string | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { id?: unknown };
            if (typeof parsed.id === "string" && parsed.id) {
                return parsed.id;
            }
        }
    } catch {
        // Повреждённые данные не участвуют в выборе текущей сессии.
    }

    return null;
}

function readOrCreateSessionId(): string {
    if (typeof window === "undefined") return "";

    const storedSessionId = readStoredSessionId();
    if (storedSessionId) return storedSessionId;

    const id = crypto.randomUUID();
    window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ id }),
    );
    return id;
}

function storeSessionId(id: string): boolean {
    try {
        window.sessionStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify({ id }),
        );
        return true;
    } catch {
        return false;
    }
}

interface VeraPendingSessionResolution {
    sessionId: string;
    replacementSessionId: string;
}

interface VeraPendingNewDialog {
    previousSessionId: string;
    newSessionId: string;
    ownerRecoverySessionId?: string;
    ownerRecoveryReplacementSessionId?: string;
    ownerRecoveryRejectionStatus?: 403 | 409;
    ownerRecoveryPredecessorUnverified?: boolean;
    ownerRecoveryNeedsRebase?: boolean;
    ownerRecoveryTerminalAttempt?: boolean;
    ownerRecoveryUsableSessionId?: string;
    resolve403Rekeyed?: boolean;
}

type VeraNewDialogOperationPhase =
    | "resolve"
    | "history"
    | "close"
    | "create";

class VeraNewDialogOperationError extends Error {
    constructor(
        readonly phase: VeraNewDialogOperationPhase,
        readonly originalError: unknown,
    ) {
        super(
            originalError instanceof Error
                ? originalError.message
                : "Не удалось выполнить операцию нового диалога.",
        );
        this.name = "VeraNewDialogOperationError";
    }
}

function unwrapNewDialogOperationError(error: unknown): unknown {
    return error instanceof VeraNewDialogOperationError
        ? error.originalError
        : error;
}

function readPendingNewDialog(): VeraPendingNewDialog | null {
    try {
        const raw = window.sessionStorage.getItem(
            PENDING_NEW_DIALOG_STORAGE_KEY,
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            previousSessionId?: unknown;
            newSessionId?: unknown;
            ownerRecoverySessionId?: unknown;
            ownerRecoveryReplacementSessionId?: unknown;
            ownerRecoveryRejectionStatus?: unknown;
            ownerRecoveryPredecessorUnverified?: unknown;
            ownerRecoveryNeedsRebase?: unknown;
            ownerRecoveryTerminalAttempt?: unknown;
            ownerRecoveryUsableSessionId?: unknown;
            resolve403Rekeyed?: unknown;
        };
        if (
            typeof parsed.previousSessionId === "string" &&
            parsed.previousSessionId &&
            typeof parsed.newSessionId === "string" &&
            parsed.newSessionId
        ) {
            const operation: VeraPendingNewDialog = {
                previousSessionId: parsed.previousSessionId,
                newSessionId: parsed.newSessionId,
            };
            if (
                typeof parsed.ownerRecoverySessionId === "string" &&
                parsed.ownerRecoverySessionId &&
                typeof parsed.ownerRecoveryReplacementSessionId ===
                    "string" &&
                parsed.ownerRecoveryReplacementSessionId
            ) {
                operation.ownerRecoverySessionId =
                    parsed.ownerRecoverySessionId;
                operation.ownerRecoveryReplacementSessionId =
                    parsed.ownerRecoveryReplacementSessionId;
                if (
                    parsed.ownerRecoveryRejectionStatus === 403 ||
                    parsed.ownerRecoveryRejectionStatus === 409
                ) {
                    operation.ownerRecoveryRejectionStatus =
                        parsed.ownerRecoveryRejectionStatus;
                }
                if (parsed.ownerRecoveryTerminalAttempt === true) {
                    operation.ownerRecoveryTerminalAttempt = true;
                }
                if (parsed.ownerRecoveryPredecessorUnverified === true) {
                    operation.ownerRecoveryPredecessorUnverified = true;
                }
                if (parsed.ownerRecoveryNeedsRebase === true) {
                    operation.ownerRecoveryNeedsRebase = true;
                }
                if (
                    typeof parsed.ownerRecoveryUsableSessionId === "string" &&
                    parsed.ownerRecoveryUsableSessionId
                ) {
                    operation.ownerRecoveryUsableSessionId =
                        parsed.ownerRecoveryUsableSessionId;
                }
            }
            if (parsed.resolve403Rekeyed === true) {
                operation.resolve403Rekeyed = true;
            }
            return operation;
        }
    } catch {
        // Повреждённая операция не может безопасно закрыть текущий диалог.
    }
    return null;
}

function storePendingNewDialog(operation: VeraPendingNewDialog): boolean {
    try {
        window.sessionStorage.setItem(
            PENDING_NEW_DIALOG_STORAGE_KEY,
            JSON.stringify(operation),
        );
        return true;
    } catch {
        return false;
    }
}

function clearPendingNewDialog(operation: VeraPendingNewDialog): boolean {
    try {
        const pendingOperation = readPendingNewDialog();
        if (!pendingOperation) return true;
        if (
            pendingOperation?.previousSessionId ===
                operation.previousSessionId &&
            pendingOperation.newSessionId === operation.newSessionId
        ) {
            window.sessionStorage.removeItem(PENDING_NEW_DIALOG_STORAGE_KEY);
            return true;
        }
    } catch {
        // Повреждённую запись следующая явная операция перезапишет.
    }
    return false;
}

function readPendingSessionResolution(): VeraPendingSessionResolution | null {
    try {
        const raw = window.sessionStorage.getItem(
            PENDING_SESSION_RESOLUTION_STORAGE_KEY,
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            sessionId?: unknown;
            replacementSessionId?: unknown;
        };
        if (
            typeof parsed.sessionId === "string" &&
            parsed.sessionId &&
            typeof parsed.replacementSessionId === "string" &&
            parsed.replacementSessionId
        ) {
            return {
                sessionId: parsed.sessionId,
                replacementSessionId: parsed.replacementSessionId,
            };
        }
    } catch {
        // Повреждённая запись не участвует в lifecycle recovery.
    }
    return null;
}

function storeSessionReplacementId(
    sessionId: string,
    replacementSessionId: string,
): boolean {
    try {
        window.sessionStorage.setItem(
            PENDING_SESSION_RESOLUTION_STORAGE_KEY,
            JSON.stringify({ sessionId, replacementSessionId }),
        );
        return true;
    } catch {
        return false;
    }
}

function readOrCreateSessionReplacementId(sessionId: string): string | null {
    const pendingResolution = readPendingSessionResolution();
    if (pendingResolution?.sessionId === sessionId) {
        return pendingResolution.replacementSessionId;
    }

    const replacementSessionId = crypto.randomUUID();
    return storeSessionReplacementId(sessionId, replacementSessionId)
        ? replacementSessionId
        : null;
}

function clearSessionReplacementId(
    sessionId: string,
    replacementSessionId: string,
): boolean {
    try {
        const raw = window.sessionStorage.getItem(
            PENDING_SESSION_RESOLUTION_STORAGE_KEY,
        );
        if (!raw) return true;
        const parsed = JSON.parse(raw) as {
            sessionId?: unknown;
            replacementSessionId?: unknown;
        };
        if (
            parsed.sessionId === sessionId &&
            parsed.replacementSessionId === replacementSessionId
        ) {
            window.sessionStorage.removeItem(
                PENDING_SESSION_RESOLUTION_STORAGE_KEY,
            );
            return (
                window.sessionStorage.getItem(
                    PENDING_SESSION_RESOLUTION_STORAGE_KEY,
                ) === null
            );
        }
        return true;
    } catch {
        return false;
    }
}

function resetSessionId(): string {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return readOrCreateSessionId();
}

function readStoredPendingRequest(): VeraPendingRequest | null {
    try {
        const raw = window.sessionStorage.getItem(
            PENDING_REQUEST_STORAGE_KEY,
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<VeraPendingRequest>;
        if (
            typeof parsed.sessionId !== "string" ||
            !parsed.sessionId ||
            typeof parsed.requestId !== "string" ||
            !parsed.requestId ||
            typeof parsed.message !== "string" ||
            typeof parsed.createdAt !== "number" ||
            !Number.isFinite(parsed.createdAt)
        ) {
            return null;
        }
        return {
            sessionId: parsed.sessionId,
            requestId: parsed.requestId,
            message: parsed.message,
            createdAt: parsed.createdAt,
        };
    } catch {
        return null;
    }
}

function storePendingRequest(pendingRequest: VeraPendingRequest): boolean {
    try {
        window.sessionStorage.setItem(
            PENDING_REQUEST_STORAGE_KEY,
            JSON.stringify(pendingRequest),
        );
        return true;
    } catch {
        return false;
    }
}

function clearPendingRequest(requestId: string) {
    try {
        const pendingRequest = readPendingRequestForClear();
        if (pendingRequest?.requestId === requestId) {
            window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        }
    } catch {
        // Недоступное хранилище не должно ломать terminal UI.
    }
}

function readPendingRequestForClear(): Pick<
    VeraPendingRequest,
    "requestId"
> | null {
    try {
        const raw = window.sessionStorage.getItem(
            PENDING_REQUEST_STORAGE_KEY,
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<VeraPendingRequest>;
        return typeof parsed.requestId === "string" && parsed.requestId
            ? { requestId: parsed.requestId }
            : null;
    } catch {
        return null;
    }
}

function pendingRequestToMessages(
    pendingRequest: VeraPendingRequest,
): VeraChatMessage[] {
    return [
        {
            id: `${pendingRequest.requestId}:user`,
            role: "user",
            content: pendingRequest.message,
            deliveryStatus: "unknown",
        },
        {
            id: `${pendingRequest.requestId}:assistant`,
            role: "assistant",
            content: "",
            requestId: pendingRequest.requestId,
            streaming: true,
            feedbackEligible: false,
            deliveryState: "submitting",
        },
    ];
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
    const turnDeliveryState = historyStatusToDeliveryState(turn.status);
    const isProcessing = turnDeliveryState === "processing";
    if (turn.answer || turnDeliveryState !== "completed") {
        messages.push({
            id: `${turn.request_id}:assistant`,
            role: "assistant",
            content: turn.answer ?? "",
            requestId: turn.request_id,
            streaming: isProcessing,
            feedbackEligible:
                turn.status === "completed" && Boolean(turn.answer),
            feedbackValue: turn.feedback_value ?? undefined,
            usedKnowledgeBase: turn.used_knowledge_base === true,
            deliveryState: turnDeliveryState,
        });
    }
    return messages;
}

function historyToMessages(
    history: VeraChatHistoryResponse,
): VeraChatMessage[] {
    return history.turns.flatMap(historyTurnToMessages);
}

function waitForHistoryPoll(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        const finish = () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener("abort", finish);
            resolve();
        };
        const timeoutId = setTimeout(finish, HISTORY_POLL_INTERVAL_MS);
        signal?.addEventListener("abort", finish, { once: true });
    });
}

export function useVeraChat() {
    const isAuthLoading = useAuthStore((state) => state.isLoading);
    const authUserId = useAuthStore((state) => state.user?.email ?? null);
    const [sessionId, setSessionId] = useState("");
    const [messages, setMessages] = useState<VeraChatMessage[]>([]);
    const [previousSessionGroups, setPreviousSessionGroups] = useState<
        VeraPreviousSessionGroup[]
    >([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [historyCursor, setHistoryCursor] = useState<number | null>(null);
    const [isOlderHistoryLoading, setIsOlderHistoryLoading] = useState(false);
    const [olderPreviousHistorySessionId, setOlderPreviousHistorySessionId] =
        useState<string | null>(null);
    const [isStartingNewDialog, setIsStartingNewDialog] = useState(false);
    const [hasPendingNewDialog, setHasPendingNewDialog] = useState(false);
    const [status, setStatus] = useState<ChatStatus>("idle");
    const [deliveryState, setDeliveryState] =
        useState<VeraDeliveryState>("draft");
    const [waitingStage, setWaitingStage] =
        useState<VeraWaitingStage>("initial");
    const [error, setError] = useState<string | null>(null);
    // Единственный управляемый статус для программ экранного доступа.
    // Токены и полный ответ сюда не попадают: длинную консультацию пользователь
    // читает в истории в удобном ему темпе.
    const [announcement, setAnnouncement] = useState("");

    const eventSourceRef = useRef<EventSource | null>(null);
    const newDialogControllerRef = useRef<AbortController | null>(null);
    const sendResolveControllerRef = useRef<AbortController | null>(null);
    const postControllerRef = useRef<AbortController | null>(null);
    const reconciliationControllerRef = useRef<AbortController | null>(null);
    const olderHistoryControllerRef = useRef<AbortController | null>(null);
    const olderPreviousHistoryControllerRef =
        useRef<AbortController | null>(null);
    const activeRequestIdRef = useRef<string | null>(null);
    const isStartingNewDialogRef = useRef(false);
    const sessionIdRef = useRef("");
    const controlledSessionTransitionRef = useRef<string | null>(null);
    const previousAuthUserIdRef = useRef<string | null | undefined>(
        undefined,
    );
    const authUserIdRef = useRef(authUserId);
    const deliveryStateRef = useRef<VeraDeliveryState>("draft");
    const firstEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const overallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const expectedDelayTimeoutRef = useRef<
        ReturnType<typeof setTimeout> | null
    >(null);
    const extendedDelayTimeoutRef = useRef<
        ReturnType<typeof setTimeout> | null
    >(null);
    const waitingRequestIdRef = useRef<string | null>(null);
    const isMountedRef = useRef(true);
    const messagesRevisionRef = useRef(0);
    const tokenBufferRef = useRef<{
        messageId: string;
        content: string;
    } | null>(null);
    const tokenFrameRef = useRef<number | null>(null);

    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    const clearWaitingTimers = useCallback(() => {
        if (expectedDelayTimeoutRef.current !== null) {
            clearTimeout(expectedDelayTimeoutRef.current);
            expectedDelayTimeoutRef.current = null;
        }
        if (extendedDelayTimeoutRef.current !== null) {
            clearTimeout(extendedDelayTimeoutRef.current);
            extendedDelayTimeoutRef.current = null;
        }
    }, []);

    const stopWaitingHints = useCallback(() => {
        clearWaitingTimers();
        waitingRequestIdRef.current = null;
        if (isMountedRef.current) {
            setWaitingStage("initial");
        }
    }, [clearWaitingTimers]);

    const startWaitingHints = useCallback(
        (
            requestId: string,
            rawStartedAt: number,
            waitingVariant: VeraWaitingVariant = "default",
        ) => {
            if (
                !isMountedRef.current ||
                activeRequestIdRef.current !== requestId
            ) {
                return;
            }
            clearWaitingTimers();
            waitingRequestIdRef.current = requestId;

            const now = Date.now();
            const startedAt = Number.isFinite(rawStartedAt)
                ? Math.min(rawStartedAt, now)
                : now;
            const elapsed = Math.max(0, now - startedAt);
            const requestIsCurrent = () =>
                isMountedRef.current &&
                activeRequestIdRef.current === requestId &&
                waitingRequestIdRef.current === requestId;

            const showExpectedDelay = () => {
                if (!requestIsCurrent()) return;
                setWaitingStage("expected-delay");
                setAnnouncement(
                    "Ассистент Вера разбирается в вопросе.",
                );
            };
            const showExtendedDelay = () => {
                if (!requestIsCurrent()) return;
                setWaitingStage("extended");
                setAnnouncement(
                    "Ассистент Вера продолжает готовить ответ.",
                );
            };

            if (!requestIsCurrent()) return;

            if (elapsed >= EXTENDED_DELAY_HINT_MS) {
                showExtendedDelay();
                return;
            }

            if (elapsed >= EXPECTED_DELAY_HINT_MS) {
                showExpectedDelay();
            } else {
                setWaitingStage("initial");
                setAnnouncement(
                    waitingVariant === "simplify"
                        ? "Ассистент Вера готовит более простое объяснение."
                        : "Ассистент Вера анализирует сообщение.",
                );
                expectedDelayTimeoutRef.current = setTimeout(
                    showExpectedDelay,
                    EXPECTED_DELAY_HINT_MS - elapsed,
                );
            }

            extendedDelayTimeoutRef.current = setTimeout(
                showExtendedDelay,
                EXTENDED_DELAY_HINT_MS - elapsed,
            );
        },
        [clearWaitingTimers],
    );

    const preservePreviousSession = useCallback(
        (
            previousSessionId: string,
            previousMessages: VeraChatMessage[],
            previousHistoryCursor: number | null,
        ) => {
            setPreviousSessionGroups((current) => {
                const group = {
                    sessionId: previousSessionId,
                    messages: previousMessages,
                    historyCursor: previousHistoryCursor,
                };
                const existingIndex = current.findIndex(
                    (candidate) =>
                        candidate.sessionId === previousSessionId,
                );
                if (existingIndex === -1) return [...current, group];

                return current.map((candidate, index) =>
                    index === existingIndex ? group : candidate,
                );
            });
        },
        [],
    );

    const storeResolvedSession = useCallback(
        (
            resolvedSessionId: string,
            skipHistoryRestore: boolean,
        ): boolean => {
            if (!storeSessionId(resolvedSessionId)) return false;
            sessionIdRef.current = resolvedSessionId;
            if (skipHistoryRestore) {
                controlledSessionTransitionRef.current = resolvedSessionId;
            }
            setSessionId(resolvedSessionId);
            return true;
        },
        [],
    );

    const discardForeignOwnerArtifacts = useCallback(
        (preservePendingNewDialog = false): boolean => {
            try {
                window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
                window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
                window.sessionStorage.removeItem(
                    PENDING_SESSION_RESOLUTION_STORAGE_KEY,
                );
                if (!preservePendingNewDialog) {
                    window.sessionStorage.removeItem(
                        PENDING_NEW_DIALOG_STORAGE_KEY,
                    );
                }
            } catch {
                return false;
            }

            messagesRevisionRef.current += 1;
            olderHistoryControllerRef.current?.abort();
            olderHistoryControllerRef.current = null;
            olderPreviousHistoryControllerRef.current?.abort();
            olderPreviousHistoryControllerRef.current = null;
            setMessages([]);
            setPreviousSessionGroups([]);
            setHistoryCursor(null);
            setIsOlderHistoryLoading(false);
            setOlderPreviousHistorySessionId(null);
            setHasPendingNewDialog(preservePendingNewDialog);
            setHistoryError(null);
            setError(null);
            stopWaitingHints();
            setAnnouncement("");
            return true;
        },
        [stopWaitingHints],
    );

    const completeNewDialogOperation = useCallback(
        async ({
            operation,
            previousMessages,
            previousHistoryCursor,
            signal,
            requestAuthUserId,
        }: {
            operation: VeraPendingNewDialog;
            previousMessages: VeraChatMessage[];
            previousHistoryCursor: number | null;
            signal: AbortSignal;
            requestAuthUserId: string | null;
        }): Promise<boolean> => {
            try {
                await veraApi.closeSession(
                    operation.previousSessionId,
                    signal,
                );
            } catch (closeError) {
                if (
                    !(
                        closeError instanceof ApiRequestError &&
                        closeError.status === 404
                    )
                ) {
                    throw new VeraNewDialogOperationError(
                        "close",
                        closeError,
                    );
                }
                // An idempotent retry can observe an already absent
                // predecessor. There is nothing left to close, so the
                // durable create candidate remains safe to continue.
            }
            if (
                signal.aborted ||
                !isMountedRef.current ||
                authUserIdRef.current !== requestAuthUserId
            ) {
                return false;
            }

            try {
                await veraApi.createSession(
                    { session_id: operation.newSessionId },
                    signal,
                );
            } catch (createError) {
                if (
                    signal.aborted ||
                    !isMountedRef.current ||
                    authUserIdRef.current !== requestAuthUserId
                ) {
                    return false;
                }
                if (
                    createError instanceof ApiRequestError &&
                    (createError.status === 403 ||
                        createError.status === 409)
                ) {
                    // A random-ID collision or a definitively rejected stale
                    // proof must not trap the already closed predecessor in
                    // an unretryable operation. Keep the boundary journal,
                    // but move its create candidate before the next retry.
                    storePendingNewDialog({
                        previousSessionId: operation.previousSessionId,
                        newSessionId: crypto.randomUUID(),
                    });
                }
                throw new VeraNewDialogOperationError(
                    "create",
                    createError,
                );
            }
            if (
                signal.aborted ||
                !isMountedRef.current ||
                authUserIdRef.current !== requestAuthUserId
            ) {
                return false;
            }
            if (!storeResolvedSession(operation.newSessionId, true)) {
                throw new Error("Не удалось сохранить новый диалог.");
            }

            preservePreviousSession(
                operation.previousSessionId,
                previousMessages,
                previousHistoryCursor,
            );
            messagesRevisionRef.current += 1;
            olderHistoryControllerRef.current?.abort();
            olderHistoryControllerRef.current = null;
            olderPreviousHistoryControllerRef.current?.abort();
            olderPreviousHistoryControllerRef.current = null;
            setMessages([]);
            setHistoryCursor(null);
            setIsOlderHistoryLoading(false);
            setOlderPreviousHistorySessionId(null);
            setIsHistoryLoading(false);
            setHistoryError(null);
            setStatus("idle");
            stopWaitingHints();
            deliveryStateRef.current = "draft";
            setDeliveryState("draft");
            setError(null);
            setAnnouncement(
                "Начат новый диалог. Контекст предыдущего диалога завершён.",
            );
            if (
                !clearSessionReplacementId(
                    operation.previousSessionId,
                    operation.newSessionId,
                )
            ) {
                setHasPendingNewDialog(true);
                throw new Error(
                    "Новый диалог создан, но проверку операции не удалось завершить. Повторите действие.",
                );
            }
            if (!clearPendingNewDialog(operation)) {
                setHasPendingNewDialog(true);
                throw new Error(
                    "Новый диалог создан, но завершение операции не удалось сохранить. Повторите действие.",
                );
            }
            setHasPendingNewDialog(false);
            return true;
        },
        [
            preservePreviousSession,
            stopWaitingHints,
            storeResolvedSession,
        ],
    );

    const completeExpiredNewDialogBoundary = useCallback(
        ({
            operation,
            previousMessages,
            previousHistoryCursor,
        }: {
            operation: VeraPendingNewDialog;
            previousMessages: VeraChatMessage[];
            previousHistoryCursor: number | null;
        }): boolean => {
            if (!storeResolvedSession(operation.newSessionId, true)) {
                throw new Error("Не удалось сохранить новый диалог.");
            }
            preservePreviousSession(
                operation.previousSessionId,
                previousMessages,
                previousHistoryCursor,
            );
            messagesRevisionRef.current += 1;
            olderHistoryControllerRef.current?.abort();
            olderHistoryControllerRef.current = null;
            olderPreviousHistoryControllerRef.current?.abort();
            olderPreviousHistoryControllerRef.current = null;
            setMessages([]);
            setHistoryCursor(null);
            setIsOlderHistoryLoading(false);
            setOlderPreviousHistorySessionId(null);
            setIsHistoryLoading(false);
            setHistoryError(null);
            setStatus("idle");
            stopWaitingHints();
            deliveryStateRef.current = "draft";
            setDeliveryState("draft");
            setError(null);
            setAnnouncement(
                "Начат новый диалог. Контекст предыдущего диалога завершён.",
            );
            if (
                !clearSessionReplacementId(
                    operation.previousSessionId,
                    operation.newSessionId,
                )
            ) {
                setHasPendingNewDialog(true);
                throw new Error(
                    "Новый диалог создан, но проверку операции не удалось завершить. Повторите действие.",
                );
            }
            if (!clearPendingNewDialog(operation)) {
                setHasPendingNewDialog(true);
                throw new Error(
                    "Новый диалог создан, но завершение операции не удалось сохранить. Повторите действие.",
                );
            }
            setHasPendingNewDialog(false);
            return true;
        },
        [preservePreviousSession, stopWaitingHints, storeResolvedSession],
    );

    const abandonRejectedLifecycleOperation = useCallback(
        async ({
            doomedSessionId,
            doomedReplacementSessionId,
            pendingRequest,
            previousMessages,
            previousHistoryCursor,
            rejectionStatus,
            pendingNewDialogOperation,
            requestAuthUserId,
            signal,
        }: {
            doomedSessionId: string;
            doomedReplacementSessionId: string;
            pendingRequest: VeraPendingRequest | null;
            previousMessages: VeraChatMessage[];
            previousHistoryCursor: number | null;
            rejectionStatus: 403 | 409;
            pendingNewDialogOperation?: VeraPendingNewDialog;
            requestAuthUserId: string | null;
            signal?: AbortSignal;
        }): Promise<boolean> => {
            const isRecoveryRequestActive = () =>
                !signal?.aborted &&
                isMountedRef.current &&
                authUserIdRef.current === requestAuthUserId;
            if (!isRecoveryRequestActive()) return false;
            // A foreign 403 discards owner-scoped UI immediately. A same-owner
            // 409 keeps its recovery context until a fresh session is durable.
            // If current lookup, storage, or the bounded resolve fails, the
            // operation journal remains available for an exact retry.
            const requestToArchive =
                pendingRequest ?? readStoredPendingRequest();

            const recoveryAuthUserId = requestAuthUserId;
            let durablePendingNewDialogOperation = pendingNewDialogOperation;
            const resumesPendingOwnerRecovery = Boolean(
                pendingNewDialogOperation?.ownerRecoverySessionId &&
                    pendingNewDialogOperation.ownerRecoveryReplacementSessionId,
            );
            let recoverySessionId: string | null =
                pendingNewDialogOperation?.ownerRecoverySessionId ?? null;
            let freshReplacementSessionId =
                pendingNewDialogOperation?.ownerRecoveryReplacementSessionId ??
                null;
            let effectiveRejectionStatus: 403 | 409 = rejectionStatus;
            let isForeignOwnerRejection =
                effectiveRejectionStatus === 403;
            if (
                durablePendingNewDialogOperation
                    ?.ownerRecoveryPredecessorUnverified &&
                effectiveRejectionStatus === 409
            ) {
                // The marker is already durable. Keep the original 409 policy so
                // a later successful predecessor-history read can revalidate it,
                // but treat this attempt as foreign until that happens. No
                // recovery-session response can establish predecessor ownership.
                effectiveRejectionStatus = 403;
                isForeignOwnerRejection = true;
            }
            const durableRecoveryRejectionStatus = () =>
                rejectionStatus === 409 &&
                durablePendingNewDialogOperation
                    ?.ownerRecoveryPredecessorUnverified
                    ? 409
                    : effectiveRejectionStatus;
            const settleTerminalRejectedRecovery = (
                terminalOperation: VeraPendingNewDialog,
                usableLocalSessionId: string,
                rejectedRecoverySessionId: string,
                rejectedReplacementSessionId: string,
                reportsCompletion = false,
            ): boolean => {
                let cleanupOperation = terminalOperation;
                if (
                    terminalOperation.ownerRecoveryUsableSessionId !==
                    usableLocalSessionId
                ) {
                    cleanupOperation = {
                        ...terminalOperation,
                        ownerRecoveryUsableSessionId: usableLocalSessionId,
                    };
                    if (!storePendingNewDialog(cleanupOperation)) {
                        setHasPendingNewDialog(true);
                        return false;
                    }
                }
                if (isForeignOwnerRejection) {
                    if (
                        !clearSessionReplacementId(
                            rejectedRecoverySessionId,
                            rejectedReplacementSessionId,
                        )
                    ) {
                        setHasPendingNewDialog(true);
                        return false;
                    }
                    if (!discardForeignOwnerArtifacts(true)) return false;
                    if (!storeResolvedSession(usableLocalSessionId, true)) {
                        return false;
                    }
                    if (!clearPendingNewDialog(cleanupOperation)) {
                        setHasPendingNewDialog(true);
                        return false;
                    }
                } else {
                    if (!storeResolvedSession(usableLocalSessionId, true)) {
                        return false;
                    }
                    if (
                        !clearSessionReplacementId(
                            rejectedRecoverySessionId,
                            rejectedReplacementSessionId,
                        )
                    ) {
                        setHasPendingNewDialog(true);
                        return false;
                    }
                    const archivedSessionId =
                        requestToArchive?.sessionId ?? doomedSessionId;
                    preservePreviousSession(
                        archivedSessionId,
                        requestToArchive
                            ? pendingRequestToAbandonedMessages(requestToArchive)
                            : previousMessages,
                        previousHistoryCursor,
                    );
                    olderHistoryControllerRef.current?.abort();
                    olderHistoryControllerRef.current = null;
                    setIsOlderHistoryLoading(false);
                    setHistoryCursor(null);
                    setMessages([]);
                    if (requestToArchive) {
                        clearPendingRequest(requestToArchive.requestId);
                    }
                    if (!clearPendingNewDialog(cleanupOperation)) {
                        setHasPendingNewDialog(true);
                        return false;
                    }
                }
                setHasPendingNewDialog(false);
                setStatus("idle");
                stopWaitingHints();
                deliveryStateRef.current = "draft";
                setDeliveryState("draft");
                setAnnouncement("");
                return reportsCompletion;
            };
            if (
                durablePendingNewDialogOperation?.ownerRecoveryUsableSessionId &&
                recoverySessionId &&
                freshReplacementSessionId
            ) {
                return settleTerminalRejectedRecovery(
                    durablePendingNewDialogOperation,
                    durablePendingNewDialogOperation
                        .ownerRecoveryUsableSessionId,
                    recoverySessionId,
                    freshReplacementSessionId,
                    true,
                );
            }
            if (
                isForeignOwnerRejection &&
                resumesPendingOwnerRecovery &&
                !discardForeignOwnerArtifacts(true)
            ) {
                return false;
            }
            if (isForeignOwnerRejection && !resumesPendingOwnerRecovery) {
                if (
                    !discardForeignOwnerArtifacts(
                        pendingNewDialogOperation !== undefined,
                    )
                ) {
                    return false;
                }
                let currentSession: VeraCurrentChatSessionResponse;
                try {
                    currentSession = await veraApi.getCurrentSession(signal);
                } catch {
                    return false;
                }
                if (
                    signal?.aborted ||
                    !isMountedRef.current ||
                    authUserIdRef.current !== recoveryAuthUserId
                ) {
                    return false;
                }
                if (
                    currentSession.session_id !== doomedSessionId &&
                    currentSession.session_id !== doomedReplacementSessionId
                ) {
                    recoverySessionId = currentSession.session_id;
                }
            } else if (
                !resumesPendingOwnerRecovery &&
                recoveryAuthUserId !== null
            ) {
                let currentSession: VeraCurrentChatSessionResponse;
                try {
                    currentSession = await veraApi.getCurrentSession(signal);
                } catch {
                    return false;
                }
                if (
                    signal?.aborted ||
                    !isMountedRef.current ||
                    authUserIdRef.current !== recoveryAuthUserId
                ) {
                    return false;
                }
                if (
                    currentSession.session_id === doomedSessionId ||
                    currentSession.session_id === doomedReplacementSessionId
                ) {
                    recoverySessionId = currentSession.session_id;
                }
            }

            if (recoverySessionId === null) {
                try {
                    recoverySessionId = isForeignOwnerRejection
                        ? crypto.randomUUID()
                        : resetSessionId();
                } catch {
                    return false;
                }
            }
            if (!freshReplacementSessionId) {
                freshReplacementSessionId = crypto.randomUUID();
            }
            if (
                pendingNewDialogOperation &&
                !resumesPendingOwnerRecovery
            ) {
                durablePendingNewDialogOperation = {
                    ...pendingNewDialogOperation,
                    ownerRecoverySessionId: recoverySessionId,
                    ownerRecoveryReplacementSessionId:
                        freshReplacementSessionId,
                    ownerRecoveryRejectionStatus:
                        durableRecoveryRejectionStatus(),
                };
                if (
                    !storePendingNewDialog(durablePendingNewDialogOperation)
                ) {
                    return false;
                }
                setHasPendingNewDialog(true);
            }
            const prepareAuthoritativeRecoveryPair = async () => {
                if (!durablePendingNewDialogOperation) return false;
                let authoritativeCurrent: VeraCurrentChatSessionResponse;
                try {
                    authoritativeCurrent =
                        await veraApi.getCurrentSession(signal);
                } catch {
                    return false;
                }
                if (!isRecoveryRequestActive()) return false;

                let authoritativeSessionId: string;
                let authoritativeReplacementSessionId: string;
                try {
                    authoritativeSessionId =
                        authoritativeCurrent.session_id ?? crypto.randomUUID();
                    authoritativeReplacementSessionId = crypto.randomUUID();
                } catch {
                    return false;
                }
                const terminalOperation: VeraPendingNewDialog = {
                    ...durablePendingNewDialogOperation,
                    ownerRecoverySessionId: authoritativeSessionId,
                    ownerRecoveryReplacementSessionId:
                        authoritativeReplacementSessionId,
                    ownerRecoveryRejectionStatus:
                        durableRecoveryRejectionStatus(),
                    ownerRecoveryNeedsRebase: false,
                    ownerRecoveryTerminalAttempt: true,
                };
                if (
                    !storePendingNewDialog(terminalOperation) ||
                    !storeSessionId(authoritativeSessionId) ||
                    !storeSessionReplacementId(
                        authoritativeSessionId,
                        authoritativeReplacementSessionId,
                    )
                ) {
                    return false;
                }
                durablePendingNewDialogOperation = terminalOperation;
                recoverySessionId = authoritativeSessionId;
                freshReplacementSessionId =
                    authoritativeReplacementSessionId;
                return true;
            };

            if (durablePendingNewDialogOperation?.ownerRecoveryNeedsRebase) {
                if (!(await prepareAuthoritativeRecoveryPair())) return false;
            } else if (
                !storeSessionId(recoverySessionId) ||
                !storeSessionReplacementId(
                    recoverySessionId,
                    freshReplacementSessionId,
                )
            ) {
                return false;
            }

            let resolution: VeraChatSessionResolveResponse;
            while (true) {
                try {
                    resolution = await veraApi.resolveSession(
                        {
                            session_id: recoverySessionId,
                            replacement_session_id:
                                freshReplacementSessionId,
                        },
                        signal,
                    );
                    break;
                } catch (recoveryError) {
                    const isDefiniteNestedRejection =
                        recoveryError instanceof ApiRequestError &&
                        (recoveryError.status === 403 ||
                            recoveryError.status === 409);
                    if (
                        !isDefiniteNestedRejection ||
                        !durablePendingNewDialogOperation ||
                        !isRecoveryRequestActive()
                    ) {
                        return false;
                    }

                    if (
                        durablePendingNewDialogOperation
                            .ownerRecoveryTerminalAttempt
                    ) {
                        let usableLocalSessionId: string;
                        try {
                            usableLocalSessionId = crypto.randomUUID();
                        } catch {
                            return false;
                        }
                        return settleTerminalRejectedRecovery(
                            durablePendingNewDialogOperation,
                            usableLocalSessionId,
                            recoverySessionId,
                            freshReplacementSessionId,
                        );
                    }

                    durablePendingNewDialogOperation = {
                        ...durablePendingNewDialogOperation,
                        ownerRecoveryRejectionStatus:
                            durableRecoveryRejectionStatus(),
                        ownerRecoveryNeedsRebase: true,
                    };
                    if (
                        !storePendingNewDialog(
                            durablePendingNewDialogOperation,
                        ) ||
                        !clearSessionReplacementId(
                            recoverySessionId,
                            freshReplacementSessionId,
                        )
                    ) {
                        return false;
                    }
                    if (
                        isForeignOwnerRejection &&
                        !discardForeignOwnerArtifacts(true)
                    ) {
                        return false;
                    }
                    if (!(await prepareAuthoritativeRecoveryPair())) {
                        return false;
                    }
                }
            }
            if (!isRecoveryRequestActive()) return false;

            if (isForeignOwnerRejection) {
                if (
                    !clearSessionReplacementId(
                        recoverySessionId,
                        freshReplacementSessionId,
                    ) ||
                    !discardForeignOwnerArtifacts(
                        durablePendingNewDialogOperation !== undefined,
                    ) ||
                    !storeResolvedSession(resolution.session_id, true)
                ) {
                    if (durablePendingNewDialogOperation) {
                        setHasPendingNewDialog(true);
                    }
                    return false;
                }
                if (
                    durablePendingNewDialogOperation &&
                    !clearPendingNewDialog(
                        durablePendingNewDialogOperation,
                    )
                ) {
                    setHasPendingNewDialog(true);
                    return false;
                }
                setHasPendingNewDialog(false);
                return true;
            }
            if (!storeResolvedSession(resolution.session_id, true)) {
                return false;
            }
            if (
                !clearSessionReplacementId(
                    recoverySessionId,
                    freshReplacementSessionId,
                )
            ) {
                if (durablePendingNewDialogOperation) {
                    setHasPendingNewDialog(true);
                }
                return false;
            }
            const archivedSessionId =
                requestToArchive?.sessionId ?? doomedSessionId;
            preservePreviousSession(
                archivedSessionId,
                requestToArchive
                    ? pendingRequestToAbandonedMessages(requestToArchive)
                    : previousMessages,
                previousHistoryCursor,
            );
            olderHistoryControllerRef.current?.abort();
            olderHistoryControllerRef.current = null;
            setIsOlderHistoryLoading(false);
            setHistoryCursor(null);
            setMessages([]);
            if (requestToArchive) {
                clearPendingRequest(requestToArchive.requestId);
            }
            if (
                durablePendingNewDialogOperation &&
                !clearPendingNewDialog(durablePendingNewDialogOperation)
            ) {
                setHasPendingNewDialog(true);
                return false;
            }
            if (durablePendingNewDialogOperation) {
                setHasPendingNewDialog(false);
            }
            return true;
        },
        [
            discardForeignOwnerArtifacts,
            preservePreviousSession,
            stopWaitingHints,
            storeResolvedSession,
        ],
    );

    const runPendingNewDialogOperation = useCallback(
        async ({
            operation,
            fallbackPreviousMessages,
            fallbackPreviousHistoryCursor,
            signal,
            requestAuthUserId,
        }: {
            operation: VeraPendingNewDialog;
            fallbackPreviousMessages: VeraChatMessage[];
            fallbackPreviousHistoryCursor: number | null;
            signal: AbortSignal;
            requestAuthUserId: string | null;
        }): Promise<boolean> => {
            const assertRequestStillActive = () =>
                !signal.aborted &&
                isMountedRef.current &&
                authUserIdRef.current === requestAuthUserId;
            const exposePendingRetrySession = () => {
                const retryOperation = readPendingNewDialog();
                const retrySessionId =
                    retryOperation?.ownerRecoveryUsableSessionId ??
                    retryOperation?.previousSessionId ??
                    readStoredSessionId();
                if (retrySessionId) {
                    sessionIdRef.current = retrySessionId;
                    controlledSessionTransitionRef.current = retrySessionId;
                    setSessionId(retrySessionId);
                }
            };

            if (!assertRequestStillActive()) return false;
            if (
                operation.ownerRecoverySessionId &&
                operation.ownerRecoveryReplacementSessionId
            ) {
                let recoveryOperation = operation;
                let recoveryRejectionStatus =
                    operation.ownerRecoveryRejectionStatus ?? 403;
                let recoveryPreviousMessages = fallbackPreviousMessages;
                let recoveryPreviousHistoryCursor =
                    fallbackPreviousHistoryCursor;
                if (recoveryRejectionStatus === 409) {
                    try {
                        const previousHistory = await veraApi.getHistory(
                            operation.previousSessionId,
                            { signal },
                        );
                        recoveryPreviousMessages =
                            historyToMessages(previousHistory);
                        recoveryPreviousHistoryCursor =
                            previousHistory.next_before_sequence ?? null;
                        if (
                            operation.ownerRecoveryPredecessorUnverified
                        ) {
                            recoveryOperation = { ...operation };
                            delete recoveryOperation.ownerRecoveryPredecessorUnverified;
                        }
                    } catch (historyLoadError) {
                        if (
                            historyLoadError instanceof ApiRequestError &&
                            historyLoadError.status === 404
                        ) {
                            recoveryPreviousMessages = [];
                            recoveryPreviousHistoryCursor = null;
                            recoveryOperation = {
                                ...operation,
                                ownerRecoveryPredecessorUnverified: true,
                            };
                        } else if (
                            historyLoadError instanceof ApiRequestError &&
                            historyLoadError.status === 403
                        ) {
                            recoveryRejectionStatus = 403;
                            recoveryPreviousMessages = [];
                            recoveryPreviousHistoryCursor = null;
                            recoveryOperation = {
                                previousSessionId: operation.previousSessionId,
                                newSessionId: operation.newSessionId,
                                resolve403Rekeyed: true,
                            };
                        } else if (
                            historyLoadError instanceof ApiRequestError &&
                            (historyLoadError.status === 401 ||
                                historyLoadError.status === 503)
                        ) {
                            recoveryOperation = {
                                ...operation,
                                ownerRecoveryPredecessorUnverified: true,
                            };
                        } else {
                            throw new VeraNewDialogOperationError(
                                "history",
                                historyLoadError,
                            );
                        }
                    }
                    if (!assertRequestStillActive()) return false;
                    if (
                        recoveryOperation !== operation &&
                        !storePendingNewDialog(recoveryOperation)
                    ) {
                        throw new Error(
                            recoveryRejectionStatus === 403
                                ? "Не удалось сохранить смену владельца диалога."
                                : "Не удалось сохранить проверку истории диалога.",
                        );
                    }
                }
                const recovered = await abandonRejectedLifecycleOperation({
                    doomedSessionId: operation.previousSessionId,
                    doomedReplacementSessionId: operation.newSessionId,
                    pendingRequest: null,
                    previousMessages: recoveryPreviousMessages,
                    previousHistoryCursor: recoveryPreviousHistoryCursor,
                    rejectionStatus: recoveryRejectionStatus,
                    pendingNewDialogOperation: recoveryOperation,
                    requestAuthUserId,
                    signal,
                });
                if (!assertRequestStillActive()) return false;
                if (recovered) {
                    setHistoryError(null);
                    setError(null);
                    setAnnouncement("Начат новый диалог.");
                    return true;
                }
                exposePendingRetrySession();
                throw new Error(
                    "Не удалось завершить восстановление нового владельца диалога.",
                );
            }

            const executeOperation = async (
                candidateOperation: VeraPendingNewDialog,
            ): Promise<boolean> => {
                if (
                    !storeSessionReplacementId(
                        candidateOperation.previousSessionId,
                        candidateOperation.newSessionId,
                    )
                ) {
                    throw new Error(
                        "Не удалось сохранить проверку нового диалога.",
                    );
                }

                let resolution: VeraChatSessionResolveResponse;
                try {
                    resolution = await veraApi.resolveSession(
                        {
                            session_id: candidateOperation.previousSessionId,
                            replacement_session_id:
                                candidateOperation.newSessionId,
                        },
                        signal,
                    );
                } catch (resolveError) {
                    throw new VeraNewDialogOperationError(
                        "resolve",
                        resolveError,
                    );
                }
                if (!assertRequestStillActive()) return false;

                let previousMessages = fallbackPreviousMessages;
                let previousHistoryCursor = fallbackPreviousHistoryCursor;
                try {
                    const previousHistory = await veraApi.getHistory(
                        candidateOperation.previousSessionId,
                        { signal },
                    );
                    const loadedMessages = historyToMessages(previousHistory);
                    if (
                        loadedMessages.length > 0 ||
                        previousMessages.length === 0
                    ) {
                        previousMessages = loadedMessages;
                    }
                    previousHistoryCursor =
                        previousHistory.next_before_sequence ??
                        previousHistoryCursor;
                } catch (historyLoadError) {
                    if (
                        !(
                            historyLoadError instanceof ApiRequestError &&
                            historyLoadError.status === 404
                        )
                    ) {
                        throw new VeraNewDialogOperationError(
                            "history",
                            historyLoadError,
                        );
                    }
                    if (previousMessages.length === 0) {
                        previousHistoryCursor = null;
                    }
                }
                if (!assertRequestStillActive()) return false;

                if (
                    resolution.boundary === "expired" &&
                    resolution.previous_session_id ===
                        candidateOperation.previousSessionId
                ) {
                    return completeExpiredNewDialogBoundary({
                        operation: candidateOperation,
                        previousMessages,
                        previousHistoryCursor,
                    });
                }

                if (
                    !storeResolvedSession(
                        resolution.session_id,
                        true,
                    )
                ) {
                    throw new Error("Не удалось сохранить активный диалог.");
                }
                if (
                    !clearSessionReplacementId(
                        candidateOperation.previousSessionId,
                        candidateOperation.newSessionId,
                    )
                ) {
                    throw new Error(
                        "Не удалось завершить проверку нового диалога.",
                    );
                }
                return await completeNewDialogOperation({
                    operation: candidateOperation,
                    previousMessages,
                    previousHistoryCursor,
                    signal,
                    requestAuthUserId,
                });
            };

            let activeOperation = operation;
            let operationError: unknown;
            try {
                return await executeOperation(activeOperation);
            } catch (error) {
                operationError = error;
            }
            if (!assertRequestStillActive()) return false;

            let originalOperationError =
                unwrapNewDialogOperationError(operationError);
            const shouldRekeyLostAnonymousSuccessor =
                operationError instanceof VeraNewDialogOperationError &&
                operationError.phase === "resolve" &&
                originalOperationError instanceof ApiRequestError &&
                originalOperationError.status === 403 &&
                !activeOperation.resolve403Rekeyed;
            if (shouldRekeyLostAnonymousSuccessor) {
                clearSessionReplacementId(
                    activeOperation.previousSessionId,
                    activeOperation.newSessionId,
                );
                activeOperation = {
                    previousSessionId: activeOperation.previousSessionId,
                    newSessionId: crypto.randomUUID(),
                    resolve403Rekeyed: true,
                };
                if (!storePendingNewDialog(activeOperation)) {
                    throw new Error(
                        "Не удалось сохранить повтор нового диалога.",
                    );
                }
                setHasPendingNewDialog(true);
                try {
                    return await executeOperation(activeOperation);
                } catch (error) {
                    operationError = error;
                    originalOperationError =
                        unwrapNewDialogOperationError(error);
                }
                if (!assertRequestStillActive()) return false;
            }

            const rejectedStatus =
                originalOperationError instanceof ApiRequestError &&
                (originalOperationError.status === 403 ||
                    originalOperationError.status === 409)
                    ? originalOperationError.status === 403
                        ? 403
                        : 409
                    : null;
            const canRecoverRejectedPredecessor =
                operationError instanceof VeraNewDialogOperationError &&
                ((rejectedStatus === 403 &&
                    (operationError.phase === "resolve" ||
                        operationError.phase === "history" ||
                        operationError.phase === "close")) ||
                    (rejectedStatus === 409 &&
                        operationError.phase === "resolve"));
            if (!canRecoverRejectedPredecessor || !rejectedStatus) {
                throw operationError;
            }

            let recoveryRejectionStatus: 403 | 409 = rejectedStatus;
            let recoveryPreviousMessages = fallbackPreviousMessages;
            let recoveryPreviousHistoryCursor =
                fallbackPreviousHistoryCursor;
            if (
                rejectedStatus === 409 &&
                operationError instanceof VeraNewDialogOperationError &&
                operationError.phase === "resolve"
            ) {
                try {
                    const previousHistory = await veraApi.getHistory(
                        activeOperation.previousSessionId,
                        { signal },
                    );
                    recoveryPreviousMessages =
                        historyToMessages(previousHistory);
                    recoveryPreviousHistoryCursor =
                        previousHistory.next_before_sequence ?? null;
                } catch (historyLoadError) {
                    if (
                        historyLoadError instanceof ApiRequestError &&
                        historyLoadError.status === 404
                    ) {
                        recoveryPreviousMessages = [];
                        recoveryPreviousHistoryCursor = null;
                    } else if (
                        historyLoadError instanceof ApiRequestError &&
                        historyLoadError.status === 403
                    ) {
                        recoveryRejectionStatus = 403;
                        recoveryPreviousMessages = [];
                        recoveryPreviousHistoryCursor = null;
                    } else if (
                        historyLoadError instanceof ApiRequestError &&
                        (historyLoadError.status === 401 ||
                            historyLoadError.status === 503)
                    ) {
                        // Lifecycle already proved this is a same-owner 409.
                        // Strict history can still reject an expired anonymous
                        // proof, so retain the best local snapshot and recover.
                    } else {
                        throw new VeraNewDialogOperationError(
                            "history",
                            historyLoadError,
                        );
                    }
                }
                if (!assertRequestStillActive()) return false;
            }

            if (!assertRequestStillActive()) return false;
            const recovered = await abandonRejectedLifecycleOperation({
                doomedSessionId: activeOperation.previousSessionId,
                doomedReplacementSessionId: activeOperation.newSessionId,
                pendingRequest: null,
                previousMessages: recoveryPreviousMessages,
                previousHistoryCursor: recoveryPreviousHistoryCursor,
                rejectionStatus: recoveryRejectionStatus,
                pendingNewDialogOperation: activeOperation,
                requestAuthUserId,
                signal,
            });
            if (!assertRequestStillActive()) return false;
            if (recovered) {
                setHistoryError(null);
                setError(null);
                setAnnouncement("Начат новый диалог.");
                return true;
            }

            exposePendingRetrySession();
            throw originalOperationError;
        },
        [
            abandonRejectedLifecycleOperation,
            completeExpiredNewDialogBoundary,
            completeNewDialogOperation,
            storeResolvedSession,
        ],
    );

    const transitionDeliveryState = useCallback(
        (nextState: VeraDeliveryState) => {
            if (DELIVERY_STATES_ENDING_WAIT.has(nextState)) {
                stopWaitingHints();
            }
            const currentState = deliveryStateRef.current;
            if (currentState === nextState) return;
            if (!canTransitionDeliveryState(currentState, nextState)) {
                return;
            }
            deliveryStateRef.current = nextState;
            setDeliveryState(nextState);
        },
        [stopWaitingHints],
    );

    const restoreDeliveryState = useCallback(
        (nextState: VeraDeliveryState) => {
            if (DELIVERY_STATES_ENDING_WAIT.has(nextState)) {
                stopWaitingHints();
            }
            deliveryStateRef.current = nextState;
            setDeliveryState(nextState);
        },
        [stopWaitingHints],
    );

    const applyBufferedTokens = useCallback(() => {
        const buffered = tokenBufferRef.current;
        tokenBufferRef.current = null;
        if (!buffered?.content) return;

        setMessages((prev) =>
            prev.map((message) =>
                message.id === buffered.messageId
                    ? {
                          ...message,
                          content: message.content + buffered.content,
                      }
                    : message,
            ),
        );
    }, []);

    const clearBufferedTokens = useCallback(() => {
        if (tokenFrameRef.current !== null) {
            cancelAnimationFrame(tokenFrameRef.current);
            tokenFrameRef.current = null;
        }
        tokenBufferRef.current = null;
    }, []);

    const flushBufferedTokens = useCallback(() => {
        if (tokenFrameRef.current !== null) {
            cancelAnimationFrame(tokenFrameRef.current);
            tokenFrameRef.current = null;
        }
        applyBufferedTokens();
    }, [applyBufferedTokens]);

    const bufferToken = useCallback(
        (messageId: string, content: string) => {
            const buffered = tokenBufferRef.current;
            if (buffered && buffered.messageId !== messageId) {
                flushBufferedTokens();
            }

            const current = tokenBufferRef.current;
            tokenBufferRef.current = {
                messageId,
                content:
                    current?.messageId === messageId
                        ? current.content + content
                        : content,
            };

            if (tokenFrameRef.current === null) {
                tokenFrameRef.current = requestAnimationFrame(() => {
                    tokenFrameRef.current = null;
                    applyBufferedTokens();
                });
            }
        },
        [applyBufferedTokens, flushBufferedTokens],
    );

    const closeStream = useCallback(() => {
        // Обязательное явное закрытие: EventSource по умолчанию сам
        // переподключается при разрыве соединения сервером, а сервер
        // (vera_agent_service) держит только один активный SSE-коннект на
        // запрос — молчаливый реконнект создал бы гонку за уже закрытую
        // на сервере подписку.
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        for (const timerRef of [
            firstEventTimeoutRef,
            inactivityTimeoutRef,
            overallTimeoutRef,
        ]) {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
    }, []);

    const markAssistantOutcomeUnknown = useCallback((messageId: string) => {
        setMessages((prev) =>
            prev.map((message) =>
                message.id === messageId
                    ? {
                          ...message,
                          streaming: false,
                          feedbackEligible: false,
                          deliveryState: "unknown",
                      }
                    : message,
            ),
        );
    }, []);

    const reconcileAmbiguousPublication = useCallback(
        async ({
            requestStartedAt,
            requestId,
            message,
            userMessageId,
            assistantMessageId,
            restoreMessagesFromHistory = false,
            sessionIdOverride,
            lifecycleJournal,
        }: {
            requestStartedAt: number;
            requestId: string;
            message: string;
            userMessageId: string;
            assistantMessageId: string;
            restoreMessagesFromHistory?: boolean;
            sessionIdOverride?: string;
            lifecycleJournal?: VeraPendingSessionResolution;
        }): Promise<VeraSendMessageResult> => {
            const reconciliationSessionId =
                sessionIdOverride ?? sessionIdRef.current;
            const controller = new AbortController();
            reconciliationControllerRef.current?.abort();
            reconciliationControllerRef.current = controller;
            const reconciliationStartedAt = Date.now();
            let requestWasFound = false;

            const finishAsUnknown = (): VeraSendMessageResult => {
                if (!isMountedRef.current || controller.signal.aborted) {
                    return { outcome: "unknown", restoreDraft: false };
                }
                transitionDeliveryState("unknown");
                markAssistantOutcomeUnknown(assistantMessageId);
                setStatus("unavailable");
                setAnnouncement("");
                setError(
                    "Не удалось подтвердить результат отправки. Ответ может появиться в истории после обновления страницы.",
                );
                return { outcome: "unknown", restoreDraft: false };
            };

            try {
                while (isMountedRef.current && !controller.signal.aborted) {
                    let history: VeraChatHistoryResponse | null = null;
                    try {
                        history = await veraApi.getHistory(
                            reconciliationSessionId,
                            { signal: controller.signal },
                        );
                    } catch (historyLookupError) {
                        if (controller.signal.aborted) {
                            return {
                                outcome: "unknown",
                                restoreDraft: false,
                            };
                        }
                        if (
                            historyLookupError instanceof ApiRequestError &&
                            (historyLookupError.status === 401 ||
                                historyLookupError.status === 403)
                        ) {
                            clearPendingRequest(requestId);
                            if (lifecycleJournal) {
                                clearSessionReplacementId(
                                    lifecycleJournal.sessionId,
                                    lifecycleJournal.replacementSessionId,
                                );
                            }
                            activeRequestIdRef.current = null;
                            transitionDeliveryState("failed");
                            markAssistantOutcomeUnknown(assistantMessageId);
                            setStatus("idle");
                            setAnnouncement("");
                            setError(
                                "Сессия чата обновлена. Статус предыдущего сообщения проверить невозможно.",
                            );
                            setSessionId(resetSessionId());
                            return {
                                outcome: "unknown",
                                restoreDraft: false,
                            };
                        }
                    }

                    if (!isMountedRef.current || controller.signal.aborted) {
                        return { outcome: "unknown", restoreDraft: false };
                    }

                    const turn = history?.turns.find(
                        (candidate) => candidate.request_id === requestId,
                    );
                    if (restoreMessagesFromHistory && history) {
                        const restoredMessages = historyToMessages(history);
                        const restoredIds = new Set(
                            restoredMessages.map((restored) => restored.id),
                        );
                        const pendingMessages = pendingRequestToMessages({
                            sessionId: reconciliationSessionId,
                            requestId,
                            message,
                            createdAt: requestStartedAt,
                        });
                        setMessages([
                            ...restoredMessages,
                            ...pendingMessages.filter(
                                (pending) => !restoredIds.has(pending.id),
                            ),
                        ]);
                        setHistoryCursor(
                            history.next_before_sequence ?? null,
                        );
                    }
                    if (turn) {
                        if (!requestWasFound) {
                            requestWasFound = true;
                            transitionDeliveryState("accepted");
                            transitionDeliveryState("processing");
                        }

                        const turnDeliveryState =
                            historyStatusToDeliveryState(turn.status);
                        const isProcessing =
                            turnDeliveryState === "processing";
                        const isCompleted =
                            turnDeliveryState === "completed";

                        setMessages((prev) =>
                            prev.map((message) => {
                                if (message.id === userMessageId) {
                                    return {
                                        ...message,
                                        deliveryStatus: "sent",
                                    };
                                }
                                if (message.id !== assistantMessageId) {
                                    return message;
                                }
                                return {
                                    ...message,
                                    content: turn.answer ?? message.content,
                                    streaming: isProcessing,
                                    feedbackEligible:
                                        isCompleted && Boolean(turn.answer),
                                    feedbackValue:
                                        turn.feedback_value ?? undefined,
                                    deliveryState: turnDeliveryState,
                                };
                            }),
                        );

                        if (isCompleted) {
                            clearPendingRequest(requestId);
                            if (lifecycleJournal) {
                                clearSessionReplacementId(
                                    lifecycleJournal.sessionId,
                                    lifecycleJournal.replacementSessionId,
                                );
                            }
                            activeRequestIdRef.current = null;
                            transitionDeliveryState("completed");
                            setStatus("idle");
                            setAnnouncement("Ответ Ассистента Веры готов.");
                            setError(null);
                            return {
                                outcome: "accepted",
                                restoreDraft: false,
                            };
                        }

                        if (turnDeliveryState === "failed") {
                            clearPendingRequest(requestId);
                            if (lifecycleJournal) {
                                clearSessionReplacementId(
                                    lifecycleJournal.sessionId,
                                    lifecycleJournal.replacementSessionId,
                                );
                            }
                            activeRequestIdRef.current = null;
                            transitionDeliveryState("failed");
                            setStatus("idle");
                            setAnnouncement("");
                            setError(
                                "Ассистенту Вере не удалось подготовить ответ.",
                            );
                            return {
                                outcome: "accepted",
                                restoreDraft: false,
                            };
                        }

                        if (turnDeliveryState === "unknown") {
                            if (turn.status === "delivery_unconfirmed") {
                                clearPendingRequest(requestId);
                                if (lifecycleJournal) {
                                    clearSessionReplacementId(
                                        lifecycleJournal.sessionId,
                                        lifecycleJournal.replacementSessionId,
                                    );
                                }
                                activeRequestIdRef.current = null;
                            }
                            transitionDeliveryState("unknown");
                            setStatus("unavailable");
                            setAnnouncement("");
                            setError(
                                "Статус ответа пока неизвестен. Обновите страницу позже.",
                            );
                            return {
                                outcome: "accepted",
                                restoreDraft: false,
                            };
                        }

                        setStatus("waiting");
                    }

                    const now = Date.now();
                    const requestElapsed = now - requestStartedAt;
                    const reconciliationElapsed =
                        now - reconciliationStartedAt;
                    const lookupExpired =
                        !requestWasFound &&
                        reconciliationElapsed >=
                            POST_RECONCILIATION_LOOKUP_TIMEOUT_MS;
                    if (
                        lookupExpired ||
                        requestElapsed >= OVERALL_RESPONSE_DEADLINE_MS
                    ) {
                        return finishAsUnknown();
                    }

                    await waitForHistoryPoll(controller.signal);
                }

                return { outcome: "unknown", restoreDraft: false };
            } finally {
                if (reconciliationControllerRef.current === controller) {
                    reconciliationControllerRef.current = null;
                }
            }
        },
        [markAssistantOutcomeUnknown, transitionDeliveryState],
    );

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            newDialogControllerRef.current?.abort();
            newDialogControllerRef.current = null;
            sendResolveControllerRef.current?.abort();
            sendResolveControllerRef.current = null;
            postControllerRef.current?.abort();
            postControllerRef.current = null;
            reconciliationControllerRef.current?.abort();
            reconciliationControllerRef.current = null;
            olderHistoryControllerRef.current?.abort();
            olderHistoryControllerRef.current = null;
            olderPreviousHistoryControllerRef.current?.abort();
            olderPreviousHistoryControllerRef.current = null;
            activeRequestIdRef.current = null;
            closeStream();
            clearBufferedTokens();
            stopWaitingHints();
        };
    }, [clearBufferedTokens, closeStream, stopWaitingHints]);

    useEffect(() => {
        authUserIdRef.current = authUserId;
    }, [authUserId]);

    useEffect(() => {
        if (isAuthLoading) return;

        const previousAuthUserId = previousAuthUserIdRef.current;
        previousAuthUserIdRef.current = authUserId;
        const changedAuthenticatedIdentity =
            previousAuthUserId !== undefined &&
            previousAuthUserId !== null &&
            previousAuthUserId !== authUserId;
        if (!changedAuthenticatedIdentity) return;

        newDialogControllerRef.current?.abort();
        newDialogControllerRef.current = null;
        isStartingNewDialogRef.current = false;
        sendResolveControllerRef.current?.abort();
        sendResolveControllerRef.current = null;
        postControllerRef.current?.abort();
        postControllerRef.current = null;
        reconciliationControllerRef.current?.abort();
        reconciliationControllerRef.current = null;
        olderHistoryControllerRef.current?.abort();
        olderHistoryControllerRef.current = null;
        olderPreviousHistoryControllerRef.current?.abort();
        olderPreviousHistoryControllerRef.current = null;
        closeStream();
        clearBufferedTokens();
        activeRequestIdRef.current = null;
        stopWaitingHints();
        sessionIdRef.current = "";
        controlledSessionTransitionRef.current = null;
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        window.sessionStorage.removeItem(
            PENDING_SESSION_RESOLUTION_STORAGE_KEY,
        );
        window.sessionStorage.removeItem(PENDING_NEW_DIALOG_STORAGE_KEY);
        setSessionId("");
        setMessages([]);
        setPreviousSessionGroups([]);
        setHistoryCursor(null);
        setIsOlderHistoryLoading(false);
        setOlderPreviousHistorySessionId(null);
        setIsStartingNewDialog(false);
        setHasPendingNewDialog(false);
        setHistoryError(null);
        setError(null);
        setStatus("idle");
        setAnnouncement("");
        restoreDeliveryState("draft");
    }, [
        authUserId,
        clearBufferedTokens,
        closeStream,
        isAuthLoading,
        restoreDeliveryState,
        stopWaitingHints,
    ]);

    useEffect(() => {
        if (isAuthLoading) return;

        const controller = new AbortController();
        let cancelled = false;

        async function resolveCurrentSession() {
            setIsHistoryLoading(true);
            setHistoryError(null);
            const pendingNewDialog = readPendingNewDialog();
            if (pendingNewDialog) {
                setHasPendingNewDialog(true);
                isStartingNewDialogRef.current = true;
                setIsStartingNewDialog(true);
                newDialogControllerRef.current = controller;
                try {
                    await runPendingNewDialogOperation({
                        operation: pendingNewDialog,
                        fallbackPreviousMessages: [],
                        fallbackPreviousHistoryCursor: null,
                        signal: controller.signal,
                        requestAuthUserId: authUserIdRef.current,
                    });
                } catch (newDialogError) {
                    if (cancelled || controller.signal.aborted) return;
                    const originalNewDialogError =
                        unwrapNewDialogOperationError(newDialogError);
                    setHistoryError(
                        originalNewDialogError instanceof ApiRequestError
                            ? originalNewDialogError.detail
                            : "Не удалось завершить создание нового диалога. Попробуйте ещё раз.",
                    );
                } finally {
                    if (newDialogControllerRef.current === controller) {
                        newDialogControllerRef.current = null;
                        isStartingNewDialogRef.current = false;
                        if (!cancelled) setIsStartingNewDialog(false);
                    }
                }
                if (!cancelled) setIsHistoryLoading(false);
                return;
            }
            const pendingResolution = readPendingSessionResolution();
            const storedPendingRequest = readStoredPendingRequest();
            const abandonedPendingRequest =
                pendingResolution &&
                storedPendingRequest &&
                storedPendingRequest.requestId !==
                    pendingResolution.replacementSessionId
                    ? storedPendingRequest
                    : null;
            try {
                let currentSessionId: string | null = null;
                let usedLocalSessionCandidate = false;
                if (!pendingResolution) {
                    const localSessionId = readStoredSessionId();
                    if (localSessionId) {
                        // A visible local anonymous conversation remains the
                        // source of truth across null -> authenticated login.
                        // Agent start_turn performs the existing assignment;
                        // an older authenticated current session must not
                        // replace what the user is looking at.
                        currentSessionId = localSessionId;
                        usedLocalSessionCandidate = true;
                    } else {
                        const currentSession = await veraApi.getCurrentSession(
                            controller.signal,
                        );
                        if (cancelled) return;
                        currentSessionId = currentSession.session_id;
                    }
                }
                let requestedSessionId =
                    pendingResolution?.sessionId ??
                    currentSessionId ??
                    readOrCreateSessionId();
                let replacementSessionId =
                    readOrCreateSessionReplacementId(requestedSessionId);
                if (!replacementSessionId) {
                    throw new Error(
                        "Не удалось сохранить границу диалога.",
                    );
                }
                let discardedForeignLocalArtifacts = false;
                let resolution: VeraChatSessionResolveResponse;
                try {
                    resolution = await veraApi.resolveSession(
                        {
                            session_id: requestedSessionId,
                            replacement_session_id: replacementSessionId,
                        },
                        controller.signal,
                    );
                } catch (initialResolveError) {
                    if (
                        pendingResolution ||
                        !usedLocalSessionCandidate ||
                        !(initialResolveError instanceof ApiRequestError) ||
                        initialResolveError.status !== 403
                    ) {
                        throw initialResolveError;
                    }

                    // A stored ID can outlive the authenticated identity that
                    // owned it in an earlier mount. Only a definite foreign
                    // rejection permits one bounded server-current fallback;
                    // a normal null -> auth transition keeps the local chat.
                    const foreignSessionId = requestedSessionId;
                    const foreignReplacementSessionId = replacementSessionId;
                    if (!discardForeignOwnerArtifacts()) {
                        throw new Error(
                            "Не удалось очистить данные предыдущего владельца диалога.",
                        );
                    }
                    discardedForeignLocalArtifacts = true;
                    const fallbackCurrent =
                        await veraApi.getCurrentSession(controller.signal);
                    if (cancelled || controller.signal.aborted) return;
                    requestedSessionId =
                        fallbackCurrent.session_id !== foreignSessionId &&
                        fallbackCurrent.session_id !==
                            foreignReplacementSessionId
                            ? (fallbackCurrent.session_id ?? crypto.randomUUID())
                            : crypto.randomUUID();
                    replacementSessionId =
                        readOrCreateSessionReplacementId(requestedSessionId);
                    if (!replacementSessionId) {
                        throw new Error(
                            "Не удалось сохранить границу нового владельца диалога.",
                        );
                    }
                    resolution = await veraApi.resolveSession(
                        {
                            session_id: requestedSessionId,
                            replacement_session_id: replacementSessionId,
                        },
                        controller.signal,
                    );
                }
                if (cancelled) return;

                const pendingRequest = readPendingRequest(requestedSessionId);
                if (
                    pendingRequest?.requestId === replacementSessionId &&
                    resolution.session_id !== requestedSessionId
                ) {
                    if (
                        !storePendingRequest({
                            ...pendingRequest,
                            sessionId: resolution.session_id,
                        })
                    ) {
                        throw new Error(
                            "Не удалось сохранить восстановленную отправку.",
                        );
                    }
                }
                const pendingRequestToArchive =
                    discardedForeignLocalArtifacts
                        ? null
                        : (abandonedPendingRequest ??
                          (storedPendingRequest &&
                          resolution.boundary === "expired" &&
                          resolution.previous_session_id ===
                              storedPendingRequest.sessionId &&
                          storedPendingRequest.requestId !==
                              replacementSessionId
                              ? storedPendingRequest
                              : null));

                let previousLifecycleGroup: VeraPreviousSessionGroup | null =
                    null;
                if (
                    resolution.boundary === "expired" &&
                    resolution.previous_session_id
                ) {
                    let previousMessages: VeraChatMessage[] = [];
                    let previousHistoryCursor: number | null = null;
                    try {
                        const previousHistory = await veraApi.getHistory(
                            resolution.previous_session_id,
                            { signal: controller.signal },
                        );
                        previousMessages = historyToMessages(previousHistory);
                        previousHistoryCursor =
                            previousHistory.next_before_sequence ?? null;
                    } catch (historyLoadError) {
                        if (cancelled || controller.signal.aborted) return;
                        if (
                            !(
                                historyLoadError instanceof ApiRequestError &&
                                historyLoadError.status === 404
                            )
                        ) {
                            setHistoryError(
                                historyLoadError instanceof ApiRequestError
                                    ? historyLoadError.detail
                                    : "Не удалось загрузить завершённый диалог.",
                            );
                        }
                    }
                    previousLifecycleGroup = {
                        sessionId: resolution.previous_session_id,
                        messages: previousMessages,
                        historyCursor: previousHistoryCursor,
                    };
                }
                if (
                    !storeResolvedSession(
                        resolution.session_id,
                        pendingRequestToArchive !== null,
                    )
                ) {
                    throw new Error(
                        "Не удалось сохранить активный диалог.",
                    );
                }
                if (previousLifecycleGroup) {
                    preservePreviousSession(
                        previousLifecycleGroup.sessionId,
                        previousLifecycleGroup.messages,
                        previousLifecycleGroup.historyCursor,
                    );
                }
                if (pendingRequestToArchive) {
                    const abandonedMessages =
                        pendingRequestToAbandonedMessages(
                            pendingRequestToArchive,
                        );
                    const previousMessageIds = new Set(
                        previousLifecycleGroup?.messages.map(
                            (message) => message.id,
                        ) ?? [],
                    );
                    preservePreviousSession(
                        pendingRequestToArchive.sessionId,
                        previousLifecycleGroup?.sessionId ===
                            pendingRequestToArchive.sessionId
                            ? [
                                  ...previousLifecycleGroup.messages,
                                  ...abandonedMessages.filter(
                                      (message) =>
                                          !previousMessageIds.has(message.id),
                                  ),
                              ]
                            : abandonedMessages,
                        previousLifecycleGroup?.sessionId ===
                            pendingRequestToArchive.sessionId
                            ? previousLifecycleGroup.historyCursor
                            : null,
                    );
                    clearPendingRequest(pendingRequestToArchive.requestId);
                    restoreDeliveryState("draft");
                    setStatus("idle");
                    setHistoryError(ABANDONED_RECOVERY_DETAIL);
                    setAnnouncement("Начат новый диалог.");
                }
                const keepsUnknownRetainedOperation =
                    !discardedForeignLocalArtifacts &&
                    storedPendingRequest?.requestId === replacementSessionId;
                if (!keepsUnknownRetainedOperation) {
                    clearSessionReplacementId(
                        requestedSessionId,
                        replacementSessionId,
                    );
                }
                setIsHistoryLoading(false);
            } catch (error) {
                if (cancelled || controller.signal.aborted) return;
                if (
                    pendingResolution &&
                    error instanceof ApiRequestError &&
                    (error.status === 403 || error.status === 409)
                ) {
                    reconciliationControllerRef.current?.abort();
                    reconciliationControllerRef.current = null;
                    activeRequestIdRef.current = null;
                    closeStream();
                    clearBufferedTokens();
                    const recovered =
                        await abandonRejectedLifecycleOperation({
                            doomedSessionId: pendingResolution.sessionId,
                            doomedReplacementSessionId:
                                pendingResolution.replacementSessionId,
                            pendingRequest: readPendingRequestByRequestId(
                                pendingResolution.replacementSessionId,
                            ) ?? abandonedPendingRequest,
                            previousMessages: [],
                            previousHistoryCursor: null,
                            rejectionStatus:
                                error.status === 403 ? 403 : 409,
                            requestAuthUserId: authUserId,
                            signal: controller.signal,
                        });
                    if (cancelled || controller.signal.aborted) return;
                    setIsHistoryLoading(false);
                    setHistoryError(ABANDONED_RECOVERY_DETAIL);
                    if (recovered) {
                        restoreDeliveryState("draft");
                        setStatus("idle");
                        setAnnouncement("Начат новый диалог.");
                    }
                    return;
                }
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
    }, [
        abandonRejectedLifecycleOperation,
        authUserId,
        clearBufferedTokens,
        closeStream,
        discardForeignOwnerArtifacts,
        isAuthLoading,
        preservePreviousSession,
        restoreDeliveryState,
        runPendingNewDialogOperation,
        storeResolvedSession,
    ]);

    useEffect(() => {
        if (!sessionId) return;
        if (controlledSessionTransitionRef.current === sessionId) {
            controlledSessionTransitionRef.current = null;
            setIsHistoryLoading(false);
            return;
        }

        const controller = new AbortController();
        let cancelled = false;
        const messagesRevision = messagesRevisionRef.current;
        let restoredProcessingRequestId: string | null = null;

        async function restoreHistory() {
            const startedAt = Date.now();
            setIsHistoryLoading(true);
            setIsOlderHistoryLoading(false);
            setHistoryError(null);

            try {
                const pendingRequest = readPendingRequest(sessionId);
                if (pendingRequest) {
                    const pendingLifecycleResolution =
                        readPendingSessionResolution();
                    activeRequestIdRef.current = pendingRequest.requestId;
                    restoreDeliveryState("submitting");
                    setMessages(pendingRequestToMessages(pendingRequest));
                    setStatus("waiting");
                    startWaitingHints(
                        pendingRequest.requestId,
                        pendingRequest.createdAt,
                    );
                    await reconcileAmbiguousPublication({
                        requestStartedAt: Math.min(
                            pendingRequest.createdAt,
                            Date.now(),
                        ),
                        requestId: pendingRequest.requestId,
                        message: pendingRequest.message,
                        userMessageId: `${pendingRequest.requestId}:user`,
                        assistantMessageId: `${pendingRequest.requestId}:assistant`,
                        restoreMessagesFromHistory: true,
                        lifecycleJournal:
                            pendingLifecycleResolution?.replacementSessionId ===
                                pendingRequest.requestId &&
                            (pendingLifecycleResolution.sessionId ===
                                pendingRequest.sessionId ||
                                pendingLifecycleResolution.replacementSessionId ===
                                    pendingRequest.sessionId)
                                ? pendingLifecycleResolution
                                : undefined,
                    });
                    return;
                }

                restoreDeliveryState("draft");
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

                    const processingTurn = history.turns.find(
                        (turn) => turn.status === "processing",
                    );
                    if (!processingTurn) {
                        let restoredTerminalState: VeraDeliveryState | null =
                            null;
                        if (restoredProcessingRequestId !== null) {
                            const terminalTurn = history.turns.find(
                                (turn) =>
                                    turn.request_id ===
                                    restoredProcessingRequestId,
                            );
                            restoredTerminalState =
                                terminalTurn
                                    ? historyStatusToDeliveryState(
                                          terminalTurn.status,
                                      )
                                    : "unknown";
                            restoreDeliveryState(restoredTerminalState);
                        }
                        activeRequestIdRef.current = null;
                        stopWaitingHints();
                        if (restoredTerminalState === "unknown") {
                            setStatus("unavailable");
                            setAnnouncement("");
                            setHistoryError(
                                "Статус ответа пока неизвестен. Обновите страницу позже.",
                            );
                            return;
                        }
                        setStatus("idle");
                        setAnnouncement(
                            history.turns.length > 0
                                ? "История диалога восстановлена."
                                : "",
                        );
                        return;
                    }

                    if (
                        restoredProcessingRequestId !==
                        processingTurn.request_id
                    ) {
                        restoredProcessingRequestId =
                            processingTurn.request_id;
                        activeRequestIdRef.current =
                            processingTurn.request_id;
                        const parsedCreatedAt = Date.parse(
                            processingTurn.created_at,
                        );
                        startWaitingHints(
                            processingTurn.request_id,
                            Number.isFinite(parsedCreatedAt)
                                ? parsedCreatedAt
                                : Date.now(),
                        );
                    }
                    restoreDeliveryState("processing");
                    setStatus("waiting");
                    if (
                        Date.now() - startedAt >=
                        OVERALL_RESPONSE_DEADLINE_MS
                    ) {
                        restoreDeliveryState("unknown");
                        setMessages((current) =>
                            current.map((message) =>
                                message.streaming
                                    ? {
                                          ...message,
                                          streaming: false,
                                          deliveryState: "unknown",
                                      }
                                    : message,
                            ),
                        );
                        setStatus("unavailable");
                        setAnnouncement("");
                        setHistoryError(
                            "Ответ Ассистента Веры ещё не готов. Попробуйте обновить страницу позже.",
                        );
                        return;
                    }

                    await waitForHistoryPoll(controller.signal);
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
            if (controlledSessionTransitionRef.current !== null) return;
            postControllerRef.current?.abort();
            postControllerRef.current = null;
            reconciliationControllerRef.current?.abort();
            olderHistoryControllerRef.current?.abort();
            olderHistoryControllerRef.current = null;
            activeRequestIdRef.current = null;
            closeStream();
            clearBufferedTokens();
            stopWaitingHints();
        };
    }, [
        clearBufferedTokens,
        closeStream,
        reconcileAmbiguousPublication,
        restoreDeliveryState,
        sessionId,
        startWaitingHints,
        stopWaitingHints,
    ]);

    const loadOlderHistory = useCallback(async () => {
        if (!sessionId || historyCursor === null || isOlderHistoryLoading) {
            return;
        }
        const requestedSessionId = sessionId;
        const controller = new AbortController();
        olderHistoryControllerRef.current?.abort();
        olderHistoryControllerRef.current = controller;
        setIsOlderHistoryLoading(true);
        setHistoryError(null);
        try {
            const history = await veraApi.getHistory(requestedSessionId, {
                beforeSequence: historyCursor,
                signal: controller.signal,
            });
            if (
                controller.signal.aborted ||
                !isMountedRef.current ||
                sessionIdRef.current !== requestedSessionId
            ) {
                return;
            }
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
            if (
                controller.signal.aborted ||
                !isMountedRef.current ||
                sessionIdRef.current !== requestedSessionId
            ) {
                return;
            }
            setHistoryError(
                error instanceof ApiRequestError
                    ? error.detail
                    : "Не удалось загрузить предыдущие сообщения.",
            );
        } finally {
            if (olderHistoryControllerRef.current === controller) {
                olderHistoryControllerRef.current = null;
            }
            if (
                isMountedRef.current &&
                sessionIdRef.current === requestedSessionId
            ) {
                setIsOlderHistoryLoading(false);
            }
        }
    }, [historyCursor, isOlderHistoryLoading, sessionId]);

    const loadOlderPreviousHistory = useCallback(
        async (previousSessionId: string) => {
            const group = previousSessionGroups.find(
                (candidate) => candidate.sessionId === previousSessionId,
            );
            if (
                !group ||
                group.historyCursor === null ||
                olderPreviousHistorySessionId !== null
            ) {
                return;
            }

            const controller = new AbortController();
            olderPreviousHistoryControllerRef.current?.abort();
            olderPreviousHistoryControllerRef.current = controller;
            setOlderPreviousHistorySessionId(previousSessionId);
            setHistoryError(null);
            try {
                const history = await veraApi.getHistory(previousSessionId, {
                    beforeSequence: group.historyCursor,
                    signal: controller.signal,
                });
                if (controller.signal.aborted || !isMountedRef.current) return;

                const olderMessages = historyToMessages(history);
                setPreviousSessionGroups((current) =>
                    current.map((candidate) => {
                        if (candidate.sessionId !== previousSessionId) {
                            return candidate;
                        }
                        const currentIds = new Set(
                            candidate.messages.map((message) => message.id),
                        );
                        return {
                            ...candidate,
                            messages: [
                                ...olderMessages.filter(
                                    (message) => !currentIds.has(message.id),
                                ),
                                ...candidate.messages,
                            ],
                            historyCursor:
                                history.next_before_sequence ?? null,
                        };
                    }),
                );
            } catch (historyLoadError) {
                if (controller.signal.aborted || !isMountedRef.current) return;
                setHistoryError(
                    historyLoadError instanceof ApiRequestError
                        ? historyLoadError.detail
                        : "Не удалось загрузить предыдущие сообщения завершённого диалога.",
                );
            } finally {
                if (
                    olderPreviousHistoryControllerRef.current === controller
                ) {
                    olderPreviousHistoryControllerRef.current = null;
                    if (isMountedRef.current) {
                        setOlderPreviousHistorySessionId(null);
                    }
                }
            }
        },
        [olderPreviousHistorySessionId, previousSessionGroups],
    );

    const startNewDialog = useCallback(async (): Promise<boolean> => {
        if (
            isStartingNewDialogRef.current ||
            isHistoryLoading ||
            !sessionId ||
            activeRequestIdRef.current !== null ||
            !DELIVERY_STATES_ALLOWING_NEW_REQUEST.has(
                deliveryStateRef.current,
            )
        ) {
            return false;
        }

        isStartingNewDialogRef.current = true;
        setIsStartingNewDialog(true);
        stopWaitingHints();
        setError(null);
        setHistoryError(null);
        setAnnouncement("Создаю новый диалог.");
        const controller = new AbortController();
        newDialogControllerRef.current?.abort();
        newDialogControllerRef.current = controller;
        const requestAuthUserId = authUserId;

        try {
            let operation = readPendingNewDialog();
            if (operation) setHasPendingNewDialog(true);
            let messagesToArchive = messages;
            let historyCursorToArchive = historyCursor;

            if (!operation) {
                operation = {
                    previousSessionId: sessionId,
                    newSessionId: crypto.randomUUID(),
                };
                if (!storePendingNewDialog(operation)) {
                    throw new Error(
                        "Не удалось безопасно сохранить создание нового диалога.",
                    );
                }
                setHasPendingNewDialog(true);
            } else if (operation.previousSessionId !== sessionId) {
                const archivedGroup = previousSessionGroups.find(
                    (group) =>
                        group.sessionId === operation?.previousSessionId,
                );
                messagesToArchive = archivedGroup?.messages ?? [];
                historyCursorToArchive =
                    archivedGroup?.historyCursor ?? null;
            }

            return await runPendingNewDialogOperation({
                operation,
                fallbackPreviousMessages: messagesToArchive,
                fallbackPreviousHistoryCursor: historyCursorToArchive,
                signal: controller.signal,
                requestAuthUserId,
            });
        } catch (newDialogError) {
            if (
                controller.signal.aborted ||
                !isMountedRef.current ||
                authUserIdRef.current !== requestAuthUserId
            ) {
                return false;
            }
            setAnnouncement("");
            const originalNewDialogError =
                unwrapNewDialogOperationError(newDialogError);
            setHasPendingNewDialog(readPendingNewDialog() !== null);
            setError(
                originalNewDialogError instanceof ApiRequestError
                    ? originalNewDialogError.detail
                    : originalNewDialogError instanceof Error
                      ? originalNewDialogError.message
                      : "Не удалось начать новый диалог. Попробуйте ещё раз.",
            );
            return false;
        } finally {
            if (newDialogControllerRef.current === controller) {
                newDialogControllerRef.current = null;
                isStartingNewDialogRef.current = false;
                if (isMountedRef.current) setIsStartingNewDialog(false);
            }
        }
    }, [
        authUserId,
        historyCursor,
        isHistoryLoading,
        messages,
        previousSessionGroups,
        runPendingNewDialogOperation,
        sessionId,
        stopWaitingHints,
    ]);

    const sendMessage = useCallback(
        async (
            text: string,
            options: VeraSendMessageOptions = {},
        ): Promise<VeraSendMessageResult> => {
            if (readPendingNewDialog()) {
                setError(
                    "Завершите создание нового диалога перед отправкой сообщения.",
                );
                return { outcome: "rejected", restoreDraft: true };
            }
            if (
                isStartingNewDialogRef.current ||
                !DELIVERY_STATES_ALLOWING_NEW_REQUEST.has(
                    deliveryStateRef.current,
                )
            ) {
                return { outcome: "unknown", restoreDraft: false };
            }

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

            reconciliationControllerRef.current?.abort();
            reconciliationControllerRef.current = null;
            transitionDeliveryState("submitting");
            setError(null);
            setStatus("waiting");
            setAnnouncement(
                options.waitingVariant === "simplify"
                    ? "Ассистент Вера готовит более простое объяснение."
                    : "Ассистент Вера анализирует сообщение.",
            );

            const replacementSessionId =
                readOrCreateSessionReplacementId(sessionId);
            if (!replacementSessionId) {
                transitionDeliveryState("failed");
                setStatus("idle");
                setAnnouncement("");
                setError(
                    "Не удалось безопасно сохранить границу диалога. Обновите страницу и попробуйте ещё раз.",
                );
                return { outcome: "rejected", restoreDraft: true };
            }

            let effectiveSessionId = sessionId;
            let messagesBeforeRequest = messages;
            const requestAuthUserId = authUserId;
            const resolveController = new AbortController();
            sendResolveControllerRef.current?.abort();
            sendResolveControllerRef.current = resolveController;
            try {
                const resolution = await veraApi.resolveSession(
                    {
                        session_id: sessionId,
                        replacement_session_id: replacementSessionId,
                    },
                    resolveController.signal,
                );
                if (
                    !isMountedRef.current ||
                    authUserIdRef.current !== requestAuthUserId
                ) {
                    return { outcome: "unknown", restoreDraft: false };
                }

                effectiveSessionId = resolution.session_id;
                if (
                    resolution.boundary === "expired" &&
                    resolution.previous_session_id
                ) {
                    preservePreviousSession(
                        resolution.previous_session_id,
                        messagesBeforeRequest,
                        historyCursor,
                    );
                    messagesBeforeRequest = [];
                    olderHistoryControllerRef.current?.abort();
                    olderHistoryControllerRef.current = null;
                    setIsOlderHistoryLoading(false);
                    setHistoryCursor(null);
                    setMessages([]);
                }
                if (
                    !storeResolvedSession(
                        effectiveSessionId,
                        effectiveSessionId !== sessionId,
                    )
                ) {
                    throw new Error(
                        "Не удалось сохранить активный диалог.",
                    );
                }
                clearSessionReplacementId(
                    sessionId,
                    replacementSessionId,
                );
            } catch (resolveError) {
                if (
                    !isMountedRef.current ||
                    authUserIdRef.current !== requestAuthUserId ||
                    resolveController.signal.aborted
                ) {
                    return { outcome: "unknown", restoreDraft: false };
                }
                if (
                    resolveError instanceof ApiRequestError &&
                    (resolveError.status === 403 ||
                        resolveError.status === 409)
                ) {
                    const recovered =
                        await abandonRejectedLifecycleOperation({
                            doomedSessionId: sessionId,
                            doomedReplacementSessionId: replacementSessionId,
                            pendingRequest: null,
                            previousMessages: messagesBeforeRequest,
                            previousHistoryCursor: historyCursor,
                            rejectionStatus:
                                resolveError.status === 403 ? 403 : 409,
                            requestAuthUserId,
                            signal: resolveController.signal,
                        });
                    if (
                        !isMountedRef.current ||
                        authUserIdRef.current !== requestAuthUserId ||
                        resolveController.signal.aborted
                    ) {
                        return { outcome: "unknown", restoreDraft: false };
                    }
                    transitionDeliveryState("failed");
                    setStatus("idle");
                    setAnnouncement("");
                    setError(
                        recovered
                            ? ABANDONED_RECOVERY_DETAIL
                            : "Не удалось завершить восстановление диалога. Обновите страницу; исходный текст можно отправить повторно.",
                    );
                    return { outcome: "rejected", restoreDraft: true };
                }
                transitionDeliveryState("failed");
                setStatus("idle");
                setAnnouncement("");
                setError(
                    resolveError instanceof ApiRequestError
                        ? resolveError.detail
                        : "Не удалось определить активный диалог.",
                );
                return { outcome: "rejected", restoreDraft: true };
            } finally {
                if (sendResolveControllerRef.current === resolveController) {
                    sendResolveControllerRef.current = null;
                }
            }

            const requestStartedAt = Date.now();
            if (
                !storeSessionReplacementId(effectiveSessionId, requestId)
            ) {
                transitionDeliveryState("failed");
                setStatus("idle");
                setAnnouncement("");
                setError(
                    "Не удалось безопасно сохранить отправку. Обновите страницу и попробуйте ещё раз.",
                );
                return { outcome: "rejected", restoreDraft: true };
            }
            if (
                !storePendingRequest({
                    sessionId: effectiveSessionId,
                    requestId,
                    message: payload.data.message,
                    createdAt: requestStartedAt,
                })
            ) {
                clearSessionReplacementId(effectiveSessionId, requestId);
                transitionDeliveryState("failed");
                setStatus("idle");
                setAnnouncement("");
                setError(
                    "Не удалось безопасно сохранить запрос. Обновите страницу и попробуйте ещё раз.",
                );
                return { outcome: "rejected", restoreDraft: true };
            }
            activeRequestIdRef.current = requestId;
            messagesRevisionRef.current += 1;

            const userMessageId = `${requestId}:user`;
            const assistantMessageId = `${requestId}:assistant`;
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
                    waitingVariant: options.waitingVariant,
                    feedbackEligible: false,
                    deliveryState: "submitting",
                },
            ]);
            startWaitingHints(
                requestId,
                requestStartedAt,
                options.waitingVariant,
            );

            const applyPublishedLifecycle = (
                lifecycle: VeraChatSessionLifecycleResponse,
            ): boolean => {
                if (
                    lifecycle.session_id === effectiveSessionId ||
                    lifecycle.boundary !== "expired" ||
                    !lifecycle.previous_session_id
                ) {
                    return true;
                }

                // The receipt means the server may already have committed
                // and published the rollover. Persist the remapped request
                // and effective session before changing UI state or clearing
                // the exact lifecycle journal. A quota/crash then leaves an
                // operation that reload can safely replay.
                if (
                    !storePendingRequest({
                        sessionId: lifecycle.session_id,
                        requestId,
                        message: payload.data.message,
                        createdAt: requestStartedAt,
                    }) ||
                    !storeResolvedSession(lifecycle.session_id, true)
                ) {
                    return false;
                }
                preservePreviousSession(
                    lifecycle.previous_session_id,
                    messagesBeforeRequest,
                    historyCursor,
                );
                setMessages((current) =>
                    current.filter(
                        (message) =>
                            message.id === userMessageId ||
                            message.id === assistantMessageId,
                    ),
                );
                olderHistoryControllerRef.current?.abort();
                olderHistoryControllerRef.current = null;
                setIsOlderHistoryLoading(false);
                setHistoryCursor(null);
                effectiveSessionId = lifecycle.session_id;
                return true;
            };

            const finishLifecyclePersistenceAsUnknown = (
                detail: string,
            ): VeraSendMessageResult => {
                activeRequestIdRef.current = null;
                transitionDeliveryState("unknown");
                setStatus("unavailable");
                setMessages((current) =>
                    current.map((message) =>
                        message.id === userMessageId
                            ? { ...message, deliveryStatus: "unknown" }
                            : message.id === assistantMessageId
                              ? {
                                    ...message,
                                    streaming: false,
                                    feedbackEligible: false,
                                    deliveryState: "unknown",
                                }
                              : message,
                    ),
                );
                setAnnouncement("");
                setError(detail);
                return { outcome: "unknown", restoreDraft: false };
            };

            let receipt: Awaited<ReturnType<typeof veraApi.sendMessage>>;
            const publishedSessionId = effectiveSessionId;
            const postController = new AbortController();
            postControllerRef.current?.abort();
            postControllerRef.current = postController;
            const postTimeoutId = setTimeout(
                () => postController.abort(),
                POST_RECEIPT_TIMEOUT_MS,
            );
            try {
                receipt = await veraApi.sendMessage(
                    {
                        session_id: effectiveSessionId,
                        request_id: payload.data.request_id,
                        message: payload.data.message,
                    },
                    postController.signal,
                );
            } catch (err) {
                if (
                    !isMountedRef.current ||
                    activeRequestIdRef.current !== requestId ||
                    authUserIdRef.current !== requestAuthUserId
                ) {
                    return { outcome: "unknown", restoreDraft: false };
                }
                closeStream();
                clearBufferedTokens();
                const isApiError = err instanceof ApiRequestError;
                let didPersistLifecycle = true;
                if (isApiError && err.lifecycle) {
                    didPersistLifecycle = applyPublishedLifecycle(
                        err.lifecycle,
                    );
                }
                if (!didPersistLifecycle) {
                    return finishLifecyclePersistenceAsUnknown(
                        "Ответ сервера получен, но новый диалог не удалось сохранить. Обновите страницу для безопасного восстановления.",
                    );
                }
                const shouldAbandonRejectedOperation =
                    isApiError &&
                    !err.lifecycle &&
                    (err.status === 403 || err.status === 409);
                if (shouldAbandonRejectedOperation) {
                    const recovered =
                        await abandonRejectedLifecycleOperation({
                            doomedSessionId: publishedSessionId,
                            doomedReplacementSessionId: requestId,
                            pendingRequest:
                                readPendingRequestByRequestId(requestId),
                            previousMessages: messagesBeforeRequest,
                            previousHistoryCursor: historyCursor,
                            rejectionStatus: err.status === 403 ? 403 : 409,
                            requestAuthUserId,
                            signal: postController.signal,
                        });
                    if (
                        !isMountedRef.current ||
                        activeRequestIdRef.current !== requestId ||
                        postController.signal.aborted
                    ) {
                        return { outcome: "unknown", restoreDraft: false };
                    }
                    if (!recovered) {
                        activeRequestIdRef.current = null;
                        transitionDeliveryState("failed");
                        setStatus("idle");
                        setMessages((current) =>
                            current
                                .filter(
                                    (message) =>
                                        message.id !== assistantMessageId,
                                )
                                .map((message) =>
                                    message.id === userMessageId
                                        ? {
                                              ...message,
                                              deliveryStatus: "rejected",
                                          }
                                        : message,
                                ),
                        );
                        setAnnouncement("");
                        setError(
                            "Отправка отклонена, но новый диалог пока не удалось сохранить. Обновите страницу; исходный текст можно отправить повторно.",
                        );
                        return {
                            outcome: "rejected",
                            restoreDraft: true,
                        };
                    }
                }
                const isDefinitelyRejected =
                    isApiError &&
                    (err.publishState === "not_published" ||
                        [400, 401, 403, 409, 422, 429].includes(err.status));

                if (isDefinitelyRejected) {
                    const keepsLifecycleRecovery =
                        isApiError &&
                        err.publishState === "not_published" &&
                        !err.lifecycle &&
                        err.status >= 500;
                    if (!keepsLifecycleRecovery) {
                        clearSessionReplacementId(
                            publishedSessionId,
                            requestId,
                        );
                    }
                    clearPendingRequest(requestId);
                    activeRequestIdRef.current = null;
                    transitionDeliveryState("failed");
                    setStatus("idle");
                    setMessages((prev) =>
                        prev
                            .filter(
                                (message) => message.id !== assistantMessageId,
                            )
                            .map((message) =>
                                message.id === userMessageId
                                    ? {
                                          ...message,
                                          deliveryStatus: "rejected",
                                      }
                                    : message,
                            ),
                    );
                    setAnnouncement("");
                    setError(
                        shouldAbandonRejectedOperation
                            ? ABANDONED_RECOVERY_DETAIL
                            : err instanceof Error
                            ? err.message
                            : "Не удалось отправить сообщение.",
                    );
                    return { outcome: "rejected", restoreDraft: true };
                }

                let reconciliationSessionId = effectiveSessionId;
                if (!(isApiError && err.lifecycle)) {
                // A lost chat receipt can hide a mandatory S -> R rollover.
                // Re-run the exact lifecycle operation before polling so
                // history lookup follows the effective session instead of
                // waiting on the closed predecessor for 30 seconds.
                const recoveryAuthUserId = requestAuthUserId;
                const lifecycleController = new AbortController();
                let lifecycleTimedOut = false;
                sendResolveControllerRef.current?.abort();
                sendResolveControllerRef.current = lifecycleController;
                const lifecycleTimeoutId = setTimeout(() => {
                    lifecycleTimedOut = true;
                    lifecycleController.abort();
                }, POST_RECEIPT_TIMEOUT_MS);
                try {
                    const recoveredLifecycle =
                        await veraApi.resolveSession(
                            {
                                session_id: publishedSessionId,
                                replacement_session_id: requestId,
                            },
                            lifecycleController.signal,
                        );
                    if (
                        !isMountedRef.current ||
                        activeRequestIdRef.current !== requestId ||
                        authUserIdRef.current !== recoveryAuthUserId
                    ) {
                        return {
                            outcome: "unknown",
                            restoreDraft: false,
                        };
                    }
                    if (!applyPublishedLifecycle(recoveredLifecycle)) {
                        return finishLifecyclePersistenceAsUnknown(
                            "Граница диалога восстановлена, но её не удалось сохранить. Обновите страницу для безопасного восстановления.",
                        );
                    }
                    reconciliationSessionId = effectiveSessionId;
                } catch (lifecycleError) {
                    if (
                        !isMountedRef.current ||
                        activeRequestIdRef.current !== requestId ||
                        authUserIdRef.current !== recoveryAuthUserId ||
                        (lifecycleController.signal.aborted &&
                            !lifecycleTimedOut)
                    ) {
                        return {
                            outcome: "unknown",
                            restoreDraft: false,
                        };
                    }
                    if (
                        lifecycleError instanceof ApiRequestError &&
                        lifecycleError.lifecycle
                    ) {
                        if (
                            !applyPublishedLifecycle(
                                lifecycleError.lifecycle,
                            )
                        ) {
                            return finishLifecyclePersistenceAsUnknown(
                                "Граница диалога подтверждена, но её не удалось сохранить. Обновите страницу для безопасного восстановления.",
                            );
                        }
                        reconciliationSessionId = effectiveSessionId;
                    } else if (
                        lifecycleError instanceof ApiRequestError &&
                        (lifecycleError.status === 403 ||
                            lifecycleError.status === 409)
                    ) {
                        const recovered =
                            await abandonRejectedLifecycleOperation({
                                doomedSessionId: publishedSessionId,
                                doomedReplacementSessionId: requestId,
                                pendingRequest:
                                    readPendingRequestByRequestId(requestId),
                                previousMessages: messagesBeforeRequest,
                                previousHistoryCursor: historyCursor,
                                rejectionStatus:
                                    lifecycleError.status === 403 ? 403 : 409,
                                requestAuthUserId: recoveryAuthUserId,
                                signal: lifecycleController.signal,
                            });
                        if (
                            !isMountedRef.current ||
                            activeRequestIdRef.current !== requestId ||
                            authUserIdRef.current !== recoveryAuthUserId
                        ) {
                            return {
                                outcome: "unknown",
                                restoreDraft: false,
                            };
                        }
                        if (!recovered) {
                            return finishLifecyclePersistenceAsUnknown(
                                "Не удалось восстановить границу диалога. Обновите страницу, чтобы повторить безопасное восстановление.",
                            );
                        }
                        activeRequestIdRef.current = null;
                        transitionDeliveryState("failed");
                        setStatus("idle");
                        setAnnouncement("Начат новый диалог.");
                        setError(ABANDONED_RECOVERY_DETAIL);
                        return {
                            outcome: "unknown",
                            restoreDraft: false,
                        };
                    }
                    // Transport/5xx recovery failures leave the exact journal
                    // intact. Polling the predecessor is still useful for a
                    // retained operation; reload can retry an expired one.
                } finally {
                    clearTimeout(lifecycleTimeoutId);
                    if (
                        sendResolveControllerRef.current ===
                        lifecycleController
                    ) {
                        sendResolveControllerRef.current = null;
                    }
                }
                }

                setMessages((prev) =>
                    prev.map((message) =>
                        message.id === userMessageId
                            ? { ...message, deliveryStatus: "unknown" }
                            : message,
                    ),
                );
                setAnnouncement("Проверяю результат отправки сообщения.");
                return reconcileAmbiguousPublication({
                    requestStartedAt,
                    requestId,
                    message: payload.data.message,
                    userMessageId,
                    assistantMessageId,
                    sessionIdOverride: reconciliationSessionId,
                    lifecycleJournal: {
                        sessionId: publishedSessionId,
                        replacementSessionId: requestId,
                    },
                });
            } finally {
                clearTimeout(postTimeoutId);
                if (postControllerRef.current === postController) {
                    postControllerRef.current = null;
                }
            }

            if (
                !isMountedRef.current ||
                activeRequestIdRef.current !== requestId
            ) {
                return { outcome: "accepted", restoreDraft: false };
            }

            if (!applyPublishedLifecycle(receipt)) {
                return finishLifecyclePersistenceAsUnknown(
                    "Сообщение принято, но новый диалог не удалось сохранить. Обновите страницу для безопасного восстановления.",
                );
            }
            clearSessionReplacementId(publishedSessionId, requestId);

            transitionDeliveryState("accepted");
            setMessages((prev) =>
                prev.map((message) =>
                    message.id === userMessageId
                        ? { ...message, deliveryStatus: "sent" }
                        : message.id === assistantMessageId
                          ? { ...message, deliveryState: "accepted" }
                          : message,
                ),
            );

            // Ticket выпускается backend только после успешной публикации
            // в RabbitMQ. Late-connect buffer Agent Service сохраняет события
            // между ответом 202 и этим подключением.
            const eventSource = new EventSource(
                `${receipt.stream_url}?ticket=${encodeURIComponent(receipt.stream_ticket)}`,
            );
            eventSourceRef.current = eventSource;

            let streamSettled = false;
            const failStream = (message: string) => {
                if (
                    streamSettled ||
                    !isMountedRef.current ||
                    activeRequestIdRef.current !== requestId
                ) {
                    return;
                }
                streamSettled = true;
                closeStream();
                clearBufferedTokens();
                transitionDeliveryState("unknown");
                markAssistantOutcomeUnknown(assistantMessageId);
                setStatus("unavailable");
                setAnnouncement("");
                setError(message);
            };

            const markProcessing = () => {
                if (deliveryStateRef.current === "accepted") {
                    transitionDeliveryState("processing");
                    setMessages((prev) =>
                        prev.map((message) =>
                            message.id === assistantMessageId
                                ? {
                                      ...message,
                                      deliveryState: "processing",
                                  }
                                : message,
                        ),
                    );
                }
            };

            eventSource.onopen = () => {
                if (
                    streamSettled ||
                    !isMountedRef.current ||
                    activeRequestIdRef.current !== requestId
                ) {
                    return;
                }
                markProcessing();
            };

            const resetInactivityTimeout = () => {
                if (inactivityTimeoutRef.current !== null) {
                    clearTimeout(inactivityTimeoutRef.current);
                }
                inactivityTimeoutRef.current = setTimeout(() => {
                    failStream(
                        "Поток ответа перестал обновляться. Ответ появится в истории, если обработка завершится.",
                    );
                }, INACTIVITY_TIMEOUT_MS);
            };

            const markStreamActivity = () => {
                if (firstEventTimeoutRef.current !== null) {
                    clearTimeout(firstEventTimeoutRef.current);
                    firstEventTimeoutRef.current = null;
                }
                resetInactivityTimeout();
            };

            firstEventTimeoutRef.current = setTimeout(() => {
                failStream(
                    "Ассистент Вера не начал отвечать. Попробуйте позже.",
                );
            }, FIRST_EVENT_TIMEOUT_MS);
            overallTimeoutRef.current = setTimeout(() => {
                failStream(
                    "Ответ готовится дольше ожидаемого. Он появится в истории, если обработка завершится.",
                );
            }, OVERALL_RESPONSE_DEADLINE_MS);

            let hasReceivedToken = false;

            eventSource.onmessage = (event) => {
                if (
                    streamSettled ||
                    !isMountedRef.current ||
                    activeRequestIdRef.current !== requestId
                ) {
                    return;
                }

                let rawData: unknown;
                try {
                    rawData = JSON.parse(event.data);
                } catch {
                    flushBufferedTokens();
                    failStream(
                        "Не удалось обработать ответ Ассистента Веры. Попробуйте ещё раз.",
                    );
                    return;
                }
                const data = parseSseEvent(rawData);
                if (data === null) {
                    flushBufferedTokens();
                    failStream(
                        "Не удалось обработать ответ Ассистента Веры. Попробуйте ещё раз.",
                    );
                    return;
                }

                if (data.type === "ignored") {
                    return;
                }

                markStreamActivity();

                if (data.type === "heartbeat") {
                    markProcessing();
                    return;
                }

                if (data.type === "token") {
                    markProcessing();
                    transitionDeliveryState("streaming");
                    if (!hasReceivedToken) {
                        stopWaitingHints();
                        setAnnouncement("");
                    }
                    hasReceivedToken = true;
                    setStatus("streaming");
                    setMessages((prev) =>
                        prev.map((message) =>
                            message.id === assistantMessageId
                                ? {
                                      ...message,
                                      deliveryState: "streaming",
                                  }
                                : message,
                        ),
                    );
                    bufferToken(assistantMessageId, data.content);
                    return;
                }

                if (data.type === "done") {
                    streamSettled = true;
                    clearPendingRequest(requestId);
                    clearSessionReplacementId(
                        publishedSessionId,
                        requestId,
                    );
                    markProcessing();
                    transitionDeliveryState("completed");
                    flushBufferedTokens();
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMessageId
                                ? {
                                      ...m,
                                      streaming: false,
                                      feedbackEligible: true,
                                      deliveryState: "completed",
                                      usedKnowledgeBase:
                                          data.used_knowledge_base === true,
                                  }
                                : m,
                        ),
                    );
                    setAnnouncement("Ответ Ассистента Веры готов.");
                    setStatus("idle");
                    closeStream();
                    activeRequestIdRef.current = null;
                    return;
                }

                // data.type === "error"
                streamSettled = true;
                flushBufferedTokens();
                closeStream();
                stopWaitingHints();
                setStatus("waiting");
                setAnnouncement("Проверяю итог обработки сообщения.");
                setError(null);
                void reconcileAmbiguousPublication({
                    requestStartedAt,
                    requestId,
                    message: payload.data.message,
                    userMessageId,
                    assistantMessageId,
                    lifecycleJournal: {
                        sessionId: publishedSessionId,
                        replacementSessionId: requestId,
                    },
                });
            };

            eventSource.onerror = () => {
                if (
                    streamSettled ||
                    !isMountedRef.current ||
                    activeRequestIdRef.current !== requestId
                ) {
                    return;
                }
                if (eventSource.readyState !== EventSource.CLOSED) {
                    // CONNECTING означает штатный browser reconnect. Ticket
                    // допускает повторное предъявление, а watchdog закроет
                    // поток, только если события действительно прекратятся.
                    return;
                }
                flushBufferedTokens();
                failStream(
                    "Не удалось получить ответ Ассистента Веры. Проверьте соединение.",
                );
            };

            return { outcome: "accepted", restoreDraft: false };
        },
        [
            abandonRejectedLifecycleOperation,
            authUserId,
            sessionId,
            messages,
            historyCursor,
            bufferToken,
            clearBufferedTokens,
            closeStream,
            flushBufferedTokens,
            markAssistantOutcomeUnknown,
            preservePreviousSession,
            reconcileAmbiguousPublication,
            storeResolvedSession,
            startWaitingHints,
            stopWaitingHints,
            transitionDeliveryState,
        ],
    );

    return {
        sessionId,
        messages,
        previousSessionGroups,
        sendMessage,
        startNewDialog,
        isStartingNewDialog,
        hasPendingNewDialog,
        status,
        deliveryState,
        waitingStage,
        error,
        announcement,
        isHistoryLoading,
        historyError,
        hasOlderHistory: historyCursor !== null,
        isOlderHistoryLoading,
        loadOlderHistory,
        olderPreviousHistorySessionId,
        loadOlderPreviousHistory,
    };
}

function readPendingRequestByRequestId(
    requestId: string,
): VeraPendingRequest | null {
    const pendingRequest = readStoredPendingRequest();
    return pendingRequest?.requestId === requestId ? pendingRequest : null;
}

function readPendingRequest(sessionId: string): VeraPendingRequest | null {
    const pendingRequest = readStoredPendingRequest();
    return pendingRequest?.sessionId === sessionId ? pendingRequest : null;
}

function pendingRequestToAbandonedMessages(
    pendingRequest: VeraPendingRequest,
): VeraChatMessage[] {
    return pendingRequestToMessages(pendingRequest).map((message) =>
        message.role === "assistant"
            ? {
                  ...message,
                  streaming: false,
                  deliveryState: "unknown",
              }
            : message,
    );
}
