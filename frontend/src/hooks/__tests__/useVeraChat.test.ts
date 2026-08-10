import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSessionMock, getHistoryMock, sendMessageMock } = vi.hoisted(
    () => ({
        getCurrentSessionMock: vi.fn(),
        getHistoryMock: vi.fn(),
        sendMessageMock: vi.fn(),
    }),
);

vi.mock("@/lib/api/vera", () => ({
    veraApi: {
        getCurrentSession: getCurrentSessionMock,
        getHistory: getHistoryMock,
        sendMessage: sendMessageMock,
    },
}));

import { useVeraChat } from "../useVeraChat";
import { ApiRequestError } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth";

class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    static urls: string[] = [];
    static instances: FakeEventSource[] = [];

    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onopen: (() => void) | null = null;
    closed = false;
    readyState = FakeEventSource.OPEN;

    constructor(url: string | URL) {
        FakeEventSource.urls.push(String(url));
        FakeEventSource.instances.push(this);
    }

    close() {
        this.closed = true;
        this.readyState = FakeEventSource.CLOSED;
    }

    emit(data: object) {
        if (!this.closed) {
            this.readyState = FakeEventSource.OPEN;
        }
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }

    emitRaw(data: string) {
        this.onmessage?.({ data } as MessageEvent);
    }

    fail() {
        this.readyState = FakeEventSource.CLOSED;
        this.onerror?.();
    }

    disconnect() {
        this.readyState = FakeEventSource.CONNECTING;
        this.onerror?.();
    }

    open() {
        this.readyState = FakeEventSource.OPEN;
        this.onopen?.();
    }
}

let animationFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();

function flushAnimationFrames() {
    const callbacks = [...animationFrames.values()];
    animationFrames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
}

function acceptedReceipt(data: { request_id: string }) {
    return {
        request_id: data.request_id,
        stream_ticket: "signed.ticket",
        stream_url: `/vera/sse/${encodeURIComponent(data.request_id)}`,
    };
}

function historyWithTurn({
    sessionId,
    requestId,
    status,
    answer,
}: {
    sessionId: string;
    requestId: string;
    status: string;
    answer: string | null;
}) {
    return {
        session_id: sessionId,
        turns: [
            {
                request_id: requestId,
                sequence_number: 1,
                question: "Расскажите об отпуске.",
                answer,
                status,
                feedback_value: null,
                created_at: "2026-08-10T10:00:00Z",
                completed_at:
                    status === "processing"
                        ? null
                        : "2026-08-10T10:00:05Z",
            },
        ],
        next_before_sequence: null,
    };
}

describe("useVeraChat", () => {
    beforeEach(() => {
        useAuthStore.setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
        });
        window.sessionStorage.clear();
        FakeEventSource.urls = [];
        FakeEventSource.instances = [];
        animationFrameId = 0;
        animationFrames = new Map();
        getCurrentSessionMock.mockReset().mockResolvedValue({
            session_id: null,
        });
        getHistoryMock.mockReset().mockResolvedValue({
            session_id: "conversation-1",
            turns: [],
        });
        sendMessageMock
            .mockReset()
            .mockImplementation(async (data) => acceptedReceipt(data));
        vi.stubGlobal("EventSource", FakeEventSource);
        vi.stubGlobal(
            "requestAnimationFrame",
            vi.fn((callback: FrameRequestCallback) => {
                animationFrameId += 1;
                animationFrames.set(animationFrameId, callback);
                return animationFrameId;
            }),
        );
        vi.stubGlobal(
            "cancelAnimationFrame",
            vi.fn((frameId: number) => animationFrames.delete(frameId)),
        );
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("uses one request_id for both SSE subscription and message publication", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        expect(result.current.deliveryState).toBe("draft");
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        expect(sendMessageMock).toHaveBeenCalledOnce();
        const payload = sendMessageMock.mock.calls[0][0];

        expect(payload.session_id).toBeTruthy();
        expect(payload.request_id).toBeTruthy();
        expect(FakeEventSource.urls).toEqual([
            `/vera/sse/${encodeURIComponent(payload.request_id)}?ticket=signed.ticket`,
        ]);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            content: "Расскажите об отпуске.",
            deliveryStatus: "sent",
        });
        expect(result.current.deliveryState).toBe("accepted");

        unmount();
    });

    it("opens EventSource only after the publication receipt arrives", async () => {
        let resolvePublication!: () => void;
        sendMessageMock.mockImplementationOnce(
            (data) =>
                new Promise((resolve) => {
                    resolvePublication = () => resolve(acceptedReceipt(data));
                }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage("Расскажите об отпуске.");
        });
        await waitFor(() => expect(sendMessageMock).toHaveBeenCalledOnce());
        expect(FakeEventSource.instances).toEqual([]);
        expect(result.current.deliveryState).toBe("submitting");

        await act(async () => {
            resolvePublication();
            await sendPromise;
        });

        expect(FakeEventSource.instances).toHaveLength(1);
        expect(result.current.deliveryState).toBe("accepted");
        unmount();
    });

    it("starts reconciliation when the browser POST wait reaches 20 seconds", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        vi.useFakeTimers();
        let postSignal!: AbortSignal;
        sendMessageMock.mockImplementationOnce(
            (_data, signal) =>
                new Promise((_, reject) => {
                    postSignal = signal;
                    signal.addEventListener(
                        "abort",
                        () =>
                            reject(
                                new DOMException(
                                    "The operation was aborted.",
                                    "AbortError",
                                ),
                            ),
                        { once: true },
                    );
                }),
        );
        getHistoryMock.mockImplementationOnce(async (sessionId) =>
            historyWithTurn({
                sessionId,
                requestId: sendMessageMock.mock.calls[0][0].request_id,
                status: "completed",
                answer: "POST был принят до потери ответа.",
            }),
        );

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });
        await act(async () => {
            await Promise.resolve();
            vi.advanceTimersByTime(19_999);
        });
        expect(postSignal.aborted).toBe(false);
        expect(result.current.deliveryState).toBe("submitting");

        let sendResult;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
            sendResult = await sendPromise;
        });
        expect(postSignal.aborted).toBe(true);
        expect(sendResult).toEqual({
            outcome: "accepted",
            restoreDraft: false,
        });
        expect(result.current.deliveryState).toBe("completed");
        expect(sendMessageMock).toHaveBeenCalledOnce();
        expect(FakeEventSource.instances).toEqual([]);

        unmount();
    });

    it("does not open EventSource after unmount while publication is pending", async () => {
        let resolvePublication!: () => void;
        sendMessageMock.mockImplementationOnce(
            (data) =>
                new Promise((resolve) => {
                    resolvePublication = () => resolve(acceptedReceipt(data));
                }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage("Расскажите об отпуске.");
        });
        await waitFor(() => expect(sendMessageMock).toHaveBeenCalledOnce());
        unmount();

        await act(async () => {
            resolvePublication();
            await sendPromise;
        });

        expect(FakeEventSource.instances).toEqual([]);
    });

    it("restores the pending request_id after remount before allowing another send", async () => {
        const firstHook = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(firstHook.result.current.isHistoryLoading).toBe(false),
        );
        await act(async () => {
            await firstHook.result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });
        const originalRequestId =
            sendMessageMock.mock.calls[0][0].request_id;
        expect(firstHook.result.current.deliveryState).toBe("accepted");
        firstHook.unmount();

        let resolveHistory!: (value: ReturnType<typeof historyWithTurn>) => void;
        getHistoryMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveHistory = resolve;
                }),
        );
        const secondHook = renderHook(() => useVeraChat());

        await waitFor(() => expect(resolveHistory).toBeDefined());
        expect(secondHook.result.current.deliveryState).toBe("submitting");
        expect(secondHook.result.current.messages).toHaveLength(2);
        expect(secondHook.result.current.messages[1].requestId).toBe(
            originalRequestId,
        );

        let duplicateResult;
        await act(async () => {
            duplicateResult = await secondHook.result.current.sendMessage(
                "Не отправлять повторно.",
            );
        });
        expect(duplicateResult).toEqual({
            outcome: "unknown",
            restoreDraft: false,
        });
        expect(sendMessageMock).toHaveBeenCalledOnce();

        await act(async () => {
            resolveHistory(
                historyWithTurn({
                    sessionId: secondHook.result.current.sessionId,
                    requestId: originalRequestId,
                    status: "completed",
                    answer: "Ответ восстановлен по исходному ID.",
                }),
            );
        });
        await waitFor(() =>
            expect(secondHook.result.current.deliveryState).toBe(
                "completed",
            ),
        );
        expect(secondHook.result.current.messages[1]).toMatchObject({
            requestId: originalRequestId,
            content: "Ответ восстановлен по исходному ID.",
            deliveryState: "completed",
        });
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();

        secondHook.unmount();
    });

    it("clears an inaccessible pending journal without republishing it", async () => {
        const firstHook = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(firstHook.result.current.isHistoryLoading).toBe(false),
        );
        await act(async () => {
            await firstHook.result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });
        const previousSessionId = firstHook.result.current.sessionId;
        firstHook.unmount();

        getHistoryMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Сессия принадлежит другому owner."),
            )
            .mockResolvedValueOnce({
                session_id: "replacement-session",
                turns: [],
                next_before_sequence: null,
            });
        const secondHook = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(secondHook.result.current.sessionId).not.toBe(
                previousSessionId,
            );
            expect(secondHook.result.current.isHistoryLoading).toBe(false);
        });
        expect(sendMessageMock).toHaveBeenCalledOnce();
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            secondHook.result.current.messages.some(
                (message) => message.deliveryStatus === "rejected",
            ),
        ).toBe(false);

        secondHook.unmount();
    });

    it("validates a long message before optimistic append", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage("а".repeat(4001));
        });

        expect(sendResult).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });
        expect(result.current.error).toBe(
            "Сообщение не должно превышать 4000 символов.",
        );
        expect(result.current.messages).toEqual([]);
        expect(sendMessageMock).not.toHaveBeenCalled();
        expect(FakeEventSource.instances).toEqual([]);

        unmount();
    });

    it.each([422, 429])(
        "marks an HTTP %s rejection as not delivered and requests draft restoration",
        async (statusCode) => {
            sendMessageMock.mockRejectedValueOnce(
                new ApiRequestError(statusCode, "Сообщение отклонено."),
            );
            const { result, unmount } = renderHook(() => useVeraChat());

            await waitFor(() => expect(result.current.sessionId).toBeTruthy());
            let sendResult;
            await act(async () => {
                sendResult = await result.current.sendMessage(
                    "Расскажите об отпуске.",
                );
            });

            expect(sendResult).toEqual({
                outcome: "rejected",
                restoreDraft: true,
            });
            expect(result.current.messages).toHaveLength(1);
            expect(result.current.messages[0]).toMatchObject({
                role: "user",
                content: "Расскажите об отпуске.",
                deliveryStatus: "rejected",
            });
            expect(result.current.error).toBe("Сообщение отклонено.");
            expect(result.current.deliveryState).toBe("failed");
            expect(FakeEventSource.instances).toEqual([]);
            expect(
                window.sessionStorage.getItem("vera_pending_request"),
            ).toBeNull();

            const rejectedRequestId =
                sendMessageMock.mock.calls[0][0].request_id;
            await act(async () => {
                await result.current.sendMessage("Исправленный вопрос.");
            });
            expect(sendMessageMock).toHaveBeenCalledTimes(2);
            expect(sendMessageMock.mock.calls[1][0].request_id).not.toBe(
                rejectedRequestId,
            );
            expect(FakeEventSource.instances).toHaveLength(1);

            unmount();
        },
    );

    it("reconciles absent, processing and completed history by the original request_id", async () => {
        sendMessageMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        vi.useFakeTimers();
        getHistoryMock.mockResolvedValueOnce({
            session_id: result.current.sessionId,
            turns: [],
            next_before_sequence: null,
        });
        getHistoryMock.mockImplementationOnce(async (sessionId, options) => {
            expect(options.signal).toBeInstanceOf(AbortSignal);
            return historyWithTurn({
                sessionId,
                requestId: sendMessageMock.mock.calls[0][0].request_id,
                status: "processing",
                answer: null,
            });
        });
        getHistoryMock.mockImplementationOnce(async (sessionId) => {
            return historyWithTurn({
                sessionId,
                requestId: sendMessageMock.mock.calls[0][0].request_id,
                status: "completed",
                answer: "Ответ найден в истории.",
            });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.deliveryState).toBe("submitting");

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(result.current.deliveryState).toBe("processing");
        expect(result.current.messages[0].deliveryStatus).toBe("sent");
        expect(result.current.messages[1].streaming).toBe(true);

        let sendResult;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
            sendResult = await sendPromise;
        });

        expect(sendResult).toEqual({
            outcome: "accepted",
            restoreDraft: false,
        });
        const originalRequestId = sendMessageMock.mock.calls[0][0].request_id;
        expect(getHistoryMock).toHaveBeenLastCalledWith(
            result.current.sessionId,
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            deliveryStatus: "sent",
        });
        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            requestId: originalRequestId,
            content: "Ответ найден в истории.",
            streaming: false,
            feedbackEligible: true,
            deliveryState: "completed",
        });
        expect(result.current.deliveryState).toBe("completed");
        expect(FakeEventSource.instances).toEqual([]);

        unmount();
    });

    it("keeps an unresolved request unknown and refuses to create a second request_id", async () => {
        vi.useFakeTimers();
        sendMessageMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.sessionId).toBeTruthy();

        let firstSendResult;
        await act(async () => {
            const firstSend = result.current.sendMessage(
                "Расскажите об отпуске.",
            );
            await vi.advanceTimersByTimeAsync(30_000);
            firstSendResult = await firstSend;
        });

        expect(firstSendResult).toEqual({
            outcome: "unknown",
            restoreDraft: false,
        });
        expect(result.current.deliveryState).toBe("unknown");
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            deliveryStatus: "unknown",
        });
        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            streaming: false,
            deliveryState: "unknown",
        });
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).not.toBeNull();

        const originalRequestId = sendMessageMock.mock.calls[0][0].request_id;
        let secondSendResult;
        await act(async () => {
            secondSendResult =
                await result.current.sendMessage("Повторить вопрос.");
        });

        expect(secondSendResult).toEqual({
            outcome: "unknown",
            restoreDraft: false,
        });
        expect(sendMessageMock).toHaveBeenCalledOnce();
        expect(sendMessageMock.mock.calls[0][0].request_id).toBe(
            originalRequestId,
        );

        unmount();
    });

    it("starts the 30-second lookup window after a delayed POST failure", async () => {
        vi.useFakeTimers();
        sendMessageMock.mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    setTimeout(
                        () => reject(new TypeError("Failed to fetch")),
                        15_000,
                    );
                }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(15_000);
        });
        expect(result.current.deliveryState).toBe("submitting");

        await act(async () => {
            await vi.advanceTimersByTimeAsync(29_999);
        });
        expect(result.current.deliveryState).toBe("submitting");

        let sendResult;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
            sendResult = await sendPromise;
        });
        expect(sendResult).toEqual({
            outcome: "unknown",
            restoreDraft: false,
        });
        expect(result.current.deliveryState).toBe("unknown");

        unmount();
    });

    it("aborts reconciliation on unmount and ignores a late history result", async () => {
        sendMessageMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        let reconciliationSignal!: AbortSignal;
        let resolveHistory!: (value: ReturnType<typeof historyWithTurn>) => void;
        getHistoryMock.mockImplementationOnce(
            (sessionId, options) =>
                new Promise((resolve) => {
                    reconciliationSignal = options.signal;
                    resolveHistory = resolve;
                    expect(sessionId).toBe(result.current.sessionId);
                }),
        );

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });
        await waitFor(() => expect(reconciliationSignal).toBeDefined());

        unmount();
        expect(reconciliationSignal.aborted).toBe(true);
        resolveHistory(
            historyWithTurn({
                sessionId: "conversation-1",
                requestId: sendMessageMock.mock.calls[0][0].request_id,
                status: "completed",
                answer: "Слишком поздний ответ.",
            }),
        );
        await sendPromise;

        expect(FakeEventSource.instances).toEqual([]);
    });

    it.each([
        ["generation_failed", "failed", null],
        ["stream_interrupted", "failed", "Частичный ответ"],
        ["delivery_unconfirmed", "unknown", null],
        ["future_status", "unknown", null],
    ] as const)(
        "maps reconciled history status %s to %s without resending",
        async (historyStatus, expectedState, answer) => {
            sendMessageMock.mockRejectedValueOnce(
                new TypeError("Failed to fetch"),
            );
            const { result, unmount } = renderHook(() => useVeraChat());

            await waitFor(() =>
                expect(result.current.isHistoryLoading).toBe(false),
            );
            getHistoryMock.mockImplementationOnce(async (sessionId) =>
                historyWithTurn({
                    sessionId,
                    requestId:
                        sendMessageMock.mock.calls[0][0].request_id,
                    status: historyStatus,
                    answer,
                }),
            );

            let sendResult;
            await act(async () => {
                sendResult = await result.current.sendMessage(
                    "Расскажите об отпуске.",
                );
            });

            expect(sendResult).toEqual({
                outcome: "accepted",
                restoreDraft: false,
            });
            expect(sendMessageMock).toHaveBeenCalledOnce();
            expect(FakeEventSource.instances).toEqual([]);
            expect(result.current.messages).toHaveLength(2);
            expect(result.current.messages[0].deliveryStatus).toBe("sent");
            expect(result.current.messages[1]).toMatchObject({
                role: "assistant",
                content: answer ?? "",
                streaming: false,
                deliveryState: expectedState,
                feedbackEligible: false,
            });
            expect(result.current.deliveryState).toBe(expectedState);

            unmount();
        },
    );

    it.each([401, 403, 500])(
        "reconciles HTTP %s instead of marking the user message rejected",
        async (statusCode) => {
            sendMessageMock.mockRejectedValueOnce(
                new ApiRequestError(statusCode, "Неоднозначный ответ BFF."),
            );
            const { result, unmount } = renderHook(() => useVeraChat());

            await waitFor(() =>
                expect(result.current.isHistoryLoading).toBe(false),
            );
            getHistoryMock.mockImplementationOnce(async (sessionId) =>
                historyWithTurn({
                    sessionId,
                    requestId:
                        sendMessageMock.mock.calls[0][0].request_id,
                    status: "completed",
                    answer: "Запрос всё же был принят.",
                }),
            );

            await act(async () => {
                await result.current.sendMessage("Расскажите об отпуске.");
            });

            expect(result.current.messages[0].deliveryStatus).toBe("sent");
            expect(result.current.messages[0].deliveryStatus).not.toBe(
                "rejected",
            );
            expect(result.current.deliveryState).toBe("completed");
            expect(sendMessageMock).toHaveBeenCalledOnce();

            unmount();
        },
    );

    it("restores completed turns and their ratings from history", async () => {
        getHistoryMock.mockResolvedValue({
            session_id: "conversation-1",
            turns: [
                {
                    request_id: "request-1",
                    sequence_number: 1,
                    question: "Какая продолжительность отпуска?",
                    answer: "Продолжительность зависит от условий.",
                    status: "completed",
                    feedback_value: "down",
                    created_at: "2026-07-29T12:00:00Z",
                    completed_at: "2026-07-29T12:00:05Z",
                },
            ],
        });
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.messages).toHaveLength(2);
        });

        expect(result.current.messages).toEqual([
            {
                id: "request-1:user",
                role: "user",
                content: "Какая продолжительность отпуска?",
                deliveryStatus: "sent",
            },
            {
                id: "request-1:assistant",
                role: "assistant",
                content: "Продолжительность зависит от условий.",
                requestId: "request-1",
                streaming: false,
                feedbackEligible: true,
                feedbackValue: "down",
                deliveryState: "completed",
            },
        ]);
        expect(result.current.announcement).toBe(
            "История диалога восстановлена.",
        );

        unmount();
    });

    it("restores failed and unknown assistant bubbles from terminal history", async () => {
        getHistoryMock.mockResolvedValue({
            session_id: "conversation-1",
            turns: [
                {
                    request_id: "request-failed",
                    sequence_number: 1,
                    question: "Первый вопрос",
                    answer: null,
                    status: "generation_failed",
                    feedback_value: null,
                    created_at: "2026-08-10T10:00:00Z",
                    completed_at: "2026-08-10T10:00:05Z",
                },
                {
                    request_id: "request-partial",
                    sequence_number: 2,
                    question: "Второй вопрос",
                    answer: "Неполный ответ",
                    status: "stream_interrupted",
                    feedback_value: null,
                    created_at: "2026-08-10T10:01:00Z",
                    completed_at: "2026-08-10T10:01:05Z",
                },
                {
                    request_id: "request-unknown",
                    sequence_number: 3,
                    question: "Третий вопрос",
                    answer: null,
                    status: "delivery_unconfirmed",
                    feedback_value: null,
                    created_at: "2026-08-10T10:02:00Z",
                    completed_at: "2026-08-10T10:02:05Z",
                },
            ],
            next_before_sequence: null,
        });
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );

        expect(result.current.messages).toHaveLength(6);
        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            content: "",
            deliveryState: "failed",
            feedbackEligible: false,
        });
        expect(result.current.messages[3]).toMatchObject({
            role: "assistant",
            content: "Неполный ответ",
            deliveryState: "failed",
            feedbackEligible: false,
        });
        expect(result.current.messages[5]).toMatchObject({
            role: "assistant",
            content: "",
            deliveryState: "unknown",
            feedbackEligible: false,
        });

        unmount();
    });

    it("uses the authenticated user's current server session", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({
                id: "local-session",
                createdAt: Date.now(),
            }),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "server-session",
        });
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.sessionId).toBe("server-session");
            expect(getHistoryMock).toHaveBeenCalledWith(
                "server-session",
                expect.any(Object),
            );
        });

        unmount();
    });

    it("waits for authentication hydration before resolving the session", async () => {
        useAuthStore.setState({ isLoading: true });
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        expect(getCurrentSessionMock).not.toHaveBeenCalled();
        expect(result.current.sessionId).toBe("");

        act(() => {
            useAuthStore.setState({ isLoading: false });
        });

        await waitFor(() => {
            expect(getCurrentSessionMock).toHaveBeenCalledOnce();
            expect(result.current.sessionId).toBeTruthy();
        });

        unmount();
    });

    it("treats an initial history 404 as an empty session without rotating it", async () => {
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(404, "Сессия не найдена."),
        );
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(getHistoryMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        const requestedSessionId = getHistoryMock.mock.calls[0][0];
        expect(result.current.sessionId).toBe(requestedSessionId);
        expect(result.current.messages).toEqual([]);
        expect(result.current.historyError).toBeNull();

        unmount();
    });

    it("rotates an unconfirmed session after a history 401", async () => {
        getHistoryMock
            .mockRejectedValueOnce(
                new ApiRequestError(401, "Сессия чата не подтверждена."),
            )
            .mockResolvedValueOnce({
                session_id: "new-session",
                turns: [],
                next_before_sequence: null,
            });
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(getHistoryMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(getHistoryMock.mock.calls[0][0]).not.toBe(
            getHistoryMock.mock.calls[1][0],
        );

        unmount();
    });

    it("prepends an older cursor page without duplicating current messages", async () => {
        getHistoryMock
            .mockResolvedValueOnce({
                session_id: "conversation-1",
                turns: [
                    {
                        request_id: "request-2",
                        sequence_number: 2,
                        question: "Новый вопрос",
                        answer: "Новый ответ",
                        status: "completed",
                        feedback_value: null,
                        created_at: "2026-07-29T12:01:00Z",
                        completed_at: "2026-07-29T12:01:05Z",
                    },
                ],
                next_before_sequence: 2,
            })
            .mockResolvedValueOnce({
                session_id: "conversation-1",
                turns: [
                    {
                        request_id: "request-1",
                        sequence_number: 1,
                        question: "Старый вопрос",
                        answer: "Старый ответ",
                        status: "completed",
                        feedback_value: null,
                        created_at: "2026-07-29T12:00:00Z",
                        completed_at: "2026-07-29T12:00:05Z",
                    },
                ],
                next_before_sequence: null,
            });
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.hasOlderHistory).toBe(true));
        await act(async () => {
            await result.current.loadOlderHistory();
        });

        expect(
            result.current.messages.map((message) => message.content),
        ).toEqual([
            "Старый вопрос",
            "Старый ответ",
            "Новый вопрос",
            "Новый ответ",
        ]);
        expect(result.current.hasOlderHistory).toBe(false);

        unmount();
    });

    it("aborts an older-history page when the authenticated session changes", async () => {
        getCurrentSessionMock
            .mockResolvedValueOnce({ session_id: "session-1" })
            .mockResolvedValueOnce({ session_id: "session-2" });
        getHistoryMock.mockResolvedValueOnce({
            session_id: "session-1",
            turns: [
                {
                    request_id: "request-2",
                    sequence_number: 2,
                    question: "Текущий вопрос",
                    answer: "Текущий ответ",
                    status: "completed",
                    feedback_value: null,
                    created_at: "2026-08-10T10:00:00Z",
                    completed_at: "2026-08-10T10:00:05Z",
                },
            ],
            next_before_sequence: 2,
        });
        let olderSignal!: AbortSignal;
        let resolveOlderHistory!: (value: ReturnType<typeof historyWithTurn>) => void;
        getHistoryMock.mockImplementationOnce(
            (_sessionId, options) =>
                new Promise((resolve) => {
                    olderSignal = options.signal;
                    resolveOlderHistory = resolve;
                }),
        );
        getHistoryMock.mockResolvedValueOnce({
            session_id: "session-2",
            turns: [],
            next_before_sequence: null,
        });
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.sessionId).toBe("session-1");
            expect(result.current.hasOlderHistory).toBe(true);
        });
        act(() => {
            void result.current.loadOlderHistory();
        });
        await waitFor(() => expect(olderSignal).toBeDefined());

        act(() => {
            useAuthStore.setState({
                user: {
                    email: "new-user@example.com",
                    first_name: "Новый",
                    last_name: "Пользователь",
                },
                isAuthenticated: true,
            });
        });
        await waitFor(() => {
            expect(result.current.sessionId).toBe("session-2");
            expect(result.current.isHistoryLoading).toBe(false);
        });
        expect(olderSignal.aborted).toBe(true);
        expect(result.current.messages).toEqual([]);
        expect(result.current.hasOlderHistory).toBe(false);

        await act(async () => {
            resolveOlderHistory(
                historyWithTurn({
                    sessionId: "session-1",
                    requestId: "request-1",
                    status: "completed",
                    answer: "Старый ответ не должен попасть в новую сессию.",
                }),
            );
            await Promise.resolve();
        });
        expect(result.current.messages).toEqual([]);
        expect(result.current.hasOlderHistory).toBe(false);

        unmount();
    });

    it("announces short response states without reading the full answer", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        const payload = sendMessageMock.mock.calls[0][0];
        expect(result.current.announcement).toBe(
            "Ассистент Вера готовит ответ.",
        );
        expect(result.current.deliveryState).toBe("accepted");

        act(() => {
            FakeEventSource.instances[0].open();
        });
        expect(result.current.deliveryState).toBe("processing");

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "Работнику положен отпуск.",
            });
            flushAnimationFrames();
        });

        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            content: "Работнику положен отпуск.",
            requestId: payload.request_id,
            streaming: true,
            feedbackEligible: false,
            deliveryState: "streaming",
        });
        expect(result.current.deliveryState).toBe("streaming");

        act(() => {
            FakeEventSource.instances[0].emit({ type: "done" });
        });

        expect(result.current.announcement).toBe(
            "Ответ Ассистента Веры готов.",
        );
        expect(result.current.announcement).not.toContain(
            "Работнику положен отпуск.",
        );
        expect(result.current.messages[1].streaming).toBe(false);
        expect(result.current.messages[1].feedbackEligible).toBe(true);
        expect(result.current.messages[1].deliveryState).toBe("completed");
        expect(result.current.deliveryState).toBe("completed");
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();

        unmount();
    });

    it("batches tokens per animation frame and flushes the last batch on done", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "Первая ",
            });
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "часть.",
            });
        });

        expect(requestAnimationFrame).toHaveBeenCalledOnce();
        expect(result.current.messages[1].content).toBe("");

        act(() => {
            flushAnimationFrames();
        });
        expect(result.current.messages[1].content).toBe("Первая часть.");

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: " Последняя часть.",
            });
            FakeEventSource.instances[0].emit({ type: "done" });
        });

        expect(result.current.messages[1]).toMatchObject({
            content: "Первая часть. Последняя часть.",
            streaming: false,
            feedbackEligible: true,
        });
        expect(animationFrames.size).toBe(0);

        unmount();
    });

    it("preserves an empty pending answer when the accepted SSE connection fails", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        await act(async () => {
            await result.current.sendMessage("Расскажите о квотах.");
        });

        act(() => {
            FakeEventSource.instances[0].fail();
        });

        expect(result.current.status).toBe("unavailable");
        expect(result.current.announcement).toBe("");
        expect(result.current.error).toBe(
            "Не удалось получить ответ Ассистента Веры. Проверьте соединение.",
        );
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            content: "",
            streaming: false,
            deliveryState: "unknown",
        });
        expect(result.current.deliveryState).toBe("unknown");

        unmount();
    });

    it("keeps a partial answer but stops its streaming state after an SSE failure", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        await act(async () => {
            await result.current.sendMessage("Расскажите о квотах.");
        });

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "Квота зависит",
            });
            FakeEventSource.instances[0].fail();
        });

        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            content: "Квота зависит",
            streaming: false,
            feedbackEligible: false,
            deliveryState: "unknown",
        });
        expect(result.current.deliveryState).toBe("unknown");
        expect(result.current.announcement).toBe("");

        unmount();
    });

    it("reconciles a terminal SSE error and preserves a partial failed answer", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        await act(async () => {
            await result.current.sendMessage("Расскажите о квотах.");
        });
        getHistoryMock.mockImplementationOnce(async (sessionId) =>
            historyWithTurn({
                sessionId,
                requestId: sendMessageMock.mock.calls[0][0].request_id,
                status: "generation_failed",
                answer: "Частичный ответ",
            }),
        );

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "Частичный ответ",
            });
            flushAnimationFrames();
            FakeEventSource.instances[0].emit({
                type: "error",
                detail: "Генерация завершилась ошибкой.",
            });
        });

        await waitFor(() =>
            expect(result.current.deliveryState).toBe("failed"),
        );
        expect(result.current.status).toBe("idle");
        expect(result.current.error).toBe(
            "Ассистенту Вере не удалось подготовить ответ.",
        );
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1]).toMatchObject({
            content: "Частичный ответ",
            streaming: false,
            deliveryState: "failed",
            feedbackEligible: false,
        });

        unmount();
    });

    it("maps a live SSE error with delivery_unconfirmed history to unknown", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        await act(async () => {
            await result.current.sendMessage(
                "Отправьте консультацию на почту.",
            );
        });
        getHistoryMock.mockImplementationOnce(async (sessionId) =>
            historyWithTurn({
                sessionId,
                requestId: sendMessageMock.mock.calls[0][0].request_id,
                status: "delivery_unconfirmed",
                answer: "Консультация подготовлена.",
            }),
        );

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "error",
                detail: "Доставка результата не подтверждена.",
            });
        });

        await waitFor(() =>
            expect(result.current.deliveryState).toBe("unknown"),
        );
        expect(result.current.messages[0].deliveryStatus).toBe("sent");
        expect(result.current.messages[1]).toMatchObject({
            content: "Консультация подготовлена.",
            streaming: false,
            deliveryState: "unknown",
        });
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();

        unmount();
    });

    it("allows native EventSource reconnect while inactivity watchdog stays active", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Расскажите о квотах.");
        });

        act(() => {
            vi.advanceTimersByTime(15_000);
            FakeEventSource.instances[0].emit({
                type: "heartbeat",
                ts: 1_723_296_000,
            });
            FakeEventSource.instances[0].disconnect();
            vi.advanceTimersByTime(44_999);
        });

        expect(FakeEventSource.instances[0].closed).toBe(false);
        expect(result.current.status).toBe("long-running");
        expect(result.current.error).toBeNull();

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "Соединение восстановлено.",
            });
        });
        act(() => {
            flushAnimationFrames();
        });

        expect(result.current.status).toBe("streaming");

        act(() => {
            FakeEventSource.instances[0].emit({ type: "done" });
        });
        expect(result.current.status).toBe("idle");
        expect(result.current.messages[1].content).toBe(
            "Соединение восстановлено.",
        );

        unmount();
    });

    it.each([
        ["malformed JSON", "{"],
        ["an invalid event", JSON.stringify({ type: "token" })],
        ["an invalid heartbeat", JSON.stringify({ type: "heartbeat" })],
    ])("handles %s from SSE as a controlled error", async (_name, data) => {
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        await act(async () => {
            await result.current.sendMessage("Расскажите о квотах.");
        });

        act(() => {
            FakeEventSource.instances[0].emitRaw(data);
        });

        expect(FakeEventSource.instances[0].closed).toBe(true);
        expect(result.current.status).toBe("unavailable");
        expect(result.current.announcement).toBe("");
        expect(result.current.error).toBe(
            "Не удалось обработать ответ Ассистента Веры. Попробуйте ещё раз.",
        );
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            content: "",
            streaming: false,
            deliveryState: "unknown",
        });

        unmount();
    });

    it("closes the stream when the first event does not arrive within 30 seconds", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        act(() => {
            vi.advanceTimersByTime(29_999);
        });
        expect(FakeEventSource.instances[0].closed).toBe(false);
        expect(result.current.error).toBeNull();

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(result.current.status).toBe("unavailable");
        expect(result.current.announcement).toBe("");
        expect(result.current.error).toBe(
            "Ассистент Вера не начал отвечать. Попробуйте позже.",
        );
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1]).toMatchObject({
            role: "assistant",
            streaming: false,
            deliveryState: "unknown",
        });

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "heartbeat",
                ts: 1_723_296_000,
            });
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "слишком поздно",
            });
            flushAnimationFrames();
        });
        expect(result.current.status).toBe("unavailable");
        expect(result.current.messages).toHaveLength(2);

        unmount();
    });

    it("uses heartbeat as silent activity and resets the inactivity timeout", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Отправьте консультацию на почту.");
        });

        act(() => {
            vi.advanceTimersByTime(15_000);
            FakeEventSource.instances[0].emit({
                type: "heartbeat",
                ts: 1_723_296_000,
            });
        });

        expect(result.current.status).toBe("long-running");
        expect(result.current.announcement).toBe(
            "Ассистент Вера готовит ответ.",
        );
        expect(result.current.messages[1].content).toBe("");

        act(() => {
            vi.advanceTimersByTime(44_999);
        });
        expect(FakeEventSource.instances[0].closed).toBe(false);

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "heartbeat",
                ts: 1_723_296_045,
            });
            vi.advanceTimersByTime(44_999);
            FakeEventSource.instances[0].emit({
                type: "future_progress",
                percent: 90,
            });
        });
        expect(FakeEventSource.instances[0].closed).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.status).toBe("unavailable");
        expect(result.current.error).toContain(
            "Поток ответа перестал обновляться",
        );

        unmount();
    });

    it("resets inactivity on tokens and preserves a partial answer on timeout", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Расскажите о квотах.");
        });

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "heartbeat",
                ts: 1_723_296_000,
            });
        });
        expect(result.current.status).toBe("long-running");

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "Первая ",
            });
            flushAnimationFrames();
            vi.advanceTimersByTime(44_999);
        });
        expect(result.current.status).toBe("streaming");
        expect(FakeEventSource.instances[0].closed).toBe(false);

        act(() => {
            FakeEventSource.instances[0].emit({
                type: "token",
                content: "часть.",
            });
            flushAnimationFrames();
            vi.advanceTimersByTime(44_999);
        });
        expect(FakeEventSource.instances[0].closed).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.messages[1]).toMatchObject({
            content: "Первая часть.",
            streaming: false,
            feedbackEligible: false,
        });
        expect(result.current.error).toContain(
            "Поток ответа перестал обновляться",
        );

        unmount();
    });

    it("ignores an unknown event without extending the first-event timeout", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        act(() => {
            vi.advanceTimersByTime(29_000);
            FakeEventSource.instances[0].emit({
                type: "future_progress",
                percent: 10,
            });
        });

        expect(FakeEventSource.instances[0].closed).toBe(false);
        expect(result.current.status).toBe("waiting");
        expect(result.current.announcement).toBe(
            "Ассистент Вера готовит ответ.",
        );
        expect(result.current.error).toBeNull();

        act(() => {
            vi.advanceTimersByTime(1_000);
        });
        expect(FakeEventSource.instances[0].closed).toBe(true);
        expect(result.current.error).toBe(
            "Ассистент Вера не начал отвечать. Попробуйте позже.",
        );

        unmount();
    });

    it("keeps the overall deadline independent from heartbeats", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Отправьте консультацию на почту.");
        });

        for (let index = 1; index <= 29; index += 1) {
            act(() => {
                vi.advanceTimersByTime(15_000);
                FakeEventSource.instances[0].emit({
                    type: "heartbeat",
                    ts: 1_723_296_000 + index * 15,
                });
            });
        }

        act(() => {
            vi.advanceTimersByTime(14_999);
        });
        expect(FakeEventSource.instances[0].closed).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(FakeEventSource.instances[0].closed).toBe(true);
        expect(result.current.error).toContain(
            "Ответ готовится дольше ожидаемого",
        );

        unmount();
    });

    it("does not run watchdogs again after a terminal event", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        act(() => {
            FakeEventSource.instances[0].emit({ type: "done" });
            vi.advanceTimersByTime(450_000);
            FakeEventSource.instances[0].fail();
        });

        expect(result.current.status).toBe("idle");
        expect(result.current.error).toBeNull();
        expect(result.current.announcement).toBe(
            "Ответ Ассистента Веры готов.",
        );

        unmount();
    });
});
