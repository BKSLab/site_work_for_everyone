import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMessageRenderMock, useVeraChatMock } = vi.hoisted(() => ({
    chatMessageRenderMock: vi.fn(),
    useVeraChatMock: vi.fn(),
}));

/* Подменяется только сам хук: `SIMPLIFY_ANSWER_REQUEST` берётся настоящий,
   иначе тест на текст кнопки проверял бы копию строки, а не то, что реально
   уйдёт агенту. */
vi.mock("@/hooks/useVeraChat", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/hooks/useVeraChat")>()),
    useVeraChat: useVeraChatMock,
}));

vi.mock("../ChatMessage", () => ({
    ChatMessage: (props: {
        message: { content: string };
        sessionId: string;
        waitingStage?: string;
    }) => {
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
        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");
        expect(composer).toHaveAttribute(
            "aria-describedby",
            "vera-chat-input-hint",
        );
        expect(composer).toHaveAttribute("maxLength", "4000");
        expect(screen.getByText("0 / 4000")).toBeInTheDocument();
        expect(
            screen.getByText(/консультацию можно отправить на почту/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/при входе в аккаунт текущий диалог сохраняется/i),
        ).toBeVisible();

        const chat = screen.getByRole("region", {
            name: "Чат с Ассистентом Верой",
        });
        expect(chat).toHaveClass(
            "max-sm:flex-1",
            "max-sm:min-h-0",
            "max-sm:rounded-none",
        );
        expect(composer).toHaveAttribute("enterKeyHint", "send");
        expect(composer).toHaveClass("max-h-24", "sm:max-h-36");
        expect(
            screen.getByText("Вера может ошибаться — проверяйте важное."),
        ).toHaveClass("sm:hidden");
        expect(screen.getByText("0 / 4000")).toHaveClass("max-sm:sr-only");
    });

    it("keeps the character counter out of the composer description while typing", () => {
        /* Счётчик меняется на каждое нажатие. Если он входит в
           `aria-describedby`, скринридер переозвучивает описание целиком —
           подсказка «Enter — отправить» повторялась после каждой буквы. */
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            deliveryState: "draft",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });
        render(<ChatWindow />);
        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");

        fireEvent.change(composer, { target: { value: "Как" } });

        const describedBy = composer.getAttribute("aria-describedby") ?? "";
        expect(describedBy).not.toContain("vera-chat-input-counter");
        expect(describedBy).toBe("vera-chat-input-hint");
        /* Счётчик обновился и остался единым текстовым узлом. */
        expect(screen.getByText("3 / 4000")).toBeInTheDocument();
    });

    it("does not expose a new dialog action until a chat catalog exists", () => {
        /* Кнопка «Новый диалог» скрыта намеренно: без списка чатов она
           уводила предыдущий разговор из интерфейса после reload, и
           пользователь видел это как потерю консультации. Серверные
           create/close (VERA-029) при этом сохранены. */
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            startNewDialog: vi.fn(),
            status: "idle",
            deliveryState: "draft",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(
            screen.queryByRole("button", { name: "Новый диалог" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Создаю диалог…" }),
        ).not.toBeInTheDocument();
    });

    it("keeps the composer disabled while an interrupted session create is recovered", () => {
        /* Флаги остаются рабочими и без кнопки: незавершённое создание
           сессии восстанавливается после перезагрузки страницы, и до его
           завершения отправлять сообщение нельзя. */
        const chatState = {
            sessionId: "session-1",
            messages: [],
            sendMessage: vi.fn(),
            startNewDialog: vi.fn(),
            isStartingNewDialog: true,
            status: "idle",
            deliveryState: "draft",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        };
        useVeraChatMock.mockReturnValue(chatState);
        const { rerender } = render(<ChatWindow />);

        expect(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
        ).toBeDisabled();

        useVeraChatMock.mockReturnValue({
            ...chatState,
            isStartingNewDialog: false,
            hasPendingNewDialog: true,
        });
        rerender(<ChatWindow />);

        expect(
            screen.getByLabelText("Сообщение для Ассистента Веры"),
        ).toBeDisabled();
        expect(
            screen.getByRole("button", { name: "Отправить" }),
        ).toBeDisabled();
    });

    it("shows an accessible context boundary in message order and keeps the old feedback session", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "current-session",
            previousSessionGroups: [
                {
                    sessionId: "expired-session",
                    historyCursor: null,
                    messages: [
                        {
                            id: "old-answer",
                            role: "assistant",
                            content: "Ответ предыдущего диалога.",
                        },
                    ],
                },
            ],
            messages: [
                {
                    id: "new-question",
                    role: "user",
                    content: "Вопрос нового диалога.",
                },
            ],
            sendMessage: vi.fn(),
            status: "idle",
            deliveryState: "draft",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const oldMessage = screen.getByText("Ответ предыдущего диалога.");
        const separator = screen.getByRole("separator", {
            name: "Начало нового диалога",
        });
        const newMessage = screen.getByText("Вопрос нового диалога.");
        expect(separator).toHaveTextContent(
            "Контекст предыдущего диалога завершён",
        );
        expect(
            oldMessage.compareDocumentPosition(separator) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            separator.compareDocumentPosition(newMessage) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(chatMessageRenderMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ sessionId: "expired-session" }),
        );
        expect(chatMessageRenderMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ sessionId: "current-session" }),
        );
    });

    it("loads older messages for a completed predecessor", () => {
        const loadOlderPreviousHistory = vi.fn();
        useVeraChatMock.mockReturnValue({
            sessionId: "current-session",
            previousSessionGroups: [
                {
                    sessionId: "expired-session",
                    historyCursor: 2,
                    messages: [
                        {
                            id: "old-answer",
                            role: "assistant",
                            content: "Ответ предыдущего диалога.",
                        },
                    ],
                },
            ],
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            deliveryState: "draft",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
            olderPreviousHistorySessionId: null,
            loadOlderPreviousHistory,
        });

        render(<ChatWindow />);
        fireEvent.click(
            screen.getByRole("button", {
                name: "Показать предыдущие в завершённом диалоге",
            }),
        );

        expect(loadOlderPreviousHistory).toHaveBeenCalledWith(
            "expired-session",
        );
    });

    it("preserves the viewport when predecessor history is prepended", () => {
        const loadOlderPreviousHistory = vi.fn();
        const group = {
            sessionId: "expired-session",
            historyCursor: 2,
            messages: [
                {
                    id: "old-message-2",
                    role: "assistant" as const,
                    content: "Поздний ответ завершённого диалога.",
                },
            ],
        };
        const chatState = {
            sessionId: "current-session",
            previousSessionGroups: [group],
            messages: [],
            sendMessage: vi.fn(),
            status: "idle",
            deliveryState: "draft",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
            olderPreviousHistorySessionId: null,
            loadOlderPreviousHistory,
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
            screen.getByRole("button", {
                name: "Показать предыдущие в завершённом диалоге",
            }),
        );
        useVeraChatMock.mockReturnValue({
            ...chatState,
            olderPreviousHistorySessionId: "expired-session",
        });
        rerender(<ChatWindow />);

        Object.defineProperty(history, "scrollHeight", {
            configurable: true,
            value: 1_400,
        });
        useVeraChatMock.mockReturnValue({
            ...chatState,
            previousSessionGroups: [
                {
                    ...group,
                    historyCursor: null,
                    messages: [
                        {
                            id: "old-message-1",
                            role: "assistant" as const,
                            content: "Ранний ответ завершённого диалога.",
                        },
                        ...group.messages,
                    ],
                },
            ],
        });
        rerender(<ChatWindow />);

        expect(history.scrollTop).toBe(600);
        expect(scrollToMock).not.toHaveBeenCalled();
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
            waitingStage: "initial",
            error: null,
            announcement: "Ассистент Вера анализирует сообщение.",
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
            "Ассистент Вера анализирует сообщение.",
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
                {
                    target: { value: "Новый вопрос." },
                },
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

    it("keeps the draft while the waiting stage changes", () => {
        const chatState = {
            sessionId: "session-1",
            messages: [
                {
                    id: "assistant-1",
                    role: "assistant" as const,
                    content: "",
                    streaming: true,
                },
            ],
            sendMessage: vi.fn(),
            status: "waiting",
            deliveryState: "processing",
            waitingStage: "expected-delay",
            error: null,
            announcement: "Ассистент Вера разбирается в вопросе.",
            isHistoryLoading: false,
            historyError: null,
        };
        useVeraChatMock.mockReturnValue(chatState);
        const { rerender } = render(<ChatWindow />);
        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");

        fireEvent.change(composer, {
            target: { value: "Черновик следующего вопроса." },
        });
        useVeraChatMock.mockReturnValue({
            ...chatState,
            waitingStage: "extended",
            announcement: "Ассистент Вера продолжает готовить ответ.",
        });
        rerender(<ChatWindow />);

        expect(composer).toHaveValue("Черновик следующего вопроса.");
        expect(chatMessageRenderMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ waitingStage: "extended" }),
        );
        expect(
            screen.getByRole("button", { name: "Отправить" }),
        ).toBeDisabled();
    });

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
                {
                    target: { value: "Новый вопрос." },
                },
            );
            fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

            await waitFor(() => {
                expect(sendMessage).toHaveBeenCalledWith("Новый вопрос.");
            });
        },
    );

    it.each([
        ["expected-delay", "Ассистент Вера разбирается в вопросе."],
        ["extended", "Ассистент Вера продолжает готовить ответ."],
    ] as const)(
        "passes the %s stage into the existing Vera bubble",
        (waitingStage, announcement) => {
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
                deliveryState: "processing",
                waitingStage,
                error: null,
                announcement,
                isHistoryLoading: false,
                historyError: null,
            });

            render(<ChatWindow />);

            expect(chatMessageRenderMock).toHaveBeenCalledWith(
                expect.objectContaining({ waitingStage }),
            );
            expect(
                screen.queryByText(/подготовка ответа может занять/i),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/ответ появится здесь/i),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
            expect(screen.getAllByRole("status")).toHaveLength(1);
            expect(screen.getByRole("status")).toHaveTextContent(announcement);
            expect(
                screen.getByRole("region", {
                    name: "История переписки с Ассистентом Верой",
                }),
            ).toHaveAttribute("aria-busy", "true");
            expect(
                screen.getByRole("button", { name: "Отправить" }),
            ).toBeDisabled();
        },
    );

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

        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");
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

    it("reveals the less common suggested questions on demand on mobile", () => {
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

        const lessCommonQuestion = screen.getByRole("button", {
            name: "Какие льготы положены работнику?",
        });
        expect(lessCommonQuestion).toHaveClass("max-sm:hidden");

        fireEvent.click(
            screen.getByRole("button", { name: "Ещё примеры вопросов" }),
        );

        expect(lessCommonQuestion).not.toHaveClass("max-sm:hidden");
        expect(
            screen.queryByRole("button", { name: "Ещё примеры вопросов" }),
        ).not.toBeInTheDocument();
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

        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");
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

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent(
            "Не удалось получить ответ Ассистента Веры.",
        );
        expect(
            screen.getByRole("region", {
                name: "История переписки с Ассистентом Верой",
            }),
        ).toContainElement(alert);
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
            {
                target: { value: "Новый вопрос" },
            },
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

    it("offers the simplify action only under the last knowledge-base answer", () => {
        /* Агент упрощает последнюю реплику диалога, поэтому кнопка под более
           старым ответом переформулировала бы не его. */
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [
                {
                    id: "assistant-1",
                    role: "assistant" as const,
                    content: "Старый ответ по базе знаний.",
                    usedKnowledgeBase: true,
                },
                {
                    id: "user-2",
                    role: "user" as const,
                    content: "А если сокращение?",
                },
                {
                    id: "assistant-2",
                    role: "assistant" as const,
                    content: "Свежий ответ по базе знаний.",
                    usedKnowledgeBase: true,
                },
            ],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const simplifiable = chatMessageRenderMock.mock.calls
            .map(([props]) => props)
            .filter((props) => props.canSimplify);
        expect(simplifiable).toHaveLength(1);
        expect(simplifiable[0].message.id).toBe("assistant-2");
    });

    it.each([
        [
            "an answer without knowledge base data",
            {
                id: "assistant-1",
                role: "assistant" as const,
                content: "Привет!",
            },
        ],
        [
            "an answer that is still streaming",
            {
                id: "assistant-1",
                role: "assistant" as const,
                content: "Квота",
                usedKnowledgeBase: true,
                streaming: true,
            },
        ],
        [
            "a user message",
            { id: "user-1", role: "user" as const, content: "Какая квота?" },
        ],
    ])("hides the simplify action for %s", (_case, message) => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [message],
            sendMessage: vi.fn(),
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        expect(
            chatMessageRenderMock.mock.calls.some(
                ([props]) => props.canSimplify,
            ),
        ).toBe(false);
    });

    it("sends the prepared simplify request without touching the draft", async () => {
        const sendMessage = vi.fn().mockResolvedValue({
            outcome: "accepted",
            restoreDraft: false,
        });
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [
                {
                    id: "assistant-1",
                    role: "assistant" as const,
                    content: "Квота составляет 2%.",
                    usedKnowledgeBase: true,
                },
            ],
            sendMessage,
            status: "idle",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);
        const composer = screen.getByLabelText("Сообщение для Ассистента Веры");
        fireEvent.change(composer, { target: { value: "Мой черновик" } });

        const [props] = chatMessageRenderMock.mock.calls
            .map(([renderProps]) => renderProps)
            .filter((renderProps) => renderProps.canSimplify);
        props.onSimplify();

        await waitFor(() => {
            expect(sendMessage).toHaveBeenCalledWith(
                "Объясни предыдущий ответ проще",
                { waitingVariant: "simplify" },
            );
        });
        /* Кнопка не должна затирать или отправлять начатый вопрос
           пользователя. */
        expect(composer).toHaveValue("Мой черновик");
    });

    it("blocks the simplify action while a response is in flight", () => {
        useVeraChatMock.mockReturnValue({
            sessionId: "session-1",
            messages: [
                {
                    id: "assistant-1",
                    role: "assistant" as const,
                    content: "Квота составляет 2%.",
                    usedKnowledgeBase: true,
                },
            ],
            sendMessage: vi.fn(),
            status: "streaming",
            error: null,
            announcement: "",
            isHistoryLoading: false,
            historyError: null,
        });

        render(<ChatWindow />);

        const [props] = chatMessageRenderMock.mock.calls
            .map(([renderProps]) => renderProps)
            .filter((renderProps) => renderProps.canSimplify);
        expect(props.isSimplifyDisabled).toBe(true);
    });
});
