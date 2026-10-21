import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";
import type {
    VeraChatMessage,
    VeraSendMessageResult,
} from "@/hooks/useVeraChat";

const { useVeraChatMock } = vi.hoisted(() => ({ useVeraChatMock: vi.fn() }));
vi.mock("@/hooks/useVeraChat", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/hooks/useVeraChat")>()),
    useVeraChat: useVeraChatMock,
}));
import { ChatWindow } from "../ChatWindow";

const answer: VeraChatMessage = {
    id: "answer-1",
    role: "assistant",
    content: "Long answer.\n\nSecond paragraph.",
    usedKnowledgeBase: true,
};

function state(overrides = {}) {
    return {
        sessionId: "session-1",
        messages: [answer],
        previousSessionGroups: [],
        sendMessage: vi
            .fn()
            .mockResolvedValue({ outcome: "accepted", restoreDraft: false }),
        status: "idle",
        deliveryState: "completed",
        error: null,
        announcement: "",
        isHistoryLoading: false,
        historyError: null,
        hasOlderHistory: false,
        isOlderHistoryLoading: false,
        loadOlderHistory: vi.fn(),
        ...overrides,
    };
}

function bounds(top: number, bottom: number) {
    return { top, bottom, height: bottom - top } as DOMRect;
}

describe("ChatWindow deliberate navigation and late results", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        useAuthStore.setState({ user: null, isLoading: false });
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
            configurable: true,
            value: vi.fn(),
        });
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: vi.fn(),
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("starts at the chat heading and does not refocus it on history or token updates", () => {
        const initial = state({ isHistoryLoading: true });
        useVeraChatMock.mockReturnValue(initial);
        const { rerender } = render(<ChatWindow />);
        const heading = screen.getByRole("heading", { level: 1, name: "Ассистент Вера" });
        expect(heading).toHaveFocus();
        expect(heading).toHaveAttribute("tabindex", "-1");
        const focus = vi.spyOn(heading, "focus");
        useVeraChatMock.mockReturnValue(state());
        rerender(<ChatWindow />);
        const input = screen.getByRole("textbox", { name: "Сообщение для Ассистента Веры" });
        input.focus();
        useVeraChatMock.mockReturnValue(state({ messages: [{ ...answer, streaming: true, content: "An updated answer" }] }));
        rerender(<ChatWindow />);
        expect(input).toHaveFocus();
        expect(focus).not.toHaveBeenCalled();
    });

    it("preserves focus outside the chat when it mounts", () => {
        render(<button>Outside action</button>);
        const outside = screen.getByRole("button", { name: "Outside action" });
        outside.focus();
        useVeraChatMock.mockReturnValue(state());
        render(<ChatWindow />);
        expect(outside).toHaveFocus();
    });

    it("reaches the last of 20 answers and returns to input with a fixed number of actions", async () => {
        useVeraChatMock.mockReturnValue(
            state({
                messages: Array.from({ length: 20 }, (_, index) => ({
                    ...answer,
                    id: `answer-${index}`,
                    content: `Answer ${index}`,
                })),
            }),
        );
        const user = userEvent.setup();
        render(<ChatWindow />);
        const input = screen.getByRole("textbox", {
            name: "Сообщение для Ассистента Веры",
        });
        expect(input).not.toHaveFocus();
        const jump = screen.getByRole("button", {
            name: "Перейти к последнему ответу",
        });
        const start = screen
            .getAllByRole("heading", { level: 2, name: "Ассистент Вера" })
            .at(-1)!;
        const history = screen.getByRole("region", { name: "История переписки с Ассистентом Верой" });
        history.scrollTop = 250;
        vi.spyOn(history, "getBoundingClientRect").mockReturnValue(bounds(180, 580));
        vi.spyOn(start, "getBoundingClientRect").mockReturnValue(bounds(520, 536));
        jump.focus();
        await user.keyboard("{Enter}");
        expect(start).toHaveFocus();
        expect(start).toHaveAccessibleName("Ассистент Вера");
        expect(history.scrollTo).toHaveBeenLastCalledWith({
            top: 582,
            behavior: "smooth",
        });
        expect(start.scrollIntoView).not.toHaveBeenCalled();
        await user.tab();
        expect(
            screen.getAllByRole("link", { name: "К вводу сообщения" }).at(-1),
        ).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(input).toHaveFocus();
    });

    it("does not animate an explicit answer jump with reduced motion", () => {
        vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
        useVeraChatMock.mockReturnValue(state());
        render(<ChatWindow />);
        const history = screen.getByRole("region", { name: "История переписки с Ассистентом Верой" });
        const start = screen.getByRole("heading", { level: 2, name: "Ассистент Вера" });
        history.scrollTop = 20;
        vi.spyOn(history, "getBoundingClientRect").mockReturnValue(bounds(100, 500));
        vi.spyOn(start, "getBoundingClientRect").mockReturnValue(bounds(40, 56));
        fireEvent.click(
            screen.getByRole("button", { name: "Перейти к последнему ответу" }),
        );
        expect(history.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
        expect(start.scrollIntoView).not.toHaveBeenCalled();
    });

    it("does not focus a ready answer during token/final updates", () => {
        const initial = state({ messages: [{ ...answer, streaming: true }] });
        useVeraChatMock.mockReturnValue(initial);
        const { rerender } = render(<ChatWindow />);
        const input = screen.getByRole("textbox", {
            name: "Сообщение для Ассистента Веры",
        });
        input.focus();
        useVeraChatMock.mockReturnValue(
            state({
                messages: [
                    {
                        ...answer,
                        content: `${answer.content} Finished.`,
                        streaming: false,
                    },
                ],
            }),
        );
        rerender(<ChatWindow />);
        expect(input).toHaveFocus();
    });

    it("keeps the chosen answer start when jump's own scroll reaches the bottom before more tokens arrive", () => {
        const initial = state({ messages: [{ ...answer, streaming: true }], status: "streaming", deliveryState: "streaming" });
        useVeraChatMock.mockReturnValue(initial);
        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", { name: "История переписки с Ассистентом Верой" });
        Object.defineProperties(history, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 500 },
            scrollTop: { configurable: true, writable: true, value: 100 },
        });
        fireEvent.scroll(history);
        fireEvent.click(screen.getByRole("button", { name: "Перейти к последнему ответу" }));
        // The browser clamps the local scroll for a short last answer to the bottom.
        history.scrollTop = 500;
        fireEvent.scroll(history);
        const scroll = vi.mocked(history.scrollTo);
        scroll.mockClear();
        useVeraChatMock.mockReturnValue({ ...initial, messages: [{ ...answer, streaming: true, content: `${answer.content} More tokens.` }] });
        rerender(<ChatWindow />);
        expect(scroll).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { level: 2, name: "Ассистент Вера" })).toHaveFocus();
    });

    it.each(["wheel", "touch", "scrollbar", "keyboard"])("resumes the existing bottom threshold after the reader scrolls using %s", (gesture) => {
        const initial = state({ messages: [{ ...answer, streaming: true }], status: "streaming", deliveryState: "streaming" });
        useVeraChatMock.mockReturnValue(initial);
        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", { name: "История переписки с Ассистентом Верой" });
        Object.defineProperties(history, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 500 },
            scrollTop: { configurable: true, writable: true, value: 100 },
        });
        fireEvent.scroll(history);
        fireEvent.click(screen.getByRole("button", { name: "Перейти к последнему ответу" }));
        history.scrollTop = 500;
        fireEvent.scroll(history);
        if (gesture === "wheel") fireEvent.wheel(history, { deltaY: -120 });
        if (gesture === "touch") fireEvent.touchMove(history);
        if (gesture === "scrollbar") fireEvent.pointerDown(history);
        if (gesture === "keyboard") fireEvent.keyDown(history, { key: "PageUp" });
        // Moving far from the bottom preserves reading; returning near it resumes following.
        history.scrollTop = 100;
        fireEvent.scroll(history);
        const scroll = vi.mocked(history.scrollTo);
        scroll.mockClear();
        useVeraChatMock.mockReturnValue({ ...initial, messages: [{ ...answer, streaming: true, content: `${answer.content} More tokens.` }] });
        rerender(<ChatWindow />);
        expect(scroll).not.toHaveBeenCalled();
        history.scrollTop = 450;
        fireEvent.scroll(history);
        useVeraChatMock.mockReturnValue({ ...initial, messages: [{ ...answer, streaming: true, content: `${answer.content} More tokens. Following again.` }] });
        rerender(<ChatWindow />);
        expect(scroll).toHaveBeenCalledOnce();
        expect(scroll).toHaveBeenCalledWith({ top: 1_000, behavior: "auto" });
    });

    it.each(["owner", "session"])("isolates a closed pending feedback operation across a changed %s", async (boundary) => {
        const { veraApi } = await import("@/lib/api/vera");
        let finish!: () => void;
        const pendingResponse = new Promise<Awaited<ReturnType<typeof veraApi.sendFeedback>>>((resolve) => {
            finish = () => resolve({ id: "feedback-old", session_id: "session-1", submission_id: "old", review_status: "new", created_at: "2026-10-21T12:00:00Z" });
        });
        const feedback = vi.spyOn(veraApi, "sendFeedback").mockReturnValueOnce(pendingResponse).mockImplementation(() => new Promise(() => undefined));
        try {
            useAuthStore.setState({ user: { email: "owner-a@example.test", first_name: "A", last_name: "A" }, isLoading: false });
            useVeraChatMock.mockReturnValue(state());
            const user = userEvent.setup();
            const { rerender } = render(<ChatWindow />);
            const trigger = screen.getByRole("button", { name: "Оставить отзыв об Ассистенте Вере" });
            await user.click(trigger);
            await user.type(screen.getByLabelText("Электронная почта для связи"), "private-a@example.test");
            await user.type(screen.getByLabelText(/Расскажите, пожалуйста/), "Private previous feedback");
            await user.click(screen.getByRole("button", { name: "Отправить отзыв" }));
            await user.keyboard("{Escape}");
            if (boundary === "owner") {
                act(() => useAuthStore.setState({ user: null, isLoading: false }));
            } else {
                useVeraChatMock.mockReturnValue(state({ sessionId: "session-2" }));
                rerender(<ChatWindow />);
            }
            await user.click(screen.getByRole("button", { name: "Оставить отзыв об Ассистенте Вере" }));
            const email = screen.getByLabelText("Электронная почта для связи");
            expect(email).toHaveValue("");
            expect(screen.getByLabelText(/Расскажите, пожалуйста/)).toHaveValue("");
            expect(screen.getByRole("button", { name: "Отправить отзыв" })).toBeEnabled();
            expect(feedback).toHaveBeenCalledOnce();
            await user.click(screen.getByRole("button", { name: "Отправить отзыв" }));
            expect(feedback).toHaveBeenCalledTimes(2);
            expect(feedback.mock.calls[1][0].submission_id).not.toBe(feedback.mock.calls[0][0].submission_id);
            expect(feedback.mock.calls[1][0].session_id).toBe(boundary === "session" ? "session-2" : "session-1");
            await act(async () => finish());
            expect(screen.getByRole("button", { name: "Отправка…" })).toHaveAttribute("aria-disabled", "true");
            expect(screen.getByRole("status")).toHaveTextContent("");
        } finally {
            feedback.mockRestore();
        }
    });

    it("restores rejected A without replacing B or stealing focus from Copy", async () => {
        let finish!: (value: VeraSendMessageResult) => void;
        const sendMessage = vi.fn(
            () =>
                new Promise<VeraSendMessageResult>((resolve) => {
                    finish = resolve;
                }),
        );
        useVeraChatMock.mockReturnValue(state({ sendMessage }));
        render(<ChatWindow />);
        const input = screen.getByRole("textbox", {
            name: "Сообщение для Ассистента Веры",
        });
        fireEvent.change(input, { target: { value: "Question A" } });
        fireEvent.submit(
            screen.getByRole("form", {
                name: "Отправка сообщения Ассистенту Вере",
            }),
        );
        fireEvent.change(input, { target: { value: "Question B" } });
        const copy = screen.getByRole("button", { name: "Скопировать ответ" });
        copy.focus();
        await act(async () =>
            finish({ outcome: "rejected", restoreDraft: true }),
        );
        expect(copy).toHaveFocus();
        expect(input).toHaveValue("Question B");
    });

    it.each([true, false])(
        "restores focus after simplify disappears only if its trigger still owned it: %s",
        async (keepFocus) => {
            const initial = state();
            useVeraChatMock.mockReturnValue(initial);
            const user = userEvent.setup();
            const { rerender } = render(<ChatWindow />);
            const trigger = screen.getByRole("button", {
                name: "Объяснить проще ответ Ассистента Веры",
            });
            trigger.focus();
            await user.keyboard("{Enter}");
            const copy = screen.getByRole("button", {
                name: "Скопировать ответ",
            });
            if (!keepFocus) copy.focus();
            useVeraChatMock.mockReturnValue({
                ...initial,
                messages: [
                    answer,
                    {
                        id: "next-user",
                        role: "user",
                        content: "Объясни предыдущий ответ проще",
                    },
                ],
            });
            rerender(<ChatWindow />);
            expect(trigger).not.toBeInTheDocument();
            expect(
                keepFocus
                    ? screen.getByRole("textbox", {
                          name: "Сообщение для Ассистента Веры",
                      })
                    : copy,
            ).toHaveFocus();
        },
    );

    it.each(["current", "previous"])(
        "moves from removed final %s pagination to the first loaded message",
        async (kind) => {
            vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
                return this.id.endsWith("-older-question") ? bounds(50, 70) : bounds(100, 500);
            });
            const group = {
                sessionId: "previous-1",
                messages: [answer],
                historyCursor: 2,
            };
            const initial = state(
                kind === "current"
                    ? { hasOlderHistory: true }
                    : {
                          messages: [],
                          previousSessionGroups: [group],
                          loadOlderPreviousHistory: vi.fn(),
                      },
            );
            useVeraChatMock.mockReturnValue(initial);
            const user = userEvent.setup();
            const { rerender } = render(<ChatWindow />);
            const history = screen.getByRole("region", { name: "История переписки с Ассистентом Верой" });
            history.scrollTop = 300;
            const trigger = screen.getByRole("button", {
                name:
                    kind === "current"
                        ? "Показать предыдущие"
                        : "Показать предыдущие в завершённом диалоге",
            });
            trigger.focus();
            await user.keyboard("{Enter}");
            vi.mocked(history.scrollTo).mockClear();
            const older: VeraChatMessage = {
                id: "older-question",
                role: "user",
                content: "Older question",
            };
            useVeraChatMock.mockReturnValue(
                kind === "current"
                    ? {
                          ...initial,
                          messages: [older, answer],
                          hasOlderHistory: false,
                      }
                    : {
                          ...initial,
                          previousSessionGroups: [
                              {
                                  ...group,
                                  messages: [older, answer],
                                  historyCursor: null,
                              },
                          ],
                      },
            );
            rerender(<ChatWindow />);
            expect(trigger).not.toBeInTheDocument();
            expect(
                screen.getByText("Older question").closest('[role="listitem"]'),
            ).toHaveFocus();
            expect(history.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 242, behavior: "auto" });
            expect(history.scrollIntoView).not.toHaveBeenCalled();
        },
    );

    it("does not submit IME confirmation or Shift+Enter, then sends one completed message", async () => {
        const chat = state();
        useVeraChatMock.mockReturnValue(chat);
        render(<ChatWindow />);
        const input = screen.getByRole("textbox", {
            name: "Сообщение для Ассистента Веры",
        });
        expect(input).toHaveAccessibleDescription(
            /Enter — отправить, Shift\+Enter — новая строка/,
        );
        fireEvent.change(input, { target: { value: "Question" } });
        fireEvent.keyDown(input, { key: "Enter", isComposing: true });
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
        expect(chat.sendMessage).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: "Enter" });
        await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledTimes(1));
    });

    it.each([
        { position: "above", top: 50, bottom: 70, expected: 242 },
        { position: "below", top: 520, bottom: 540, expected: 348 },
        { position: "visible", top: 200, bottom: 220, expected: null },
    ])("reveals the final history label only inside the list when $position", async ({ top, bottom, expected }) => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return this.id.startsWith("vera-history-start-") ? bounds(top, bottom) : bounds(100, 500);
        });
        const initial = state({ hasOlderHistory: true });
        useVeraChatMock.mockReturnValue(initial);
        const user = userEvent.setup();
        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", { name: "История переписки с Ассистентом Верой" });
        history.scrollTop = 300;
        const trigger = screen.getByRole("button", {
            name: "Показать предыдущие",
        });
        trigger.focus();
        await user.keyboard("{Enter}");
        vi.mocked(history.scrollTo).mockClear();
        useVeraChatMock.mockReturnValue({ ...initial, hasOlderHistory: false });
        rerender(<ChatWindow />);
        const label = screen.getByText("Вся история диалога загружена");
        expect(label).toHaveFocus();
        if (expected === null) {
            expect(history.scrollTo).not.toHaveBeenCalled();
            expect(history.scrollTop).toBe(300);
        } else {
            expect(history.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: expected, behavior: "auto" });
        }
        expect(label.scrollIntoView).not.toHaveBeenCalled();
    });
});
