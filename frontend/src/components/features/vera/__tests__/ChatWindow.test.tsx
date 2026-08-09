import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useVeraChatMock } = vi.hoisted(() => ({
    useVeraChatMock: vi.fn(),
}));

vi.mock("@/hooks/useVeraChat", () => ({
    useVeraChat: useVeraChatMock,
}));

import { ChatWindow } from "../ChatWindow";

describe("ChatWindow accessibility", () => {
    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
            configurable: true,
            value: vi.fn(),
        });
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
});
