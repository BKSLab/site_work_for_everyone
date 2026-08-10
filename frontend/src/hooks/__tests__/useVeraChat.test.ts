import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    getCurrentSessionMock,
    getHistoryMock,
    resolveSessionMock,
    createSessionMock,
    closeSessionMock,
    sendMessageMock,
} = vi.hoisted(() => ({
    getCurrentSessionMock: vi.fn(),
    getHistoryMock: vi.fn(),
    resolveSessionMock: vi.fn(),
    createSessionMock: vi.fn(),
    closeSessionMock: vi.fn(),
    sendMessageMock: vi.fn(),
}));

vi.mock("@/lib/api/vera", () => ({
    veraApi: {
        getCurrentSession: getCurrentSessionMock,
        getHistory: getHistoryMock,
        resolveSession: resolveSessionMock,
        createSession: createSessionMock,
        closeSession: closeSessionMock,
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
        createSessionMock.mockReset().mockImplementation(async (data) => ({
            session_id: data.session_id,
            session_ttl_seconds: 86_400,
        }));
        closeSessionMock.mockReset().mockImplementation(async (sessionId) => ({
            session_id: sessionId,
            closed_at: "2026-08-10T12:00:00Z",
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
            .mockImplementation(function (this: Storage, key, value) {
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
                if (statusCode === 409) {
                    expect(
                        result.current.previousSessionGroups,
                    ).toContainEqual(
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
                } else {
                    expect(result.current.previousSessionGroups).toEqual([]);
                }
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
                .mockImplementation(function (this: Storage, key, value) {
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

    it.each([
        {
            label: "authenticated B",
            nextUser: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            currentSessionId: "user-b-current-session",
        },
        {
            label: "anonymous",
            nextUser: null,
            currentSessionId: null,
        },
    ])(
        "does not disclose user A's pending lifecycle request after remount as $label",
        async ({ nextUser, currentSessionId }) => {
            const foreignSessionId = "user-a-session";
            const foreignRequestId = "user-a-pending-request";
            const foreignText = "Приватный незавершённый вопрос A";
            window.sessionStorage.setItem(
                "vera_session_id",
                JSON.stringify({ id: foreignSessionId }),
            );
            window.sessionStorage.setItem(
                "vera_pending_session_resolution",
                JSON.stringify({
                    sessionId: foreignSessionId,
                    replacementSessionId: foreignRequestId,
                }),
            );
            window.sessionStorage.setItem(
                "vera_pending_request",
                JSON.stringify({
                    sessionId: foreignSessionId,
                    requestId: foreignRequestId,
                    message: foreignText,
                    createdAt: Date.now(),
                }),
            );
            useAuthStore.setState({
                user: nextUser,
                isAuthenticated: nextUser !== null,
                isLoading: false,
            });
            getCurrentSessionMock.mockResolvedValue({
                session_id: currentSessionId,
            });
            resolveSessionMock
                .mockRejectedValueOnce(
                    new ApiRequestError(403, "Чужая lifecycle operation."),
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
            const recoveryOperation = resolveSessionMock.mock.calls[1][0];
            expect(getCurrentSessionMock).toHaveBeenCalledOnce();
            if (currentSessionId) {
                expect(recoveryOperation.session_id).toBe(currentSessionId);
            } else {
                expect(recoveryOperation.session_id).not.toBe(
                    foreignSessionId,
                );
                expect(recoveryOperation.session_id).not.toBe(
                    foreignRequestId,
                );
            }
            expect(result.current.sessionId).toBe(
                recoveryOperation.session_id,
            );
            expect(result.current.messages).toEqual([]);
            expect(result.current.previousSessionGroups).toEqual([]);
            expect(JSON.stringify(result.current)).not.toContain(foreignText);
            for (const storageKey of [
                "vera_pending_request",
                "vera_pending_session_resolution",
                "vera_pending_new_dialog",
            ]) {
                expect(window.sessionStorage.getItem(storageKey)).toBeNull();
            }

            unmount();
        },
    );

    it.each([
        {
            label: "authenticated B",
            nextUser: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            currentSessionId: "user-b-current-session",
        },
        {
            label: "anonymous",
            nextUser: null,
            currentSessionId: null,
        },
    ])(
        "clears user A's stale pending request after a local-session 403 as $label",
        async ({ nextUser, currentSessionId }) => {
            const foreignSessionId = "user-a-local-session";
            const foreignRequestId = "user-a-stale-request";
            const foreignText = "Приватный локальный вопрос A";
            window.sessionStorage.setItem(
                "vera_session_id",
                JSON.stringify({ id: foreignSessionId }),
            );
            window.sessionStorage.setItem(
                "vera_pending_request",
                JSON.stringify({
                    sessionId: foreignSessionId,
                    requestId: foreignRequestId,
                    message: foreignText,
                    createdAt: Date.now(),
                }),
            );
            useAuthStore.setState({
                user: nextUser,
                isAuthenticated: nextUser !== null,
                isLoading: false,
            });
            getCurrentSessionMock.mockResolvedValue({
                session_id: currentSessionId,
            });
            resolveSessionMock
                .mockRejectedValueOnce(
                    new ApiRequestError(403, "Чужая локальная сессия."),
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
            const recoveryOperation = resolveSessionMock.mock.calls[1][0];
            expect(getCurrentSessionMock).toHaveBeenCalledOnce();
            if (currentSessionId) {
                expect(recoveryOperation.session_id).toBe(currentSessionId);
            } else {
                expect(recoveryOperation.session_id).not.toBe(
                    foreignSessionId,
                );
                expect(recoveryOperation.session_id).not.toBe(
                    foreignRequestId,
                );
            }
            expect(result.current.sessionId).toBe(
                recoveryOperation.session_id,
            );
            expect(result.current.messages).toEqual([]);
            expect(result.current.previousSessionGroups).toEqual([]);
            expect(JSON.stringify(result.current)).not.toContain(foreignText);
            for (const storageKey of [
                "vera_pending_request",
                "vera_pending_session_resolution",
                "vera_pending_new_dialog",
            ]) {
                expect(window.sessionStorage.getItem(storageKey)).toBeNull();
            }

            unmount();
        },
    );

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

    it("closes the current session, creates a new one, and preserves a visible boundary", async () => {
        getHistoryMock.mockImplementation(async (sessionId) =>
            historyWithTurn({
                sessionId,
                requestId: "completed-request",
                status: "completed",
                answer: "Ответ завершённого диалога.",
            }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => expect(result.current.messages).toHaveLength(2));
        const previousSessionId = result.current.sessionId;

        let started = false;
        await act(async () => {
            started = await result.current.startNewDialog();
        });

        expect(started).toBe(true);
        expect(closeSessionMock).toHaveBeenCalledWith(
            previousSessionId,
            expect.any(AbortSignal),
        );
        const createdSessionId = createSessionMock.mock.calls[0][0].session_id;
        expect(
            resolveSessionMock.mock.calls.at(-1)?.[0].replacement_session_id,
        ).toBe(createdSessionId);
        expect(createdSessionId).not.toBe(previousSessionId);
        expect(result.current.sessionId).toBe(createdSessionId);
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: previousSessionId,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Ответ завершённого диалога.",
                    }),
                ]),
            }),
        );
        expect(closeSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
            createSessionMock.mock.invocationCallOrder[0],
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(result.current.announcement).toContain("Начат новый диалог");

        unmount();
    });

    it("treats an expired preflight rollover as the completed explicit boundary", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "inactive-session", createdAt: 1 }),
        );
        getHistoryMock.mockImplementation(async (sessionId) =>
            historyWithTurn({
                sessionId,
                requestId: "inactive-request",
                status: "completed",
                answer: "Ответ до серверной границы.",
            }),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => expect(result.current.messages).toHaveLength(2));
        resolveSessionMock.mockImplementationOnce(async (data) => ({
            session_id: data.replacement_session_id,
            previous_session_id: data.session_id,
            boundary: "expired",
            session_ttl_seconds: 86_400,
        }));

        let started = false;
        await act(async () => {
            started = await result.current.startNewDialog();
        });

        const preflight = resolveSessionMock.mock.calls.at(-1)![0];
        expect(started).toBe(true);
        expect(preflight.session_id).toBe("inactive-session");
        expect(result.current.sessionId).toBe(
            preflight.replacement_session_id,
        );
        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(createSessionMock).not.toHaveBeenCalled();
        expect(result.current.previousSessionGroups).toEqual([
            expect.objectContaining({
                sessionId: "inactive-session",
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Ответ до серверной границы.",
                    }),
                ]),
            }),
        ]);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("completes an expired durable new-dialog operation without strict close or create", async () => {
        const operation = {
            previousSessionId: "expired-pending-session",
            newSessionId: "expired-pending-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        resolveSessionMock.mockImplementationOnce(async (data) => ({
            session_id: data.replacement_session_id,
            previous_session_id: data.session_id,
            boundary: "expired",
            session_ttl_seconds: 86_400,
        }));
        getHistoryMock.mockResolvedValueOnce({
            ...historyWithTurn({
                sessionId: operation.previousSessionId,
                requestId: "expired-pending-turn",
                status: "completed",
                answer: "История закрытого предшественника.",
            }),
            next_before_sequence: 4,
        });

        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.sessionId).toBe(operation.newSessionId);
            expect(result.current.isHistoryLoading).toBe(false);
        });
        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: operation.previousSessionId,
            replacement_session_id: operation.newSessionId,
        });
        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(createSessionMock).not.toHaveBeenCalled();
        expect(result.current.previousSessionGroups).toEqual([
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 4,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "История закрытого предшественника.",
                    }),
                ]),
            }),
        ]);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem(
                "vera_pending_session_resolution",
            ),
        ).toBeNull();

        unmount();
    });

    it("rekeys a lost anonymous successor proof once and completes the same boundary", async () => {
        const operation = {
            previousSessionId: "closed-owned-session",
            newSessionId: "lost-cookie-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Successor proof не принят."),
            )
            .mockImplementationOnce(async (data) => ({
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
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });
        const rekeyedOperation = resolveSessionMock.mock.calls[1][0];
        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: operation.previousSessionId,
            replacement_session_id: operation.newSessionId,
        });
        expect(rekeyedOperation.session_id).toBe(operation.previousSessionId);
        expect(rekeyedOperation.replacement_session_id).not.toBe(
            operation.newSessionId,
        );
        expect(result.current.sessionId).toBe(
            rekeyedOperation.replacement_session_id,
        );
        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(createSessionMock).not.toHaveBeenCalled();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("keeps foreign new-dialog recovery retryable when current lookup is transiently unavailable", async () => {
        const operation = {
            previousSessionId: "foreign-pending-session",
            newSessionId: "foreign-pending-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Чужая история."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Чужая история."),
            );
        getCurrentSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(503, "Current временно недоступен."),
            )
            .mockResolvedValueOnce({
                session_id: "new-owner-current-session",
            });

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.isStartingNewDialog).toBe(false);
            expect(result.current.hasPendingNewDialog).toBe(true);
        });
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ),
        ).toMatchObject(operation);

        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(getCurrentSessionMock).toHaveBeenCalledTimes(2);
        expect(result.current.sessionId).toBe("new-owner-current-session");
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("reloads predecessor history on a durable retry before archiving it", async () => {
        const operation = {
            previousSessionId: "history-retry-session",
            newSessionId: "history-retry-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockImplementation(async (sessionId) => ({
            ...historyWithTurn({
                sessionId,
                requestId: "history-retry-turn",
                status: "completed",
                answer: "История сохраняется после повтора.",
            }),
            next_before_sequence: 6,
        }));
        createSessionMock.mockRejectedValueOnce(
            new ApiRequestError(504, "Create receipt потерян."),
        );

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(createSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.hasPendingNewDialog).toBe(true);
        });

        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(getHistoryMock).toHaveBeenCalledTimes(2);
        expect(result.current.previousSessionGroups).toEqual([
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 6,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "История сохраняется после повтора.",
                    }),
                ]),
            }),
        ]);

        unmount();
    });

    it("keeps exact owner recovery journal after a foreign fallback resolve failure", async () => {
        const operation = {
            previousSessionId: "foreign-owner-session",
            newSessionId: "foreign-owner-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Чужая история."),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "owner-current-after-foreign",
        });
        resolveSessionMock
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }))
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Fresh owner resolve потерян."),
            );

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });
        const durableRecovery = JSON.parse(
            window.sessionStorage.getItem("vera_pending_new_dialog") ?? "{}",
        ) as {
            ownerRecoverySessionId: string;
            ownerRecoveryReplacementSessionId: string;
        };
        expect(durableRecovery.ownerRecoverySessionId).toBe(
            "owner-current-after-foreign",
        );
        expect(durableRecovery.ownerRecoveryReplacementSessionId).toBeTruthy();
        expect(
            JSON.parse(
                window.sessionStorage.getItem(
                    "vera_pending_session_resolution",
                ) ?? "{}",
            ),
        ).toEqual({
            sessionId: durableRecovery.ownerRecoverySessionId,
            replacementSessionId:
                durableRecovery.ownerRecoveryReplacementSessionId,
        });

        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(resolveSessionMock.mock.calls[2][0]).toEqual({
            session_id: durableRecovery.ownerRecoverySessionId,
            replacement_session_id:
                durableRecovery.ownerRecoveryReplacementSessionId,
        });
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("reloads same-owner history before retrying a persisted 409 recovery", async () => {
        const operation = {
            previousSessionId: "same-owner-retry-session",
            newSessionId: "same-owner-retry-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockImplementation(async (sessionId) => ({
            ...historyWithTurn({
                sessionId,
                requestId: "same-owner-retry-turn",
                status: "completed",
                answer: "История пережила потерянный fresh resolve.",
            }),
            next_before_sequence: 12,
        }));
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Recovery window истёк."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Fresh resolve потерян."),
            )
            .mockImplementation(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "created",
                session_ttl_seconds: 86_400,
            }));

        const firstMount = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(firstMount.result.current.isHistoryLoading).toBe(false);
            expect(firstMount.result.current.hasPendingNewDialog).toBe(true);
        });
        const durableRecovery = JSON.parse(
            window.sessionStorage.getItem("vera_pending_new_dialog") ?? "{}",
        ) as {
            ownerRecoverySessionId: string;
            ownerRecoveryReplacementSessionId: string;
        };
        firstMount.unmount();

        const secondMount = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(3);
            expect(secondMount.result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[2][0]).toEqual({
            session_id: durableRecovery.ownerRecoverySessionId,
            replacement_session_id:
                durableRecovery.ownerRecoveryReplacementSessionId,
        });
        expect(getHistoryMock).toHaveBeenCalledTimes(2);
        expect(secondMount.result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 12,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "История пережила потерянный fresh resolve.",
                    }),
                ]),
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        secondMount.unmount();
    });

    it("continues a persisted 409 recovery without exposing unverified expired history", async () => {
        const operation = {
            previousSessionId: "expired-history-409-session",
            newSessionId: "expired-history-409-successor",
            ownerRecoverySessionId: "expired-history-recovery-session",
            ownerRecoveryReplacementSessionId:
                "expired-history-recovery-successor",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify({
                sessionId: operation.ownerRecoverySessionId,
                replacementSessionId:
                    operation.ownerRecoveryReplacementSessionId,
            }),
        );
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(401, "Anonymous proof истёк."),
        );

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: operation.ownerRecoverySessionId,
            replacement_session_id:
                operation.ownerRecoveryReplacementSessionId,
        });
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(result.current.isStartingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(result.current.historyError).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();

        unmount();
    });

    it("does not archive foreign plaintext after unverified 404 history and an exact rejection", async () => {
        const operation = {
            previousSessionId: "unverified-404-session",
            newSessionId: "unverified-404-successor",
            ownerRecoverySessionId: "unverified-404-recovery",
            ownerRecoveryReplacementSessionId:
                "unverified-404-replacement",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        useAuthStore.setState({
            user: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            isAuthenticated: true,
        });
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                requestId: "unverified-private-request",
                sessionId: operation.previousSessionId,
                message: "Приватный текст пользователя A.",
                createdAt: Date.now(),
            }),
        );
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(404, "История не найдена."),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "user-b-current-after-404",
        });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Exact recovery не принадлежит B."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[1][0]).toEqual({
            session_id: "user-b-current-after-404",
            replacement_session_id: expect.any(String),
        });
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("does not treat an unverified created recovery as predecessor ownership", async () => {
        const operation = {
            previousSessionId: "unverified-created-session",
            newSessionId: "unverified-created-successor",
            ownerRecoverySessionId: "unverified-created-recovery",
            ownerRecoveryReplacementSessionId:
                "unverified-created-replacement",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                requestId: "unverified-created-private-request",
                sessionId: operation.previousSessionId,
                message: "Чужой текст нельзя архивировать.",
                createdAt: Date.now(),
            }),
        );
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(401, "Истёкший owner proof."),
        );
        resolveSessionMock.mockResolvedValueOnce({
            session_id: operation.ownerRecoverySessionId,
            previous_session_id: null,
            boundary: "created",
            session_ttl_seconds: 86_400,
        });

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(result.current.sessionId).toBe(
            operation.ownerRecoverySessionId,
        );
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("keeps an unverified predecessor private after a lost create response is retained on retry", async () => {
        const operation = {
            previousSessionId: "unverified-lost-created-session",
            newSessionId: "unverified-lost-created-successor",
            ownerRecoverySessionId: "unverified-lost-created-recovery",
            ownerRecoveryReplacementSessionId:
                "unverified-lost-created-replacement",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                requestId: "unverified-lost-created-private-request",
                sessionId: operation.previousSessionId,
                message: "Чужой текст не должен пережить потерянный ответ.",
                createdAt: Date.now(),
            }),
        );
        getHistoryMock.mockRejectedValue(
            new ApiRequestError(503, "Owner history временно недоступна."),
        );
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Created response потерян."),
            )
            .mockResolvedValueOnce({
                session_id: operation.ownerRecoverySessionId,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            });

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.hasPendingNewDialog).toBe(true);
        });

        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(resolveSessionMock).toHaveBeenCalledTimes(2);
        expect(resolveSessionMock.mock.calls[0][0]).toEqual(
            resolveSessionMock.mock.calls[1][0],
        );
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("clears an unverified marker after 2xx history revalidates the predecessor", async () => {
        const operation = {
            previousSessionId: "revalidated-409-session",
            newSessionId: "revalidated-409-successor",
            ownerRecoverySessionId: "revalidated-recovery-session",
            ownerRecoveryReplacementSessionId:
                "revalidated-recovery-successor",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock
            .mockRejectedValueOnce(
                new ApiRequestError(503, "Strict proof истёк."),
            )
            .mockResolvedValueOnce({
                ...historyWithTurn({
                    sessionId: operation.previousSessionId,
                    requestId: "revalidated-history-turn",
                    status: "completed",
                    answer: "Владелец истории повторно подтверждён.",
                }),
                next_before_sequence: 18,
            });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Exact response потерян."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Exact pair отклонён."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "created",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.hasPendingNewDialog).toBe(true);
        });
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ).ownerRecoveryPredecessorUnverified,
        ).toBe(true);

        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(resolveSessionMock).toHaveBeenCalledTimes(3);
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 18,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Владелец истории повторно подтверждён.",
                    }),
                ]),
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("preserves the original 409 policy while an unverified recovery waits for current", async () => {
        const operation = {
            previousSessionId: "rebase-revalidated-session",
            newSessionId: "rebase-revalidated-successor",
            ownerRecoverySessionId: "rebase-revalidated-recovery",
            ownerRecoveryReplacementSessionId:
                "rebase-revalidated-replacement",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock
            .mockRejectedValueOnce(
                new ApiRequestError(503, "Owner history временно недоступна."),
            )
            .mockResolvedValueOnce({
                ...historyWithTurn({
                    sessionId: operation.previousSessionId,
                    requestId: "rebase-revalidated-turn",
                    status: "completed",
                    answer: "История подтверждена после current retry.",
                }),
                next_before_sequence: 23,
            });
        getCurrentSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(503, "Current временно недоступен."),
            )
            .mockResolvedValueOnce({
                session_id: "rebase-authoritative-current",
            });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Exact recovery отклонена."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.hasPendingNewDialog).toBe(true);
        });
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ),
        ).toMatchObject({
            ownerRecoveryRejectionStatus: 409,
            ownerRecoveryPredecessorUnverified: true,
            ownerRecoveryNeedsRebase: true,
        });

        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(getHistoryMock).toHaveBeenCalledTimes(2);
        expect(resolveSessionMock).toHaveBeenCalledTimes(2);
        expect(resolveSessionMock.mock.calls[1][0]).toEqual({
            session_id: "rebase-authoritative-current",
            replacement_session_id: expect.any(String),
        });
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 23,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "История подтверждена после current retry.",
                    }),
                ]),
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("does not repeat a definitely rejected recovery pair after current lookup fails", async () => {
        const operation = {
            previousSessionId: "needs-rebase-foreign-session",
            newSessionId: "needs-rebase-foreign-successor",
            ownerRecoverySessionId: "needs-rebase-session",
            ownerRecoveryReplacementSessionId: "needs-rebase-successor",
            ownerRecoveryRejectionStatus: 403 as const,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getCurrentSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(503, "Current временно недоступен."),
            )
            .mockResolvedValueOnce({
                session_id: "authoritative-session-after-reload",
            });
        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Exact pair отклонён."),
        );

        const firstMount = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(firstMount.result.current.isHistoryLoading).toBe(false);
        });
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ).ownerRecoveryNeedsRebase,
        ).toBe(true);
        firstMount.unmount();

        const secondMount = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(secondMount.result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: operation.ownerRecoverySessionId,
            replacement_session_id:
                operation.ownerRecoveryReplacementSessionId,
        });
        expect(resolveSessionMock.mock.calls[1][0]).toEqual({
            session_id: "authoritative-session-after-reload",
            replacement_session_id: expect.any(String),
        });
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        secondMount.unmount();
    });

    it("invalidates persisted 409 recovery credentials when history proves foreign", async () => {
        const operation = {
            previousSessionId: "old-owner-409-session",
            newSessionId: "old-owner-409-successor",
            ownerRecoverySessionId: "old-owner-recovery-session",
            ownerRecoveryReplacementSessionId: "old-owner-recovery-successor",
            ownerRecoveryRejectionStatus: 409 as const,
        };
        useAuthStore.setState({
            user: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            isAuthenticated: true,
        });
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Чужая история."),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "user-b-current-after-owner-change",
        });

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: "user-b-current-after-owner-change",
            replacement_session_id: expect.any(String),
        });
        expect(resolveSessionMock.mock.calls[0][0]).not.toEqual({
            session_id: operation.ownerRecoverySessionId,
            replacement_session_id:
                operation.ownerRecoveryReplacementSessionId,
        });
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("keeps original foreign-owner privacy after a nested 409 recovery rejection", async () => {
        const operation = {
            previousSessionId: "foreign-original-session",
            newSessionId: "foreign-original-successor",
            ownerRecoverySessionId: "foreign-recovery-session",
            ownerRecoveryReplacementSessionId:
                "foreign-recovery-successor",
            ownerRecoveryRejectionStatus: 403 as const,
        };
        useAuthStore.setState({
            user: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            isAuthenticated: true,
        });
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify({
                sessionId: operation.ownerRecoverySessionId,
                replacementSessionId:
                    operation.ownerRecoveryReplacementSessionId,
            }),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                requestId: "foreign-private-request",
                sessionId: operation.previousSessionId,
                message: "Приватный текст пользователя A.",
                createdAt: Date.now(),
            }),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "user-b-authoritative-current",
        });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Nested recovery конфликтует."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: operation.ownerRecoverySessionId,
            replacement_session_id:
                operation.ownerRecoveryReplacementSessionId,
        });
        expect(resolveSessionMock.mock.calls[1][0]).toEqual({
            session_id: "user-b-authoritative-current",
            replacement_session_id: expect.any(String),
        });
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(result.current.messages).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();

        unmount();
    });

    it("terminates a preloaded recovery after its bounded pair returns 403", async () => {
        const operation = {
            previousSessionId: "terminal-same-owner-session",
            newSessionId: "terminal-same-owner-successor",
            ownerRecoverySessionId: "terminal-recovery-session",
            ownerRecoveryReplacementSessionId:
                "terminal-recovery-successor",
            ownerRecoveryRejectionStatus: 409 as const,
            ownerRecoveryTerminalAttempt: true,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify({
                sessionId: operation.ownerRecoverySessionId,
                replacementSessionId:
                    operation.ownerRecoveryReplacementSessionId,
            }),
        );
        getHistoryMock.mockResolvedValueOnce({
            ...historyWithTurn({
                sessionId: operation.previousSessionId,
                requestId: "terminal-same-owner-turn",
                status: "completed",
                answer: "Same-owner история сохранена.",
            }),
            next_before_sequence: 15,
        });
        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Terminal recovery отклонён."),
        );

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(result.current.sessionId).not.toBe(
            operation.ownerRecoverySessionId,
        );
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 15,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Same-owner история сохранена.",
                    }),
                ]),
            }),
        );
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(result.current.historyError).toBeTruthy();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();

        unmount();
    });

    it("resumes terminal cleanup without replaying a rejected lifecycle pair", async () => {
        const operation = {
            previousSessionId: "cleanup-phase-session",
            newSessionId: "cleanup-phase-successor",
            ownerRecoverySessionId: "cleanup-phase-recovery",
            ownerRecoveryReplacementSessionId:
                "cleanup-phase-replacement",
            ownerRecoveryRejectionStatus: 409 as const,
            ownerRecoveryTerminalAttempt: true,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_session_resolution",
            JSON.stringify({
                sessionId: operation.ownerRecoverySessionId,
                replacementSessionId:
                    operation.ownerRecoveryReplacementSessionId,
            }),
        );
        getHistoryMock.mockResolvedValue({
            ...historyWithTurn({
                sessionId: operation.previousSessionId,
                requestId: "cleanup-phase-turn",
                status: "completed",
                answer: "История сохраняется после cleanup retry.",
            }),
            next_before_sequence: 21,
        });
        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Terminal pair отклонён."),
        );
        const originalRemoveItem = Storage.prototype.removeItem;
        const removeItemSpy = vi
            .spyOn(Storage.prototype, "removeItem")
            .mockImplementation(function (this: Storage, key) {
                if (key === "vera_pending_session_resolution") return;
                return originalRemoveItem.call(this, key);
            });

        const firstMount = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(firstMount.result.current.isHistoryLoading).toBe(false);
        });
        const pendingCleanup = JSON.parse(
            window.sessionStorage.getItem("vera_pending_new_dialog") ?? "{}",
        ) as { ownerRecoveryUsableSessionId?: string };
        expect(pendingCleanup.ownerRecoveryUsableSessionId).toBeTruthy();
        expect(firstMount.result.current.sessionId).toBe(
            pendingCleanup.ownerRecoveryUsableSessionId,
        );
        expect(firstMount.result.current.hasPendingNewDialog).toBe(true);
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).not.toBeNull();
        firstMount.unmount();
        removeItemSpy.mockRestore();

        const secondMount = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(secondMount.result.current.isHistoryLoading).toBe(false);
            expect(secondMount.result.current.hasPendingNewDialog).toBe(false);
        });

        expect(resolveSessionMock).toHaveBeenCalledOnce();
        expect(secondMount.result.current.sessionId).toBe(
            pendingCleanup.ownerRecoveryUsableSessionId,
        );
        expect(secondMount.result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 21,
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();

        secondMount.unmount();
    });

    it("terminates a preloaded foreign recovery after its bounded pair returns 409", async () => {
        const operation = {
            previousSessionId: "terminal-foreign-session",
            newSessionId: "terminal-foreign-successor",
            ownerRecoverySessionId: "terminal-foreign-recovery-session",
            ownerRecoveryReplacementSessionId:
                "terminal-foreign-recovery-successor",
            ownerRecoveryRejectionStatus: 403 as const,
            ownerRecoveryTerminalAttempt: true,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                requestId: "terminal-private-request",
                sessionId: operation.previousSessionId,
                message: "Текст прежнего владельца.",
                createdAt: Date.now(),
            }),
        );
        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(409, "Terminal recovery конфликтует."),
        );

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(result.current.sessionId).not.toBe(
            operation.ownerRecoverySessionId,
        );
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(result.current.historyError).toBeTruthy();
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();

        unmount();
    });

    it("keeps a terminal foreign recovery retryable when the usable session write fails", async () => {
        const operation = {
            previousSessionId: "quota-foreign-session",
            newSessionId: "quota-foreign-successor",
            ownerRecoverySessionId: "quota-recovery-session",
            ownerRecoveryReplacementSessionId: "quota-recovery-successor",
            ownerRecoveryRejectionStatus: 403 as const,
            ownerRecoveryTerminalAttempt: true,
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.ownerRecoverySessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        window.sessionStorage.setItem(
            "vera_pending_request",
            JSON.stringify({
                requestId: "quota-private-request",
                sessionId: operation.previousSessionId,
                message: "Текст не должен пережить foreign cleanup.",
                createdAt: Date.now(),
            }),
        );
        resolveSessionMock.mockRejectedValueOnce(
            new ApiRequestError(409, "Terminal recovery конфликтует."),
        );
        const originalSetItem = Storage.prototype.setItem;
        let sessionWrites = 0;
        const setItemSpy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(function (this: Storage, key, value) {
                if (key === "vera_session_id") {
                    sessionWrites += 1;
                    if (sessionWrites === 2) {
                        throw new DOMException(
                            "Storage full",
                            "QuotaExceededError",
                        );
                    }
                }
                return originalSetItem.call(this, key, value);
            });

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledOnce();
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(result.current.hasPendingNewDialog).toBe(true);
        expect(result.current.isStartingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ),
        ).toMatchObject(operation);
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ).ownerRecoveryUsableSessionId,
        ).toBeTruthy();
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(window.sessionStorage.getItem("vera_session_id")).toBeNull();

        let blockedSend;
        await act(async () => {
            blockedSend = await result.current.sendMessage(
                "Новый текст пока не отправляем.",
            );
        });
        expect(blockedSend).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });
        expect(sendMessageMock).not.toHaveBeenCalled();

        setItemSpy.mockRestore();
        let retried = false;
        await act(async () => {
            retried = await result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(resolveSessionMock).toHaveBeenCalledOnce();
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("abandons a 409 explicit lifecycle operation without retrying the doomed successor", async () => {
        const operation = {
            previousSessionId: "same-owner-doomed-session",
            newSessionId: "same-owner-doomed-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockImplementation(async (sessionId) => ({
            ...historyWithTurn({
                sessionId,
                requestId: "same-owner-visible-turn",
                status: "completed",
                answer: "Контекст same-owner операции.",
            }),
            next_before_sequence: 7,
        }));
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Recovery window истёк."),
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

        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(createSessionMock).not.toHaveBeenCalled();
        expect(result.current.sessionId).not.toBe(
            operation.previousSessionId,
        );
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 7,
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: "Контекст same-owner операции.",
                    }),
                ]),
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("settles a freshly generated recovery rejection in the same bounded action", async () => {
        const operation = {
            previousSessionId: "fresh-reject-session",
            newSessionId: "fresh-reject-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockResolvedValue({
            ...historyWithTurn({
                sessionId: operation.previousSessionId,
                requestId: "fresh-reject-visible-turn",
                status: "completed",
                answer: "Same-owner история после bounded recovery.",
            }),
            next_before_sequence: 9,
        });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Исходная lifecycle пара устарела."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Fresh recovery pair отклонена."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Terminal pair отклонена."),
            );

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(3);
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(resolveSessionMock.mock.calls[0][0]).toEqual({
            session_id: operation.previousSessionId,
            replacement_session_id: operation.newSessionId,
        });
        expect(resolveSessionMock.mock.calls[1][0]).not.toEqual(
            resolveSessionMock.mock.calls[2][0],
        );
        expect(result.current.previousSessionGroups).toContainEqual(
            expect.objectContaining({
                sessionId: operation.previousSessionId,
                historyCursor: 9,
            }),
        );
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(result.current.historyError).toBeTruthy();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();

        unmount();
    });

    it("does not archive a 409 predecessor when its history proves foreign", async () => {
        const operation = {
            previousSessionId: "foreign-409-session",
            newSessionId: "foreign-409-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        useAuthStore.setState({
            user: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            isAuthenticated: true,
            isLoading: false,
        });
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Чужая история."),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "user-b-current-after-409",
        });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Recovery window истёк."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });

        expect(result.current.sessionId).toBe(
            "user-b-current-after-409",
        );
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("recovers a 409 explicit lifecycle operation when strict history returns 503", async () => {
        const operation = {
            previousSessionId: "expired-proof-409-session",
            newSessionId: "expired-proof-409-successor",
        };
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: operation.previousSessionId }),
        );
        window.sessionStorage.setItem(
            "vera_pending_new_dialog",
            JSON.stringify(operation),
        );
        getHistoryMock.mockRejectedValueOnce(
            new ApiRequestError(503, "Owner proof expired."),
        );
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(409, "Recovery window истёк."),
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

        expect(result.current.sessionId).not.toBe(
            operation.previousSessionId,
        );
        expect(result.current.previousSessionGroups).toContainEqual({
            sessionId: operation.previousSessionId,
            messages: [],
            historyCursor: null,
        });
        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(createSessionMock).not.toHaveBeenCalled();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("abandons a foreign predecessor when explicit close is rejected", async () => {
        getHistoryMock.mockImplementation(async (sessionId) =>
            historyWithTurn({
                sessionId,
                requestId: "visible-request",
                status: "completed",
                answer: "Видимый ответ остаётся на месте.",
            }),
        );
        closeSessionMock.mockRejectedValueOnce(
            new ApiRequestError(403, "Чужая сессия."),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() => expect(result.current.messages).toHaveLength(2));
        const previousSessionId = result.current.sessionId;
        let started = false;
        await act(async () => {
            started = await result.current.startNewDialog();
        });

        expect(started).toBe(true);
        expect(result.current.sessionId).not.toBe(previousSessionId);
        expect(result.current.messages).toEqual([]);
        expect(result.current.previousSessionGroups).toEqual([]);
        expect(createSessionMock).not.toHaveBeenCalled();
        expect(getCurrentSessionMock).toHaveBeenCalledTimes(2);
        expect(result.current.error).toBeNull();
        expect(result.current.isStartingNewDialog).toBe(false);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("retries the same durable new id after create transport failure", async () => {
        createSessionMock.mockRejectedValueOnce(
            new ApiRequestError(504, "Сервер не отвечает."),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );

        await act(async () => {
            await result.current.startNewDialog();
        });
        const pendingOperation = JSON.parse(
            window.sessionStorage.getItem("vera_pending_new_dialog") ?? "{}",
        ) as { previousSessionId: string; newSessionId: string };
        expect(pendingOperation.newSessionId).toBeTruthy();
        expect(result.current.sessionId).toBe(
            pendingOperation.previousSessionId,
        );

        let blockedSend;
        await act(async () => {
            blockedSend = await result.current.sendMessage(
                "Не отправлять в закрытый диалог.",
            );
        });
        expect(blockedSend).toEqual({
            outcome: "rejected",
            restoreDraft: true,
        });
        expect(sendMessageMock).not.toHaveBeenCalled();

        await act(async () => {
            await result.current.startNewDialog();
        });

        expect(createSessionMock.mock.calls[0][0].session_id).toBe(
            pendingOperation.newSessionId,
        );
        expect(createSessionMock.mock.calls[1][0].session_id).toBe(
            pendingOperation.newSessionId,
        );
        expect(closeSessionMock).toHaveBeenCalledTimes(2);
        expect(result.current.sessionId).toBe(pendingOperation.newSessionId);
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("resumes a durable new-dialog operation with the same id after remount", async () => {
        createSessionMock.mockRejectedValueOnce(
            new ApiRequestError(502, "Ответ создания потерян."),
        );
        const firstHook = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(firstHook.result.current.isHistoryLoading).toBe(false),
        );
        await act(async () => {
            await firstHook.result.current.startNewDialog();
        });
        const pendingOperation = JSON.parse(
            window.sessionStorage.getItem("vera_pending_new_dialog") ?? "{}",
        ) as { previousSessionId: string; newSessionId: string };
        firstHook.unmount();

        getCurrentSessionMock.mockClear();
        const recoveredHook = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(recoveredHook.result.current.sessionId).toBe(
                pendingOperation.newSessionId,
            );
            expect(
                recoveredHook.result.current.isStartingNewDialog,
            ).toBe(false);
        });
        expect(createSessionMock.mock.calls[0][0].session_id).toBe(
            pendingOperation.newSessionId,
        );
        expect(createSessionMock.mock.calls[1][0].session_id).toBe(
            pendingOperation.newSessionId,
        );
        expect(getCurrentSessionMock).not.toHaveBeenCalled();
        expect(
            recoveredHook.result.current.previousSessionGroups,
        ).toContainEqual(
            expect.objectContaining({
                sessionId: pendingOperation.previousSessionId,
            }),
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        recoveredHook.unmount();
    });

    it("keeps a remounted durable new-dialog operation retryable after another create failure", async () => {
        createSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(502, "Первый ответ создания потерян."),
            )
            .mockRejectedValueOnce(
                new ApiRequestError(504, "Повторный ответ создания потерян."),
            );
        const firstHook = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(firstHook.result.current.isHistoryLoading).toBe(false),
        );
        await act(async () => {
            await firstHook.result.current.startNewDialog();
        });
        const pendingOperation = JSON.parse(
            window.sessionStorage.getItem("vera_pending_new_dialog") ?? "{}",
        ) as { previousSessionId: string; newSessionId: string };
        firstHook.unmount();

        const recoveredHook = renderHook(() => useVeraChat());
        await waitFor(() => {
            expect(createSessionMock).toHaveBeenCalledTimes(2);
            expect(
                recoveredHook.result.current.isStartingNewDialog,
            ).toBe(false);
            expect(recoveredHook.result.current.isHistoryLoading).toBe(false);
        });
        expect(recoveredHook.result.current.hasPendingNewDialog).toBe(true);
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ),
        ).toEqual(pendingOperation);

        let retried = false;
        await act(async () => {
            retried = await recoveredHook.result.current.startNewDialog();
        });

        expect(retried).toBe(true);
        expect(createSessionMock).toHaveBeenCalledTimes(3);
        for (const [payload] of createSessionMock.mock.calls) {
            expect(payload.session_id).toBe(pendingOperation.newSessionId);
        }
        expect(recoveredHook.result.current.sessionId).toBe(
            pendingOperation.newSessionId,
        );
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        recoveredHook.unmount();
    });

    it.each([
        {
            label: "authenticated B",
            nextUser: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            currentSessionId: "user-b-current-session",
        },
        {
            label: "anonymous",
            nextUser: null,
            currentSessionId: null,
        },
    ])(
        "abandons user A's pending new-dialog journal after remount as $label",
        async ({ nextUser, currentSessionId }) => {
            useAuthStore.setState({
                user: {
                    email: "user-a@example.com",
                    first_name: "User",
                    last_name: "A",
                },
                isAuthenticated: true,
                isLoading: false,
            });
            createSessionMock.mockRejectedValueOnce(
                new ApiRequestError(504, "Ответ создания потерян."),
            );
            const firstHook = renderHook(() => useVeraChat());
            await waitFor(() =>
                expect(firstHook.result.current.isHistoryLoading).toBe(false),
            );
            await act(async () => {
                await firstHook.result.current.startNewDialog();
            });
            const userAOperation = JSON.parse(
                window.sessionStorage.getItem("vera_pending_new_dialog") ??
                    "{}",
            ) as { previousSessionId: string; newSessionId: string };
            firstHook.unmount();
            window.sessionStorage.setItem(
                "vera_pending_request",
                JSON.stringify({
                    sessionId: userAOperation.previousSessionId,
                    requestId: "user-a-pending-request",
                    message: "Незавершённый вопрос A",
                    createdAt: Date.now(),
                }),
            );
            window.sessionStorage.setItem(
                "vera_pending_session_resolution",
                JSON.stringify({
                    sessionId: userAOperation.previousSessionId,
                    replacementSessionId: "user-a-replacement",
                }),
            );

            useAuthStore.setState({
                user: nextUser,
                isAuthenticated: nextUser !== null,
                isLoading: false,
            });
            getCurrentSessionMock.mockReset().mockResolvedValue({
                session_id: currentSessionId,
            });
            getHistoryMock.mockImplementation(async (sessionId) => ({
                session_id: sessionId,
                turns: [],
                next_before_sequence: null,
            }));
            resolveSessionMock
                .mockReset()
                .mockRejectedValueOnce(
                    new ApiRequestError(403, "Чужой successor proof."),
                )
                .mockRejectedValueOnce(
                    new ApiRequestError(403, "Чужая сессия."),
                )
                .mockImplementation(async (data) => ({
                    session_id: data.session_id,
                    previous_session_id: null,
                    boundary: "created",
                    session_ttl_seconds: 86_400,
                }));
            const secondHook = renderHook(() => useVeraChat());

            await waitFor(() => {
                expect(secondHook.result.current.sessionId).toBeTruthy();
                expect(secondHook.result.current.sessionId).not.toBe(
                    userAOperation.previousSessionId,
                );
                expect(secondHook.result.current.sessionId).not.toBe(
                    userAOperation.newSessionId,
                );
                expect(secondHook.result.current.isHistoryLoading).toBe(false);
            });
            expect(getCurrentSessionMock).toHaveBeenCalledOnce();
            expect(resolveSessionMock).toHaveBeenCalledTimes(3);
            const recoveredSessionId =
                resolveSessionMock.mock.calls[2][0].session_id;
            if (currentSessionId) {
                expect(recoveredSessionId).toBe(currentSessionId);
            } else {
                expect(recoveredSessionId).toBeTruthy();
                expect(recoveredSessionId).not.toBe(
                    userAOperation.previousSessionId,
                );
            }
            expect(secondHook.result.current.sessionId).toBe(
                recoveredSessionId,
            );
            expect(secondHook.result.current.hasPendingNewDialog).toBe(false);
            expect(secondHook.result.current.previousSessionGroups).toEqual([]);
            for (const storageKey of [
                "vera_pending_request",
                "vera_pending_session_resolution",
                "vera_pending_new_dialog",
            ]) {
                expect(window.sessionStorage.getItem(storageKey)).toBeNull();
            }

            await act(async () => {
                await secondHook.result.current.sendMessage(
                    "Вопрос пользователя B.",
                );
            });
            expect(sendMessageMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    session_id: recoveredSessionId,
                    message: "Вопрос пользователя B.",
                }),
                expect.any(AbortSignal),
            );

            secondHook.unmount();
        },
    );

    it("continues create when an idempotent close reports an absent predecessor", async () => {
        closeSessionMock.mockRejectedValueOnce(
            new ApiRequestError(404, "Сессия уже отсутствует."),
        );
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.isHistoryLoading).toBe(false),
        );

        let started = false;
        await act(async () => {
            started = await result.current.startNewDialog();
        });

        expect(started).toBe(true);
        expect(createSessionMock).toHaveBeenCalledOnce();
        expect(result.current.sessionId).toBe(
            createSessionMock.mock.calls[0][0].session_id,
        );

        unmount();
    });

    it("continues the visible anonymous session after login instead of selecting older auth current", async () => {
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "local-anonymous-session", createdAt: 1 }),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "older-auth-session",
        });
        const { result, unmount } = renderHook(() => useVeraChat());
        await waitFor(() =>
            expect(result.current.sessionId).toBe("local-anonymous-session"),
        );

        act(() => {
            useAuthStore.setState({
                user: {
                    email: "user@example.com",
                    first_name: "User",
                    last_name: "Example",
                },
                isAuthenticated: true,
            });
        });

        await waitFor(() => {
            expect(resolveSessionMock).toHaveBeenCalledTimes(2);
            expect(result.current.isHistoryLoading).toBe(false);
        });
        expect(getCurrentSessionMock).not.toHaveBeenCalled();
        expect(resolveSessionMock.mock.calls[1][0].session_id).toBe(
            "local-anonymous-session",
        );
        expect(result.current.sessionId).toBe("local-anonymous-session");

        unmount();
    });

    it("falls back once when a remounted local id belongs to another authenticated user", async () => {
        useAuthStore.setState({
            user: {
                email: "user-b@example.com",
                first_name: "User",
                last_name: "B",
            },
            isAuthenticated: true,
            isLoading: false,
        });
        window.sessionStorage.setItem(
            "vera_session_id",
            JSON.stringify({ id: "user-a-local-session" }),
        );
        getCurrentSessionMock.mockResolvedValue({
            session_id: "user-b-server-session",
        });
        resolveSessionMock
            .mockRejectedValueOnce(
                new ApiRequestError(403, "Чужая сессия."),
            )
            .mockImplementationOnce(async (data) => ({
                session_id: data.session_id,
                previous_session_id: null,
                boundary: "retained",
                session_ttl_seconds: 86_400,
            }));

        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => {
            expect(result.current.sessionId).toBe(
                "user-b-server-session",
            );
            expect(result.current.isHistoryLoading).toBe(false);
        });
        expect(resolveSessionMock.mock.calls[0][0].session_id).toBe(
            "user-a-local-session",
        );
        expect(getCurrentSessionMock).toHaveBeenCalledOnce();
        expect(resolveSessionMock.mock.calls[1][0].session_id).toBe(
            "user-b-server-session",
        );
        expect(resolveSessionMock).toHaveBeenCalledTimes(2);

        unmount();
    });

    it("uses the authenticated user's current server session in a new tab", async () => {
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

    it("does not resurrect user A journals after a late new-dialog resolve rejection", async () => {
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
        let rejectLateResolve!: (reason: unknown) => void;
        resolveSessionMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectLateResolve = reject;
                }),
        );

        let newDialogPromise!: ReturnType<
            typeof result.current.startNewDialog
        >;
        act(() => {
            newDialogPromise = result.current.startNewDialog();
        });
        await waitFor(() => expect(rejectLateResolve).toBeDefined());

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
        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.sessionId).not.toBe(userASessionId);
        });
        const userBSessionId = result.current.sessionId;

        await act(async () => {
            rejectLateResolve(new ApiRequestError(403, "Чужая сессия."));
            await newDialogPromise;
        });

        expect(result.current.sessionId).toBe(userBSessionId);
        expect(result.current.isStartingNewDialog).toBe(false);
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_session_id") ?? "{}",
            ),
        ).toEqual({ id: userBSessionId });
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

        unmount();
    });

    it("does not resurrect user A journals after a late new-dialog create rejection", async () => {
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
        let rejectLateCreate!: (reason: unknown) => void;
        createSessionMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectLateCreate = reject;
                }),
        );

        let newDialogPromise!: ReturnType<
            typeof result.current.startNewDialog
        >;
        act(() => {
            newDialogPromise = result.current.startNewDialog();
        });
        await waitFor(() => expect(rejectLateCreate).toBeDefined());

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
        await waitFor(() => {
            expect(result.current.isHistoryLoading).toBe(false);
            expect(result.current.sessionId).not.toBe(userASessionId);
        });
        const userBSessionId = result.current.sessionId;

        await act(async () => {
            rejectLateCreate(new ApiRequestError(409, "ID уже занят."));
            await newDialogPromise;
        });

        expect(result.current.sessionId).toBe(userBSessionId);
        expect(result.current.isStartingNewDialog).toBe(false);
        expect(result.current.hasPendingNewDialog).toBe(false);
        expect(result.current.deliveryState).toBe("draft");
        expect(
            JSON.parse(
                window.sessionStorage.getItem("vera_session_id") ?? "{}",
            ),
        ).toEqual({ id: userBSessionId });
        expect(
            window.sessionStorage.getItem("vera_pending_request"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_session_resolution"),
        ).toBeNull();
        expect(
            window.sessionStorage.getItem("vera_pending_new_dialog"),
        ).toBeNull();

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
        useAuthStore.setState({
            user: {
                email: "first-user@example.com",
                first_name: "Первый",
                last_name: "Пользователь",
            },
            isAuthenticated: true,
            isLoading: false,
        });
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
