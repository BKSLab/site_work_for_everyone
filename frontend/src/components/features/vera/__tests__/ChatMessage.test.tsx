import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMessageFeedbackMock } = vi.hoisted(() => ({
    sendMessageFeedbackMock: vi.fn(),
}));

vi.mock("@/lib/api/vera", () => ({
    veraApi: {
        sendMessageFeedback: sendMessageFeedbackMock,
    },
}));

import { ChatMessage } from "../ChatMessage";

describe("ChatMessage accessibility", () => {
    beforeEach(() => {
        sendMessageFeedbackMock
            .mockReset()
            .mockImplementation(async (data) => ({
                id: "feedback-1",
                ...data,
                review_status: "new",
                created_at: "2026-07-29T12:00:00Z",
                updated_at: "2026-07-29T12:00:00Z",
            }));
    });

    it("adds a screen-reader sender label to a user message", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "user-1",
                    role: "user",
                    content: "Какая продолжительность отпуска?",
                }}
            />,
        );

        expect(screen.getByText("Вы:")).toHaveClass("sr-only");
        expect(
            screen.getByText("Какая продолжительность отпуска?"),
        ).toBeInTheDocument();
    });

    it.each([
        ["sending", "Отправляется…"],
        ["sent", "Отправлено"],
        ["rejected", "Не отправлено"],
        ["unknown", "Статус отправки неизвестен"],
    ] as const)("shows the %s delivery state for a user message", (status, label) => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "user-1",
                    role: "user",
                    content: "Какая продолжительность отпуска?",
                    deliveryStatus: status,
                }}
            />,
        );

        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("exposes one accessible sender label for Vera", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Продолжительность зависит от условий.",
                }}
            />,
        );

        expect(screen.getByText("Ассистент Вера")).toHaveAttribute(
            "aria-hidden",
            "true",
        );
        expect(screen.getByText("Ассистент Вера:")).toHaveClass("sr-only");
    });

    it("does not create a nested live region for the pending bubble", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "",
                    streaming: true,
                }}
            />,
        );

        expect(screen.getByText("Готовлю ответ")).toBeInTheDocument();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("keeps an empty answer visible when its outcome is unknown", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "",
                    streaming: false,
                    deliveryState: "unknown",
                }}
            />,
        );

        expect(
            screen.getByText(/статус ответа пока неизвестен/i),
        ).toBeInTheDocument();
        expect(screen.queryByText("Готовлю ответ")).not.toBeInTheDocument();
    });

    it.each([
        ["failed", /ответ завершился с ошибкой/i],
        ["unknown", /статус ответа неизвестен/i],
    ] as const)(
        "marks a partial %s answer as potentially incomplete",
        (deliveryState, label) => {
            render(
                <ChatMessage
                    sessionId="session-1"
                    message={{
                        id: "assistant-1",
                        role: "assistant",
                        content: "Неполный юридический ответ.",
                        streaming: false,
                        deliveryState,
                    }}
                />,
            );

            expect(screen.getByText(label)).toBeInTheDocument();
            expect(
                screen.getByText("Неполный юридический ответ."),
            ).toBeInTheDocument();
        },
    );

    it("offers accessible rating controls only for a completed answer", async () => {
        const user = userEvent.setup();
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Продолжительность зависит от условий.",
                    requestId: "request-1",
                    streaming: false,
                    feedbackEligible: true,
                }}
            />,
        );

        const upButton = screen.getByRole("button", {
            name: "Ответ полезен",
        });
        const downButton = screen.getByRole("button", {
            name: "Ответ не полезен",
        });
        expect(upButton).toHaveAttribute("aria-pressed", "false");
        expect(downButton).toHaveAttribute("aria-pressed", "false");

        await user.click(upButton);

        await waitFor(() => {
            expect(sendMessageFeedbackMock).toHaveBeenCalledWith({
                session_id: "session-1",
                request_id: "request-1",
                value: "up",
            });
        });
        expect(upButton).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("status")).toHaveTextContent(
            "Положительная оценка сохранена.",
        );
    });

    it("does not allow rating a partial answer after a stream failure", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Незавершённый ответ",
                    requestId: "request-1",
                    streaming: false,
                    feedbackEligible: false,
                }}
            />,
        );

        expect(
            screen.queryByRole("group", {
                name: "Оценить ответ Ассистента Веры",
            }),
        ).not.toBeInTheDocument();
    });

    it("restores the selected rating from chat history", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Сохранённый ответ.",
                    requestId: "request-1",
                    feedbackEligible: true,
                    feedbackValue: "down",
                }}
            />,
        );

        expect(
            screen.getByRole("button", { name: "Ответ не полезен" }),
        ).toHaveAttribute("aria-pressed", "true");
    });
});
