import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSessionMock, getHistoryMock, sendMessageMock } = vi.hoisted(
    () => ({
        getCurrentSessionMock: vi.fn(),
        getHistoryMock: vi.fn(),
        sendMessageMock: vi.fn().mockResolvedValue(undefined),
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
    static urls: string[] = [];
    static instances: FakeEventSource[] = [];

    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;

    constructor(url: string | URL) {
        FakeEventSource.urls.push(String(url));
        FakeEventSource.instances.push(this);
    }

    close() {
        this.closed = true;
    }

    emit(data: object) {
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }

    emitRaw(data: string) {
        this.onmessage?.({ data } as MessageEvent);
    }

    fail() {
        this.onerror?.();
    }
}

let animationFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();

function flushAnimationFrames() {
    const callbacks = [...animationFrames.values()];
    animationFrames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
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
        sendMessageMock.mockReset().mockResolvedValue(undefined);
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
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        expect(sendMessageMock).toHaveBeenCalledOnce();
        const payload = sendMessageMock.mock.calls[0][0];

        expect(payload.session_id).toBeTruthy();
        expect(payload.request_id).toBeTruthy();
        expect(FakeEventSource.urls).toEqual([
            `/vera/sse/${encodeURIComponent(payload.request_id)}`,
        ]);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            content: "Расскажите об отпуске.",
            deliveryStatus: "sent",
        });

        unmount();
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

    it("marks a definitely rejected message and requests draft restoration", async () => {
        sendMessageMock.mockRejectedValueOnce(
            new ApiRequestError(422, "Сообщение отклонено."),
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

        unmount();
    });

    it("keeps an ambiguous publication failure visible with unknown status", async () => {
        sendMessageMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const { result, unmount } = renderHook(() => useVeraChat());

        await waitFor(() => expect(result.current.sessionId).toBeTruthy());
        let sendResult;
        await act(async () => {
            sendResult = await result.current.sendMessage(
                "Расскажите об отпуске.",
            );
        });

        expect(sendResult).toEqual({
            outcome: "unknown",
            restoreDraft: false,
        });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]).toMatchObject({
            role: "user",
            deliveryStatus: "unknown",
        });

        unmount();
    });

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
            },
        ]);
        expect(result.current.announcement).toBe(
            "История диалога восстановлена.",
        );

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
        });

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

    it("removes an empty pending answer when the SSE connection fails", async () => {
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
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].role).toBe("user");

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
        });
        expect(result.current.announcement).toBe("");

        unmount();
    });

    it.each([
        ["malformed JSON", "{"],
        ["an invalid event", JSON.stringify({ type: "token" })],
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
        expect(result.current.messages).toHaveLength(1);

        unmount();
    });

    it("clears the pending answer when no SSE event arrives before timeout", async () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useVeraChat());

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.sendMessage("Расскажите об отпуске.");
        });

        act(() => {
            vi.advanceTimersByTime(100_000);
        });

        expect(result.current.status).toBe("unavailable");
        expect(result.current.announcement).toBe("");
        expect(result.current.error).toBe(
            "Ассистент Вера сейчас недоступен. Попробуйте позже.",
        );
        expect(result.current.messages).toHaveLength(1);

        unmount();
    });
});
