import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    getCurrentSessionMock,
    getHistoryMock,
    resolveSessionMock,
    sendMessageMock,
} = vi.hoisted(() => ({
        getCurrentSessionMock: vi.fn(),
        getHistoryMock: vi.fn(),
        resolveSessionMock: vi.fn(),
        sendMessageMock: vi.fn(),
    }));

vi.mock("@/lib/api/vera", () => ({
    veraApi: {
        getCurrentSession: getCurrentSessionMock,
        getHistory: getHistoryMock,
        resolveSession: resolveSessionMock,
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

function acceptedReceipt(data: { request_id: string; session_id?: string }) {
    return {
        request_id: data.request_id,
        stream_ticket: "signed.ticket",
        stream_url: `/vera/sse/${encodeURIComponent(data.request_id)}`,
        session_id: data.session_id ?? "conversation-1",
        previous_session_id: null,
        boundary: "retained" as const,
        session_ttl_seconds: 86_400,
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
        resolveSessionMock.mockReset().mockImplementation(async (data) => ({
            session_id: data.session_id,
            previous_session_id: null,
            boundary: "retained",
            session_ttl_seconds: 86_400,
        }));
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
        vi.restoreAllMocks();
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

    it("stores the lifecycle operation before the pending message and rolls it back if the message journal fails", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        const originalSetItem = Storage.prototype.setItem;
        const writes: string[] = [];
        const setItemSpy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(function (key, value) {
                writes.push(key);
                if (key === "vera_pending_request") {
                    throw new DOMException("Storage full", "QuotaExceededError");
                }
                return originalSetItem.call(this, key, value);
            });

        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage(
                "Вопрос при заполненном хранилище.",
            );
        });

        expect(
            writes.lastIndexOf("vera_pending_session_resolution"),
        ).toBeLessThan(writes.lastIndexOf("vera_pending_request"));
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(sendMessageMock).not.toHaveBeenCalled();
        expect(result.current.messages).toEqual([]);
        expect(sendResult).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });

        setItemSpy.mockRestore();
        unmount();
    });

    it.each([400, 401, 403, 409, 422, 429])(
        "marks an HTTP %s rejection as not delivered and requests draft restoration",
        async (statusCode) => {
            sendMessageMock.mockRejectedValueOnce(
                new ApiRequestError(statusCode, "Сообщение отклонено."),
            );
            const { result, unmount } = renderHook(() => useVeraChat());

            await waitFor(() => expect(result.current.sessionId).toBeTruthy());
            const rejectedSessionId = result.current.sessionId;
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
            if (statusCode === 403 || statusCode === 409) {
                expect(result.current.sessionId).not.toBe(rejectedSessionId);
                expect(result.current.messages).toEqual([]);
                expect(result.current.previousSessionGroups).toContainEqual(
                    expect.objectContaining({
                        sessionId: rejectedSessionId,
                        messages: expect.arrayContaining([
                            expect.objectContaining({
                                role: "user",
                                content: "Расскажите об отпуске.",
                                deliveryStatus: "unknown",
                            }),
                        ]),
                    }),
                );
                expect(result.current.error).toContain(
                    "Не удалось восстановить незавершённую отправку",
                );
            } else {
                expect(result.current.messages).toHaveLength(1);
                expect(result.current.messages[0]).toMatchObject({
                    role: "user",
                    content: "Расскажите об отпуске.",
                    deliveryStatus: "rejected",
                });
                expect(result.current.error).toBe("Сообщение отклонено.");
            }
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

    it("treats a 5xx not-published marker as definite and keeps its lifecycle boundary", async () => {
        sendMessageMock.mockImplementationOnce((data) =>
            Promise.reject(
                new ApiRequestError(503, "Публикация не началась.", {
                    publishState: "not_published",
                    lifecycle: {
                        session_id: data.request_id,
                        previous_session_id: data.session_id,
                        boundary: "expired",
                        session_ttl_seconds: 86_400,
                    },
                }),
            ),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        const previousSessionId = result.current.sessionId;
        const historyCallsBeforeSend = getHistoryMock.mock.calls.length;

        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage(
                "Вопрос без публикации.",
            );
        });
        const requestId = sendMessageMock.mock.calls[0][0].request_id;

        expect(sendResult).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });
        expect(result.current.sessionId).toBe(requestId);
        expect(result.current.previousSessionGroups[0]?.sessionId).toBe(
            previousSessionId,
        );
        expect(result.current.messages).toEqual([
            expect.objectContaining({
                content: "Вопрос без публикации.",
                deliveryStatus: "rejected",
            }),
        ]);
        expect(getHistoryMock).toHaveBeenCalledTimes(historyCallsBeforeSend);
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        unmount();
    });

    it("rejects a marker-only 5xx without discarding its exact lifecycle operation", async () => {
        sendMessageMock.mockRejectedValueOnce(
            new ApiRequestError(503, "Публикация не началась.", {
                publishState: "not_published",
            }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => expect(result.current.sessionId).toBeTruthy());

        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage(
                "Вопрос до подтверждения lifecycle.",
            );
        });
        const firstPublication = sendMessageMock.mock.calls[0][0];

        expect(sendResult).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            JSON.parse(
                window.sessionStorage.getItem(
                    "vera_pending_session_resolution",
                ) ?? "{}",
            ),
        ).toEqual({
            sessionId: firstPublication.session_id,
            replacementSessionId: firstPublication.request_id,
        });

        await act(async () => {
            await result.current.sendMessage("Следующий вопрос.");
        });

        expect(resolveSessionMock.mock.calls[2][0]).toEqual({
            session_id: firstPublication.session_id,
            replacement_session_id: firstPublication.request_id,
        });
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();
        expect(sendMessageMock).toHaveBeenCalledTimes(2);

        unmount();
    });

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

    it("resolves an ambiguous chat rollover before polling the effective history", async () => {
        sendMessageMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        const predecessorSessionId = result.current.sessionId;
        const historyCallsBeforeSend = getHistoryMock.mock.calls.length;
        resolveSessionMock
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }))
            .mockImplementationOnce(async (data) => ({
                session_id: data.replacement_session_id,
                previous_session_id: data.session_id,
                boundary: "expired",
                session_ttl_seconds: 86_400,
            }));
        getHistoryMock.mockImplementation(async (sessionId) => {
            const publication = sendMessageMock.mock.calls[0]?.[0];
            return publication?.request_id === sessionId
                ? historyWithTurn({
                      sessionId,
                      requestId: publication.request_id,
                      status: "completed",
                      answer: "Ответ найден в сессии-преемнике.",
                  })
                : {
                      session_id: sessionId,
                      turns: [],
                      next_before_sequence: null,
                  };
        });

        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage(
                "Вопрос с потерянным rollover receipt.",
            );
        });
        const publication = sendMessageMock.mock.calls[0][0];

        expect(resolveSessionMock.mock.calls[2][0]).toEqual({
            session_id: predecessorSessionId,
            replacement_session_id: publication.request_id,
        });
        expect(result.current.sessionId).toBe(publication.request_id);
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: predecessorSessionId,
            }),
        );
        expect(
            getHistoryMock.mock.calls
                .slice(historyCallsBeforeSend)
                .map(([sessionId]) => sessionId),
        ).toEqual([publication.request_id]);
        expect(result.current.messages[1]).toMatchObject({
            content: "Ответ найден в сессии-преемнике.",
            deliveryState: "completed",
        });
        expect(sendResult).toEqual({
            outcome: "accepted",
            restoreDraft: false,
        });
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

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

        const publication = sendMessageMock.mock.calls[0][0];
        const originalRequestId = publication.request_id;
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toContain(originalRequestId);
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
        vi.useRealTimers();
        const reloadResolveCallIndex = resolveSessionMock.mock.calls.length;
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Exact recovery window expired."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "created",
                session_ttl_seconds: 86_400,
            }));
        const recoveredHook = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(recoveredHook.result.current.isHistoryLoading).toBe(false);
            expect(
                recoveredHook.result.current.previousSessionGroups,
            ).toContainEqual(
                expect.objectContaining({
                    sessionId: publication.session_id,
                }),
            );
        });
        expect(
            resolveSessionMock.mock.calls.at(reloadResolveCallIndex)?.[0],
        ).toEqual({
            session_id: publication.session_id,
            replacement_session_id: originalRequestId,
        });
        expect(
            recoveredHook.result.current.previousSessionGroups[0]?.messages,
        ).toContainEqual(
            expect.objectContaining({
                content: "Расскажите об отпуске.",
                deliveryStatus: "unknown",
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        recoveredHook.unmount();
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

    it.each([500])(
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

    it("keeps a legacy stored session regardless of its createdAt age", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({
                id: "legacy-active-session",
                createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
            }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );

        expect(resolveSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                session_id: "legacy-active-session",
            }),
            expect.any(AbortSignal),
        );
        expect(result.current.sessionId).toBe("legacy-active-session");
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_session_id") ?? "{}",
            ),
        ).toEqual({ id: "legacy-active-session" });

        unmount();
    });

    it("stores a server replacement and preserves expired history separately", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "expired-session", createdAt: 1 }),
        );
        resolveSessionMock.mockResolvedValueOnce({
            session_id: "replacement-session",
            previous_session_id: "expired-session",
            boundary: "expired",
            session_ttl_seconds: 86_400,
        });
        getHistoryMock.mockImplementation(async (sessionId) =>
            sessionId === "expired-session"
                ? historyWithTurn({
                      sessionId,
                      requestId: "old-request",
                      status: "completed",
                      answer: "Ответ из завершённого диалога.",
                  })
                : {
                      session_id: sessionId,
                      turns: [],
                      next_before_sequence: null,
                  },
        );
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.sessionId).toBe("replacement-session");
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([
            {
                sessionId: "expired-session",
                historyCursor: null,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Ответ из завершённого диалога.",
                    }),
                ]),
            },
        ]);
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_session_id") ?? "{}",
            ),
        ).toEqual({ id: "replacement-session" });

        unmount();
    });

    it("archives a pending-only predecessor request when initialization expires it with a different successor", async () => {
        useAuthStore.setState({
            user: {
                email: "user@example.com",
                first_name: "User",
                last_name: "Example",
            },
            isAuthenticated: true,
            isLoading: false,
        });
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "pending-predecessor" }),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                sessionId: "pending-predecessor",
                requestId: "published-request",
                message: "Вопрос без lifecycle journal.",
                createdAt: Date.now() - 60_000,
            }),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "pending-predecessor",
        });
        resolveSessionMock.mockImplementationOnce(async (data) => ({
            session_id: data.replacement_session_id,
            previous_session_id: data.session_id,
            boundary: "expired",
            session_ttl_seconds: 86_400,
        }));
        getHistoryMock.mockImplementation(async (sessionId) => ({
            session_id: sessionId,
            turns: [],
            next_before_sequence: null,
        }));

        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.sessionId).not.toBe("pending-predecessor");
        });
        const initializationResolution = resolveSessionMock.mock.calls[0][0];
        expect(initializationResolution.replacement_session_id).not.toBe(
            "published-request",
        );
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: "pending-predecessor",
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Вопрос без lifecycle journal.",
                        deliveryStatus: "unknown",
                    }),
                ]),
            }),
        );
        expect(result.current.historyError).toContain(
            "Не удалось восстановить незавершённую отправку",
        );
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        unmount();
    });

    it("loads older pages for the preserved predecessor session", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "expired-session", createdAt: 1 }),
        );
        resolveSessionMock.mockResolvedValueOnce({
            session_id: "replacement-session",
            previous_session_id: "expired-session",
            boundary: "expired",
            session_ttl_seconds: 86_400,
        });
        getHistoryMock
            .mockResolvedValueOnce({
                ...historyWithTurn({
                    sessionId: "expired-session",
                    requestId: "request-2",
                    status: "completed",
                    answer: "Новый ответ старого диалога.",
                }),
                next_before_sequence: 2,
            })
            .mockResolvedValueOnce({
                session_id: "replacement-session",
                turns: [],
                next_before_sequence: null,
            })
            .mockResolvedValueOnce({
                ...historyWithTurn({
                    sessionId: "expired-session",
                    requestId: "request-1",
                    status: "completed",
                    answer: "Самый старый ответ.",
                }),
                next_before_sequence: null,
            });
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.previousSessionGroups[0]?.historyCursor).toBe(
                2,
            ),
        );

        await act(async () => {
            await result.current.loadOlderPreviousHistory(
                "expired-session",
            );
        });

        expect(getHistoryMock).toHaveBeenLastCalledWith(
            "expired-session",
            expect.objectContaining({ beforeSequence: 2 }),
        );
        expect(result.current.previousSessionGroups[0]).toMatchObject({
            historyCursor: null,
            messages: [
                expect.objectContaining({ id: "request-1:user" }),
                expect.objectContaining({ id: "request-1:assistant" }),
                expect.objectContaining({ id: "request-2:user" }),
                expect.objectContaining({ id: "request-2:assistant" }),
            ],
        });

        unmount();
    });

    it("resolves again before send and moves current messages behind a boundary", async () => {
        getHistoryMock.mockResolvedValue(
            historyWithTurn({
                sessionId: "conversation-1",
                requestId: "old-request",
                status: "completed",
                answer: "Старый ответ.",
            }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.messages).toHaveLength(2);
        });
        const originalSessionId = result.current.sessionId;

        resolveSessionMock.mockImplementationOnce(async (data) => ({
            session_id: data.replacement_session_id,
            previous_session_id: data.session_id,
            boundary: "expired",
            session_ttl_seconds: 86_400,
        }));

        await act(async () => {
            await result.current.sendMessage("Новый вопрос.");
        });

        const published = sendMessageMock.mock.calls[0][0];
        expect(result.current.sessionId).toBe(published.session_id);
        expect(published.session_id).not.toBe(originalSessionId);
        expect(result.current.previousSessionGroups[0]).toMatchObject({
            sessionId: originalSessionId,
            messages: [
                expect.objectContaining({ content: "Расскажите об отпуске." }),
                expect.objectContaining({ content: "Старый ответ." }),
            ],
        });
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            content: "Новый вопрос.",
        });

        unmount();
    });

    it("applies a defensive effective session from the accepted chat receipt", async () => {
        getHistoryMock.mockResolvedValue(
            historyWithTurn({
                sessionId: "conversation-1",
                requestId: "old-request",
                status: "completed",
                answer: "Старый ответ.",
            }),
        );
        sendMessageMock.mockImplementationOnce(async (data) => ({
            ...acceptedReceipt(data),
            session_id: data.request_id,
            previous_session_id: data.session_id,
            boundary: "expired",
        }));
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.messages).toHaveLength(2);
        });
        const originalSessionId = result.current.sessionId;

        await act(async () => {
            await result.current.sendMessage("Новый вопрос.");
        });

        const published = sendMessageMock.mock.calls[0][0];
        expect(result.current.sessionId).toBe(published.request_id);
        expect(result.current.previousSessionGroups[0]).toMatchObject({
            sessionId: originalSessionId,
            messages: [
                expect.objectContaining({ content: "Расскажите об отпуске." }),
                expect.objectContaining({ content: "Старый ответ." }),
            ],
        });
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            content: "Новый вопрос.",
        });

        unmount();
    });

    it.each(["pending remap", "effective session"] as const)(
        "keeps an exact expired-receipt replay journal when %s persistence fails",
        async (failedWrite) => {
            const firstHook = renderHook(() => useVeraChat());
            await waitFor(() =>
                expect(firstHook.result.current.isHistoryLoading).toBe(false),
            );
            const predecessorSessionId = firstHook.result.current.sessionId;
            sendMessageMock.mockImplementationOnce(async (data) => ({
                ...acceptedReceipt(data),
                session_id: data.request_id,
                previous_session_id: data.session_id,
                boundary: "expired" as const,
            }));
            const originalSetItem = Storage.prototype.setItem;
            const setItemSpy = vi
                .spyOn(Storage.prototype, "setItem")
                .mockImplementation(function (key, value) {
                    if (key === "vera_pending_request") {
                        const pending = JSON.parse(value) as {
                            sessionId?: string;
                        };
                        if (
                            failedWrite === "pending remap" &&
                            pending.sessionId !== predecessorSessionId
                        ) {
                            throw new DOMException(
                                "Storage full",
                                "QuotaExceededError",
                            );
                        }
                    }
                    if (key === "vera_session_id") {
                        const storedSession = JSON.parse(value) as {
                            id?: string;
                        };
                        if (
                            failedWrite === "effective session" &&
                            storedSession.id !== predecessorSessionId
                        ) {
                            throw new DOMException(
                                "Storage full",
                                "QuotaExceededError",
                            );
                        }
                    }
                    return originalSetItem.call(this, key, value);
                });

            let sendResult;
            await act(async () => {
                sendResult = await firstHook.result.current.sendMessage(
                    "Сообщение на границе сессий.",
                );
            });
            const publication = sendMessageMock.mock.calls[0][0];

            expect(sendResult).toEqual({
                outcome: "unknown",
                restoreDraft: false,
            });
            expect(firstHook.result.current.sessionId).toBe(
                predecessorSessionId,
            );
            expect(firstHook.result.current.deliveryState).toBe("unknown");
            expect(FakeEventSource.instances).toEqual([]);
            expect(
                JSON.parse(
                    window.sessionStorage.getItem(
                        "vera_pending_session_resolution",
                    ) ?? "{}",
                ),
            ).toEqual({
                sessionId: predecessorSessionId,
                replacementSessionId: publication.request_id,
            });
            expect(
                JSON.parse(
                    window.sessionStorage.getItem("vera_pending_request") ??
                        "{}",
                ).sessionId,
            ).toBe(
                failedWrite === "pending remap"
                    ? predecessorSessionId
                    : publication.request_id,
            );

            setItemSpy.mockRestore();
            firstHook.unmount();
            resolveSessionMock.mockImplementationOnce(async (data) => ({
                session_id: data.replacement_session_id,
                previous_session_id: data.session_id,
                boundary: "expired",
                session_ttl_seconds: 86_400,
            }));
            getHistoryMock.mockImplementation(async (sessionId) =>
                sessionId === publication.request_id
                    ? historyWithTurn({
                          sessionId,
                          requestId: publication.request_id,
                          status: "completed",
                          answer: "Ответ восстановлен после storage failure.",
                      })
                    : {
                          session_id: sessionId,
                          turns: [],
                          next_before_sequence: null,
                      },
            );
            const secondHook = renderHook(() => useVeraChat());

            await waitFor(() =>
                expect(resolveSessionMock).toHaveBeenCalledTimes(3),
            );
            expect(resolveSessionMock.mock.calls[2][0]).toEqual({
                session_id: predecessorSessionId,
                replacement_session_id: publication.request_id,
            });
            await waitFor(() => {
                expect(secondHook.result.current.sessionId).toBe(
                    publication.request_id,
                );
                expect(secondHook.result.current.deliveryState).toBe(
                    "completed",
                );
            });
            expect(
                window.sessionStorage.getItem(
                    "vera_pending_session_resolution",
                ),
            ).toBeNull();
            expect(
                window.sessionStorage.getItem("vera_pending_request"),
            ).toBeNull();

            secondHook.unmount();
        },
    );

    it("reuses the pending replacement id after a lost resolve response", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );

        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(504, "Сервер не отвечает."),
        );
        await act(async () => {
            await result.current.sendMessage("Первый вариант вопроса.");
        });
        const firstAttempt = resolveSessionMock.mock.calls[1][0];
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toContain(firstAttempt.replacement_session_id);

        await act(async () => {
            await result.current.sendMessage("Повтор вопроса.");
        });
        const secondAttempt = resolveSessionMock.mock.calls[2][0];
        expect(secondAttempt.replacement_session_id).toBe(
            firstAttempt.replacement_session_id,
        );
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        unmount();
    });

    it("abandons an unrecoverable stale operation during initialization and resolves one fresh session", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "doomed-session" }),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify({
                sessionId: "doomed-session",
                replacementSessionId: "doomed-replacement",
            }),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                sessionId: "doomed-session",
                requestId: "doomed-replacement",
                message: "Незавершённый вопрос.",
                createdAt: Date.now() - 301_000,
            }),
        );
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Окно восстановления истекло."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "created",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });
        const freshOperation = resolveSessionMock.mock.calls[1][0];
        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: "doomed-session",
            replacement_session_id: "doomed-replacement",
        });
        expect(freshOperation.session_id).not.toBe("doomed-session");
        expect(freshOperation.session_id).not.toBe("doomed-replacement");
        expect(result.current.sessionId).toBe(freshOperation.session_id);
        expect(result.current.historyError).toContain(
            "Не удалось восстановить незавершённую отправку",
        );
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: "doomed-session",
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Незавершённый вопрос.",
                        deliveryStatus: "unknown",
                    }),
                ]),
            }),
        );
        expect(getCurrentSessionMock).not.toHaveBeenCalled();
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        unmount();
    });

    it("keeps the doomed operation and unknown request when authenticated recovery lookup fails", async () => {
        useAuthStore.setState({
            user: {
                email: "user@example.com",
                first_name: "User",
                last_name: "Example",
            },
            isAuthenticated: true,
            isLoading: false,
        });
        const pendingResolution = {
            sessionId: "doomed-session",
            replacementSessionId: "doomed-request",
        };
        const pendingRequest = {
            sessionId: "doomed-session",
            requestId: "doomed-request",
            message: "Не потерять этот вопрос.",
            createdAt: Date.now() - 301_000,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: pendingResolution.sessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify(pendingResolution),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify(pendingRequest),
        );
        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(409, "Recovery proof истёк."),
        );
        getCurrentSessionMock.mockRejectedValueOnce(
            new ApiRequestError(503, "Current lookup unavailable."),
        );

        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        expect(resolveSessionMock).toHaveBeenCalledOnce();
        expect(
            JSON.parse(
                window.sessionStorage.getItem(
                    "vera_pending_session_resolution",
                ) ?? "{}",
            ),
        ).toEqual(pendingResolution);
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_request") ??
                    "{}",
            ),
        ).toEqual(pendingRequest);

        unmount();
    });

    it("archives the unknown request after a failed fresh abandon resolve is recovered on reload", async () => {
        const pendingRequest = {
            sessionId: "doomed-session",
            requestId: "doomed-request",
            message: "Вопрос с двухфазным восстановлением.",
            createdAt: Date.now() - 301_000,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "doomed-session" }),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify({
                sessionId: "doomed-session",
                replacementSessionId: "doomed-request",
            }),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify(pendingRequest),
        );
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Recovery proof истёк."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Fresh resolve receipt lost."),
            );

        const firstHook = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(firstHook.result.current.isHistoryLoading).toBe(false);
        });
        const freshJournal = JSON.parse(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ) ?? "{}",
        ) as {
            sessionId: string;
            replacementSessionId: string;
        };
        expect(freshJournal.sessionId).not.toBe("doomed-session");
        expect(freshJournal.replacementSessionId).not.toBe(
            "doomed-request",
        );
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_request") ??
                    "{}",
            ),
        ).toEqual(pendingRequest);

        firstHook.unmount();
        resolveSessionMock.mockImplementationOnce(async (data) => ({
            session_id: data.session_id,
            previous_session_id: null,
            boundary: "retained",
            session_ttl_seconds: 86_400,
        }));
        const secondHook = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(secondHook.result.current.sessionId).toBe(
                freshJournal.sessionId,
            );
            expect(secondHook.result.current.isHistoryLoading).toBe(false);
        });
        expect(resolveSessionMock.mock.calls[2][0]).toEqual({
            session_id: freshJournal.sessionId,
            replacement_session_id: freshJournal.replacementSessionId,
        });
        expect(secondHook.result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: "doomed-session",
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Вопрос с двухфазным восстановлением.",
                        deliveryStatus: "unknown",
                    }),
                ]),
            }),
        );
        expect(secondHook.result.current.historyError).toContain(
            "Не удалось восстановить незавершённую отправку",
        );
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        secondHook.unmount();
    });

    it.each([
        ["recovers", "doomed-replacement", true],
        ["ignores", "unrelated-auth-session", false],
    ] as const)(
        "%s only an authenticated current session tied to the doomed operation",
        async (_label, currentSessionId, shouldReuseCurrent) => {
            useAuthStore.setState({
                user: {
                    email: "user@example.com",
                    first_name: "User",
                    last_name: "Example",
                },
                isAuthenticated: true,
                isLoading: false,
            });
            window.sessionStorage.setItem(
                "vera_session_id",
                JSON.stringify({ id: "doomed-session" }),
            );
            window.sessionStorage.setItem(
                "vera_pending_session_resolution",
                JSON.stringify({
                    sessionId: "doomed-session",
                    replacementSessionId: "doomed-replacement",
                }),
            );
            getCurrentSessionMock.mockResolvedValue({
                session_id: currentSessionId,
            });
            resolveSessionMock
                .mockRejectedValueOnce(
                    new ApiRequestError(409, "Окно восстановления истекло."),
                )
                .mockImplementationOnce(async (data) => ({
                    session_id: data.session_id,
                    previous_session_id: null,
                    boundary: "retained",
                    session_ttl_seconds: 86_400,
                }));

            const { result, unmount } = renderHook(() => useVeraChat());

            await waitFor(() =>
                expect(resolveSessionMock).toHaveBeenCalledTimes(2),
            );
            const recoveryOperation = resolveSessionMock.mock.calls[1][0];
            expect(getCurrentSessionMock).toHaveBeenCalledOnce();
            if (shouldReuseCurrent) {
                expect(recoveryOperation.session_id).toBe(currentSessionId);
            } else {
                expect(recoveryOperation.session_id).not.toBe(
                    currentSessionId,
                );
                expect(recoveryOperation.session_id).not.toBe(
                    "doomed-session",
                );
                expect(recoveryOperation.session_id).not.toBe(
                    "doomed-replacement",
                );
            }
            expect(result.current.sessionId).toBe(
                recoveryOperation.session_id,
            );

            unmount();
        },
    );

    it("abandons a rejected pre-send recovery once and restores the draft", async () => {
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        const doomedSessionId = result.current.sessionId;
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Recovery proof истёк."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "created",
                session_ttl_seconds: 86_400,
            }));

        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage(
                "Текст должен остаться в форме.",
            );
        });

        const doomedOperation = resolveSessionMock.mock.calls[1][0];
        const freshOperation = resolveSessionMock.mock.calls[2][0];
        expect(doomedOperation.session_id).toBe(doomedSessionId);
        expect(freshOperation.session_id).not.toBe(doomedSessionId);
        expect(freshOperation.session_id).not.toBe(
            doomedOperation.replacement_session_id,
        );
        expect(resolveSessionMock).toHaveBeenCalledTimes(3);
        expect(sendMessageMock).not.toHaveBeenCalled();
        expect(sendResult).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });
        expect(result.current.error).toContain(
            "Не удалось восстановить незавершённую отправку",
        );
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        unmount();
    });

    it("reuses the chat operation id during initialization after a lost receipt", async () => {
        sendMessageMock.mockRejectedValueOnce(
            new ApiRequestError(500, "Неоднозначный ответ BFF."),
        );
        const firstRender = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(firstRender.result.current.isHistoryLoading).toBe(false),
        );
        resolveSessionMock
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }))
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Lifecycle receipt lost."),
            );

        let sendPromise!: ReturnType<
            typeof firstRender.result.current.sendMessage
        >;
        act(() => {
            sendPromise = firstRender.result.current.sendMessage(
                "Вопрос с потерянной квитанцией.",
            );
        });
        await waitFor(() => expect(sendMessageMock).toHaveBeenCalledOnce());
        const published = sendMessageMock.mock.calls[0][0];
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toContain(published.request_id);

        firstRender.unmount();
        await act(async () => {
            await sendPromise;
        });
        resolveSessionMock.mockClear();
        getCurrentSessionMock.mockClear();
        const secondRender = renderHook(() => useVeraChat());

        await waitFor(() =>
            expect(resolveSessionMock).toHaveBeenCalledWith(
                {
                    session_id: published.session_id,
                    replacement_session_id: published.request_id,
                },
                expect.any(AbortSignal),
            ),
        );
        expect(getCurrentSessionMock).not.toHaveBeenCalled();

        secondRender.unmount();
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

    it("resolves a stale authenticated current session into a visible boundary in a new tab", async () => {
        useAuthStore.setState({
            user: {
                email: "user@example.com",
                first_name: "User",
                last_name: "Example",
            },
            isAuthenticated: true,
            isLoading: false,
        });
        getCurrentSessionMock.mockResolvedValue({
            session_id: "stale-server-session",
        });
        resolveSessionMock.mockImplementationOnce(async (data) => ({
            session_id: data.replacement_session_id,
            previous_session_id: data.session_id,
            boundary: "expired",
            session_ttl_seconds: 86_400,
        }));
        getHistoryMock.mockImplementation(async (sessionId) =>
            sessionId === "stale-server-session"
                ? historyWithTurn({
                      sessionId,
                      requestId: "stale-turn",
                      status: "completed",
                      answer: "Ответ из завершённой auth-сессии.",
                  })
                : {
                      session_id: sessionId,
                      turns: [],
                      next_before_sequence: null,
                  },
        );

        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.sessionId).not.toBe(
                "stale-server-session",
            );
        });
        const resolution = resolveSessionMock.mock.calls[0][0];
        expect(resolution.session_id).toBe("stale-server-session");
        expect(result.current.sessionId).toBe(
            resolution.replacement_session_id,
        );
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([
            expect.objectContaining({
                sessionId: "stale-server-session",
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Ответ из завершённой auth-сессии.",
                    }),
                ]),
            }),
        ]);
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_session_id") ?? "{}",
            ),
        ).toEqual({ id: resolution.replacement_session_id });

        unmount();
    });

    it.each([
        ["logout", null],
        [
            "account switch",
            {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
        ],
    ])("clears current and archived messages after %s", async (_label, user) => {
        useAuthStore.setState({
            user: {
                email: "user-a@example.com",
                first_name: "User",
                last_name: "A",
            },
            isAuthenticated: true,
        });
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "expired-session", createdAt: 1 }),
        );
        resolveSessionMock.mockResolvedValueOnce({
            session_id: "replacement-session",
            previous_session_id: "expired-session",
            boundary: "expired",
            session_ttl_seconds: 86_400,
        });
        getHistoryMock
            .mockResolvedValueOnce(
                historyWithTurn({
                    sessionId: "expired-session",
                    requestId: "archived-request",
                    status: "completed",
                    answer: "Архив пользователя A.",
                }),
            )
            .mockResolvedValueOnce(
                historyWithTurn({
                    sessionId: "replacement-session",
                    requestId: "current-request",
                    status: "completed",
                    answer: "Текущий ответ пользователя A.",
                }),
            )
            .mockResolvedValue({
                session_id: "fresh-session",
                turns: [],
                next_before_sequence: null,
            });
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(result.current.previousSessionGroups).toHaveLength(1);
            expect(result.current.messages).toHaveLength(2);
        });

        act(() => {
            useAuthStore.setState({
                user,
                isAuthenticated: user !== null,
            });
        });

        await waitFor(() => {
            expect(result.current.previousSessionGroups).toEqual([]);
            expect(result.current.messages).toEqual([]);
            expect(result.current.isHistoryLoading).toBe(false);
        });

        unmount();
    });

    it("ignores a late pre-send resolve after an authenticated identity switch", async () => {
        useAuthStore.setState({
            user: {
                email: "user-a@example.com",
                first_name: "User",
                last_name: "A",
            },
            isAuthenticated: true,
        });
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );
        const userASessionId = result.current.sessionId;
        let resolveLate!: (value: {
            session_id: string;
            previous_session_id: string;
            boundary: "expired";
            session_ttl_seconds: number;
        }) => void;
        resolveSessionMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveLate = resolve;
                }),
        );

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
            sendPromise = result.current.sendMessage("Вопрос пользователя A.");
        });
        await waitFor(() => expect(resolveLate).toBeDefined());

        act(() => {
            useAuthStore.setState({
                user: {
                    email: "user-b@example.com",
                    first_name: "User",
                    last_name: "B",
                },
                isAuthenticated: true,
            });
        });
        await act(async () => {
            resolveLate({
                session_id: "late-user-a-successor",
                previous_session_id: userASessionId,
                boundary: "expired",
                session_ttl_seconds: 86_400,
            });
            await sendPromise;
        });
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );

        expect(result.current.sessionId).not.toBe("late-user-a-successor");
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(result.current.messages).toEqual([]);
        expect(sendMessageMock).not.toHaveBeenCalled();

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
