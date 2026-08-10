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
        /* В футере ответа два независимых status-региона: оценка и
           копирование. Они не срабатывают одновременно, поэтому проверяем
           именно тот, что относится к оценке. */
        const statusRegions = screen.getAllByRole("status");
        expect(
            statusRegions.some((region) =>
                region.textContent?.includes(
                    "Положительная оценка сохранена.",
                ),
            ),
        ).toBe(true);
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

    it("exposes each message as a list item", () => {
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Ответ.",
                }}
            />,
        );

        expect(screen.getByRole("listitem")).toBeInTheDocument();
    });

    it("copies the answer text and announces the result", async () => {
        /* `userEvent.setup()` ставит собственную заглушку буфера обмена,
           поэтому свой стаб подменяем после него. */
        const writeText = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Квота составляет 2 процента.",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", { name: "Скопировать ответ" }),
        );

        expect(writeText).toHaveBeenCalledWith("Квота составляет 2 процента.");
        await waitFor(() => {
            const statusRegions = screen.getAllByRole("status");
            expect(
                statusRegions.some((region) =>
                    region.textContent?.includes("Ответ скопирован."),
                ),
            ).toBe(true);
        });
        vi.unstubAllGlobals();
    });

    it("reports a clipboard failure instead of pretending the answer was copied", async () => {
        const writeText = vi.fn().mockRejectedValue(new Error("denied"));
        const user = userEvent.setup();
        vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
        render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "assistant-1",
                    role: "assistant",
                    content: "Ответ.",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", { name: "Скопировать ответ" }),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
            /не удалось скопировать/i,
        );
        vi.unstubAllGlobals();
    });

    it("does not offer copying for a user message or an empty answer", () => {
        const { rerender } = render(
            <ChatMessage
                sessionId="session-1"
                message={{
                    id: "user-1",
                    role: "user",
                    content: "Мой вопрос.",
                }}
            />,
        );

        expect(
            screen.queryByRole("button", { name: "Скопировать ответ" }),
        ).not.toBeInTheDocument();

        rerender(
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

        expect(
            screen.queryByRole("button", { name: "Скопировать ответ" }),
        ).not.toBeInTheDocument();
    });
});
