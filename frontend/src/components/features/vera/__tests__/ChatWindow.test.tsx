import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMessageRenderMock, useVeraChatMock } = vi.hoisted(() => ({
    chatMessageRenderMock: vi.fn(),
    useVeraChatMock: vi.fn(),
}));

vi.mock("@/hooks/useVeraChat", () => ({
    useVeraChat: useVeraChatMock,
}));

vi.mock("../ChatMessage", () => ({
    ChatMessage: (props: { message: { content: string } }) => {
        chatMessageRenderMock(props);
        return <div>{props.message.content}</div>;
    },
}));

import { ChatWindow } from "../ChatWindow";

describe("ChatWindow accessibility", () => {
    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
            configurable: true,
            value: vi.fn(),
        });
        chatMessageRenderMock.mockReset();
        useVeraChatMock.mockReset();
    });

    it("names the chat, history, status and message form", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(
            screen.getByRole("region", {
                name: "Чат с Ассистентом Верой",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("region", {
                name: "История переписки с Ассистентом Верой",
            }),
        ).toHaveAttribute("aria-busy", "false");
        expect(
            screen.getByRole("form", {
                name: "Отправка сообщения Ассистенту Вере",
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveAttribute(
            "aria-atomic",
            "true",
        );
        expect(screen.queryByRole("log")).not.toBeInTheDocument();
        const composer = screen.getByLabelText(
            "Сообщение для Ассистента Веры",
        );
        expect(composer).toHaveAttribute(
            "aria-describedby",
            "vera-chat-input-hint vera-chat-input-counter",
        );
        expect(composer).toHaveAttribute("maxLength", "4000");
        expect(screen.getByText("0 / 4000")).toBeInTheDocument();
        expect(
            screen.getByText(/консультацию можно отправить на почту/i),
        ).toBeInTheDocument();
    });

    it("keeps the input available while Vera is preparing an answer", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [
                {
                    id: "assistant-1",
                    role: "assistant",
                    content: "",
                    streaming: true,
                },
            ],
            sendMessage: vi.fn(),
            status: "waiting",
            error: null,
            announcement: "Ассистент Вера готовит ответ.",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(
            screen.getByRole("region", {
                name: "История переписки с Ассистентом Верой",
            }),
        ).toHaveAttribute("aria-busy", "true");
        expect(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
        ).toBeEnabled();
        expect(
            screen.getByRole("button", { name: "Отправить" }),
        ).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Ассистент Вера готовит ответ.",
        );
    });

    it.each(["submitting", "accepted", "processing", "streaming"])(
        "blocks submission and marks history busy while delivery is %s",
        (deliveryState) => {
            const sendMessage = vi.fn();
            useVeraChatMock.mockReturnValue({
                sessionId: "session-1",
                messages: [],
                sendMessage,
                status: "idle",
                deliveryState,
                error: null,
                announcement: "",
                isHistoryLoading: false,
                historyError: null,
            });

            render(<ChatWindow />);

            fireEvent.change(
                screen.getByLabelText("Сообщение для Ассистента Веры"),
                { target: { value: "Новый вопрос." } },
            );

            expect(
                screen.getByRole("button", { name: "Отправить" }),
            ).toBeDisabled();
            expect(
                screen.getByRole("region", {
                    name: "История переписки с Ассистентом Верой",
                }),
            ).toHaveAttribute("aria-busy", "true");
            expect(sendMessage).not.toHaveBeenCalled();
        },
    );

    it("does not submit a second request while delivery is unknown", () => {
        const sendMessage = vi.fn();
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage,
            status: "unavailable",
            deliveryState: "unknown",
            error: "Результат отправки уточняется.",
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");
        fireEvent.change(composer, {
            target: { value: "Отправить ещё раз." },
        });
        fireEvent.submit(
            screen.getByRole("form", {
                name: "Отправка сообщения Ассистенту Вере",
            }),
        );

        expect(
            screen.getByRole("button", { name: "Отправить" }),
        ).toBeDisabled();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(
            screen.getByRole("region", {
                name: "История переписки с Ассистентом Верой",
            }),
        ).toHaveAttribute("aria-busy", "false");
    });

    it.each(["draft", "completed", "failed"])(
        "allows a new request while delivery is %s",
        async (deliveryState) => {
            const sendMessage = vi.fn().mockResolvedValue({
                outcome: "accepted",
                restoreDraft: false,
            });
            useVeraChatMock.mockReturnValue({
                sessionId: "session-1",
                messages: [],
                sendMessage,
                status: "idle",
                deliveryState,
                error: null,
                announcement: "",
                isHistoryLoading: false,
                historyError: null,
            });

            render(<ChatWindow />);

            fireEvent.change(
                screen.getByLabelText("Сообщение для Ассистента Веры"),
                { target: { value: "Новый вопрос." } },
            );
            fireEvent.click(
                screen.getByRole("button", { name: "Отправить" }),
            );

            await waitFor(() => {
                expect(sendMessage).toHaveBeenCalledWith("Новый вопрос.");
            });
        },
    );

    it("shows a non-live status for a long consultation", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [
                {
                    id: "assistant-1",
                    role: "assistant",
                    content: "",
                    streaming: true,
                },
            ],
            sendMessage: vi.fn(),
            status: "long-running",
            error: null,
            announcement: "Ассистент Вера готовит ответ.",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(
            screen.getByText(/если вы попросили отправить консультацию/i),
        ).toBeVisible();
        expect(screen.getAllByRole("status")).toHaveLength(1);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Ассистент Вера готовит ответ.",
        );
        expect(
            screen.getByRole("region", {
                name: "История переписки с Ассистентом Верой",
            }),
        ).toHaveAttribute("aria-busy", "true");
        expect(
            screen.getByRole("button", { name: "Отправить" }),
        ).toBeDisabled();
    });

    it("enables sending after the user enters a message", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        fireEvent.change(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
            {
            target: { value: "Расскажите о квотах." },
            },
        );

        expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled();
        expect(screen.getByText("20 / 4000")).toBeInTheDocument();
    });

    it("restores the draft after a definitely rejected message", async () => {
        const sendMessage = vi.fn().mockResolvedValue({
            outcome: "rejected",
            restoreDraft: true,
        });
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage,
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const composer = screen.getByLabelText(
            "Сообщение для Ассистента Веры",
        );
        fireEvent.change(composer, {
            target: { value: "Расскажите об отпуске." },
        });
        fireEvent.submit(
            screen.getByRole("form", {
                name: "Отправка сообщения Ассистенту Вере",
            }),
        );

        await waitFor(() => {
            expect(composer).toHaveValue("Расскажите об отпуске.");
        });
        expect(composer).toHaveFocus();
    });

    it("moves a suggested question into the composer and focuses it", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        fireEvent.click(
            screen.getByRole("button", {
                name: "Какие квоты действуют при трудоустройстве?",
            }),
        );

        expect(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
        ).toHaveValue("Какие квоты действуют при трудоустройстве?");
        expect(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
        ).toHaveFocus();
    });

    it("sends with Enter and keeps Shift+Enter for a new line", () => {
        const sendMessage = vi.fn();
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage,
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const composer = screen.getByLabelText(
            "Сообщение для Ассистента Веры",
        );
        fireEvent.change(composer, {
            target: { value: "Расскажите о льготах." },
        });
        fireEvent.keyDown(composer, {
            key: "Enter",
            shiftKey: true,
        });
        expect(sendMessage).not.toHaveBeenCalled();

        fireEvent.keyDown(composer, { key: "Enter" });
        expect(sendMessage).toHaveBeenCalledWith("Расскажите о льготах.");
    });

    it("announces an error through an alert", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "unavailable",
            error: "Не удалось получить ответ Ассистента Веры.",
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Не удалось получить ответ Ассистента Веры.",
        );
    });

    it("offers a separate feedback action below the chat", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const feedbackButton = screen.getByRole("button", {
            name: "Оставить отзыв об Ассистенте Вере",
        });
        expect(feedbackButton).toBeEnabled();
        expect(feedbackButton).toHaveClass("bg-accent");
        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "Нам важно ваше мнение об Ассистенте Вере",
            }),
        ).toBeInTheDocument();
    });

    it("disables sending while chat history is loading", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: true,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(
            screen.getByText("Восстанавливаю историю диалога…"),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
        ).toBeDisabled();
        expect(
            screen.getByRole("region", {
                name: "История переписки с Ассистентом Верой",
            }),
        ).toHaveAttribute("aria-busy", "true");
    });

    it("does not rebuild the message list when only the composer changes", () => {
        const messages = [
            {
                id: "message-1",
                role: "assistant" as const,
                content: "Ответ Ассистента Веры.",
            },
        ];
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages,
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);
        const renderCount = chatMessageRenderMock.mock.calls.length;

        fireEvent.change(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
            { target: { value: "Новый вопрос" } },
        );

        expect(chatMessageRenderMock).toHaveBeenCalledTimes(renderCount);
    });

    it("keeps the reader position and offers a jump when new messages arrive", () => {
        const firstMessages = [
            {
                id: "message-1",
                role: "assistant" as const,
                content: "Первый ответ.",
            },
        ];
        const chatState = {
            sessionId: "session-1",
            messages: firstMessages,
            sendMessage: vi.fn(),
            status: "streaming",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        };
        useVeraChatMock.mockReturnValue(chatState);

        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", {
            name: "История переписки с Ассистентом Верой",
        });
        Object.defineProperties(history, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 500 },
            scrollTop: { configurable: true, writable: true, value: 100 },
        });
        const scrollToMock = vi.mocked(history.scrollTo);
        scrollToMock.mockClear();
        fireEvent.scroll(history);

        useVeraChatMock.mockReturnValue({
            ...chatState,
            messages: [
                ...firstMessages,
                {
                    id: "message-2",
                    role: "assistant" as const,
                    content: "Новый ответ.",
                },
            ],
        });
        rerender(<ChatWindow />);

        expect(scrollToMock).not.toHaveBeenCalled();
        const jumpButton = screen.getByRole("button", {
            name: "К новому сообщению",
        });
        expect(jumpButton).toHaveAttribute(
            "aria-controls",
            "vera-chat-history",
        );

        fireEvent.click(jumpButton);

        expect(scrollToMock).toHaveBeenCalledWith({
            top: 1_000,
            behavior: "smooth",
        });
        expect(
            screen.queryByRole("button", { name: "К новому сообщению" }),
        ).not.toBeInTheDocument();
    });

    it("continues automatic scrolling while the reader is near the bottom", () => {
        const firstMessages = [
            {
                id: "message-1",
                role: "assistant" as const,
                content: "Первый ответ.",
            },
        ];
        const chatState = {
            sessionId: "session-1",
            messages: firstMessages,
            sendMessage: vi.fn(),
            status: "streaming",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        };
        useVeraChatMock.mockReturnValue(chatState);

        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", {
            name: "История переписки с Ассистентом Верой",
        });
        Object.defineProperties(history, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 500 },
            scrollTop: { configurable: true, writable: true, value: 430 },
        });
        const scrollToMock = vi.mocked(history.scrollTo);
        scrollToMock.mockClear();
        fireEvent.scroll(history);

        useVeraChatMock.mockReturnValue({
            ...chatState,
            messages: [
                ...firstMessages,
                {
                    id: "message-2",
                    role: "assistant" as const,
                    content: "Новый ответ.",
                },
            ],
        });
        rerender(<ChatWindow />);

        expect(scrollToMock).toHaveBeenCalledWith({
            top: 1_000,
            behavior: "auto",
        });
        expect(
            screen.queryByRole("button", { name: "К новому сообщению" }),
        ).not.toBeInTheDocument();
    });

    it("preserves the viewport when tokens arrive before history is prepended", () => {
        const loadOlderHistory = vi.fn();
        const currentMessages = [
            {
                id: "message-2",
                role: "assistant" as const,
                content: "Новый ответ.",
            },
        ];
        const chatState = {
            sessionId: "session-1",
            messages: currentMessages,
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
            hasOlderHistory: true,
            isOlderHistoryLoading: false,
            loadOlderHistory,
        };
        useVeraChatMock.mockReturnValue(chatState);

        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", {
            name: "История переписки с Ассистентом Верой",
        });
        Object.defineProperties(history, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 500 },
            scrollTop: { configurable: true, writable: true, value: 200 },
        });
        const scrollToMock = vi.mocked(history.scrollTo);
        scrollToMock.mockClear();

        fireEvent.click(
            screen.getByRole("button", { name: "Показать предыдущие" }),
        );
        expect(loadOlderHistory).toHaveBeenCalledOnce();

        Object.defineProperty(history, "scrollHeight", {
            configurable: true,
            value: 1_200,
        });
        const appendedMessage = {
            id: "message-3",
            role: "assistant" as const,
            content: "Параллельный ответ.",
        };
        useVeraChatMock.mockReturnValue({
            ...chatState,
            isOlderHistoryLoading: true,
            messages: [...currentMessages, appendedMessage],
        });
        rerender(<ChatWindow />);

        expect(history.scrollTop).toBe(200);
        expect(scrollToMock).not.toHaveBeenCalled();

        Object.defineProperty(history, "scrollHeight", {
            configurable: true,
            value: 1_600,
        });
        useVeraChatMock.mockReturnValue({
            ...chatState,
            hasOlderHistory: false,
            messages: [
                {
                    id: "message-1",
                    role: "assistant" as const,
                    content: "Старый ответ.",
                },
                ...currentMessages,
                appendedMessage,
            ],
        });
        rerender(<ChatWindow />);

        expect(history.scrollTop).toBe(600);
        expect(scrollToMock).not.toHaveBeenCalled();
    });

    it("clears the history position marker when loading older messages fails", () => {
        const currentMessages = [
            {
                id: "message-1",
                role: "assistant" as const,
                content: "Текущий ответ.",
            },
        ];
        const chatState = {
            sessionId: "session-1",
            messages: currentMessages,
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
            hasOlderHistory: true,
            isOlderHistoryLoading: false,
            loadOlderHistory: vi.fn(),
        };
        useVeraChatMock.mockReturnValue(chatState);

        const { rerender } = render(<ChatWindow />);
        const history = screen.getByRole("region", {
            name: "История переписки с Ассистентом Верой",
        });
        Object.defineProperties(history, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 500 },
            scrollTop: { configurable: true, writable: true, value: 200 },
        });
        const scrollToMock = vi.mocked(history.scrollTo);
        scrollToMock.mockClear();

        fireEvent.click(
            screen.getByRole("button", { name: "Показать предыдущие" }),
        );
        useVeraChatMock.mockReturnValue({
            ...chatState,
            isOlderHistoryLoading: true,
        });
        rerender(<ChatWindow />);
        useVeraChatMock.mockReturnValue({
            ...chatState,
            historyError: "Не удалось загрузить предыдущие сообщения.",
        });
        rerender(<ChatWindow />);

        Object.defineProperty(history, "scrollHeight", {
            configurable: true,
            value: 1_100,
        });
        useVeraChatMock.mockReturnValue({
            ...chatState,
            hasOlderHistory: false,
            messages: [
                ...currentMessages,
                {
                    id: "message-2",
                    role: "assistant" as const,
                    content: "Новый ответ.",
                },
            ],
        });
        rerender(<ChatWindow />);

        expect(history.scrollTop).toBe(200);
        expect(scrollToMock).toHaveBeenCalledWith({
            top: 1_100,
            behavior: "auto",
        });
    });
});
