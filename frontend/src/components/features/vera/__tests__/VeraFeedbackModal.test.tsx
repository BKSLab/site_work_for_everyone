import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendFeedbackMock } = vi.hoisted(() => ({
    sendFeedbackMock: vi.fn(),
}));

vi.mock("@/lib/api/vera", () => ({
    veraApi: {
        sendFeedback: sendFeedbackMock,
    },
}));

import { VeraFeedbackModal } from "../VeraFeedbackModal";

describe("VeraFeedbackModal", () => {
    beforeEach(() => {
        sendFeedbackMock.mockReset().mockResolvedValue({
            id: "feedback-1",
            session_id: "session-1",
            submission_id: "submission-1",
            review_status: "new",
            created_at: "2026-07-29T12:05:00Z",
        });
    });

    it("opens an accessible questionnaire with optional fields", async () => {
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-1" />);

        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "Нам важно ваше мнение об Ассистенте Вере",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/мнение каждого о работе Ассистента Веры/i),
        ).toBeInTheDocument();

        const trigger = screen.getByRole("button", {
            name: "Оставить отзыв об Ассистенте Вере",
        });
        expect(trigger).toHaveClass("bg-accent", "text-accent-foreground");

        await user.click(trigger);

        expect(
            screen.getByRole("dialog", {
                name: "Отзыв об Ассистенте Вере",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("group", { name: "Кем вы являетесь?" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("group", {
                name: "Насколько консультация Ассистента Веры была полезна именно в вашей ситуации?",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("group", {
                name: "Насколько вы доверяете полученному ответу?",
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("heading", { level: 3 }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByLabelText(
                "Расскажите, пожалуйста, что вам понравилось, чего не хватило или что стоит улучшить либо сделать понятнее",
            ),
        ).not.toBeRequired();
        expect(
            screen.getByLabelText("Электронная почта для связи"),
        ).not.toBeRequired();
    });

    it("offers a compact mobile trigger without duplicating the card copy", async () => {
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-1" compactOnMobile />);

        const compactTrigger = screen.getByRole("button", {
            name: "Открыть форму отзыва об Ассистенте Вере",
        });
        expect(compactTrigger).toHaveTextContent("Отзыв");
        expect(
            screen.getByRole("region", {
                name: "Нам важно ваше мнение об Ассистенте Вере",
            }),
        ).toHaveClass("max-sm:hidden");

        await user.click(compactTrigger);

        expect(
            screen.getByRole("dialog", {
                name: "Отзыв об Ассистенте Вере",
            }),
        ).toBeInTheDocument();
    });

    it("allows sending an empty questionnaire with the session id", async () => {
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-1" />);

        await user.click(
            screen.getByRole("button", {
                name: "Оставить отзыв об Ассистенте Вере",
            }),
        );
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );

        await waitFor(() => {
            expect(sendFeedbackMock).toHaveBeenCalledWith({
                session_id: "session-1",
                submission_id: expect.any(String),
                audience: undefined,
                usefulness: undefined,
                trust: undefined,
                comment: undefined,
                contact_email: undefined,
            });
        });
        expect(
            screen.getByRole("dialog", { name: "Спасибо за отзыв" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Спасибо за отзыв об Ассистенте Вере! Он сохранён вместе с текущей сессией диалога.",
        );
        expect(
            screen.queryByText(/Ответьте только на те вопросы/i),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("heading", {
                name: "Отзыв об Ассистенте Вере",
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Закрыть" }),
        ).toBeInTheDocument();
    });

    it("sends the selected answers and free-form comment", async () => {
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-2" />);

        await user.click(
            screen.getByRole("button", {
                name: "Оставить отзыв об Ассистенте Вере",
            }),
        );
        await user.click(
            screen.getByRole("radio", {
                name: "Работодатель или представитель работодателя",
            }),
        );
        await user.click(screen.getByRole("radio", { name: "Скорее полезна" }));
        await user.click(
            screen.getByRole("radio", { name: "Полностью доверяю" }),
        );
        await user.type(
            screen.getByLabelText(
                "Расскажите, пожалуйста, что вам понравилось, чего не хватило или что стоит улучшить либо сделать понятнее",
            ),
            "Нужны более подробные ссылки.",
        );
        await user.type(
            screen.getByLabelText("Электронная почта для связи"),
            "user@example.ru",
        );
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );

        await waitFor(() => {
            expect(sendFeedbackMock).toHaveBeenCalledWith({
                session_id: "session-2",
                submission_id: expect.any(String),
                audience: "employer",
                usefulness: 4,
                trust: 5,
                comment: "Нужны более подробные ссылки.",
                contact_email: "user@example.ru",
            });
        });
    });

    it("announces an invalid optional email and does not submit", async () => {
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-3" />);

        await user.click(
            screen.getByRole("button", {
                name: "Оставить отзыв об Ассистенте Вере",
            }),
        );
        const emailInput = screen.getByLabelText("Электронная почта для связи");
        await user.type(emailInput, "not-an-email");
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Введите корректный адрес электронной почты.",
        );
        expect(emailInput).toHaveAttribute("aria-invalid", "true");
        expect(emailInput).toHaveFocus();
        expect(sendFeedbackMock).not.toHaveBeenCalled();
    });

    it("reuses submission_id when a failed request is retried", async () => {
        sendFeedbackMock
            .mockRejectedValueOnce(new Error("network error"))
            .mockResolvedValueOnce({
                id: "feedback-1",
                session_id: "session-4",
                submission_id: "submission-1",
                review_status: "new",
                created_at: "2026-07-29T12:05:00Z",
            });
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-4" />);

        await user.click(
            screen.getByRole("button", {
                name: "Оставить отзыв об Ассистенте Вере",
            }),
        );
        const submitButton = screen.getByRole("button", {
            name: "Отправить отзыв",
        });
        await user.click(submitButton);
        await screen.findByRole("alert");
        await user.click(submitButton);

        await waitFor(() => {
            expect(sendFeedbackMock).toHaveBeenCalledTimes(2);
        });
        expect(sendFeedbackMock.mock.calls[1][0].submission_id).toBe(
            sendFeedbackMock.mock.calls[0][0].submission_id,
        );
    });

    it.each(["Escape", "close", "cancel"])(
        "allows %s during a never-resolving submission and reopens that operation",
        async (action) => {
            sendFeedbackMock.mockImplementation(
                () => new Promise(() => undefined),
            );
            const user = userEvent.setup();
            render(<VeraFeedbackModal sessionId="session-1" />);
            const trigger = screen.getByRole("button", {
                name: "Оставить отзыв об Ассистенте Вере",
            });
            await user.click(trigger);
            await user.type(
                screen.getByLabelText("Электронная почта для связи"),
                "person@example.test",
            );
            await user.click(
                screen.getByRole("button", { name: "Отправить отзыв" }),
            );
            if (action === "Escape") await user.keyboard("{Escape}");
            else
                await user.click(
                    screen.getByRole("button", {
                        name: action === "close" ? "Закрыть" : "Отмена",
                    }),
                );
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            await waitFor(() => expect(trigger).toHaveFocus());
            await user.click(trigger);
            expect(
                screen.getByRole("button", { name: "Отправка…" }),
            ).toHaveAttribute("aria-disabled", "true");
            expect(
                screen.getByLabelText("Электронная почта для связи"),
            ).toHaveValue("person@example.test");
            fireEvent.submit(
                screen.getByRole("form", {
                    name: "Форма отзыва об Ассистенте Вере",
                }),
            );
            expect(sendFeedbackMock).toHaveBeenCalledTimes(1);
        },
    );

    it("keeps late success closed, preserves outside focus and shows the result on reopen", async () => {
        let finish!: () => void;
        sendFeedbackMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        const user = userEvent.setup();
        render(
            <>
                <button>Continue chat</button>
                <VeraFeedbackModal sessionId="session-1" />
            </>,
        );
        const trigger = screen.getByRole("button", {
            name: "Оставить отзыв об Ассистенте Вере",
        });
        await user.click(trigger);
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("");
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );
        await user.keyboard("{Escape}");
        const continueButton = screen.getByRole("button", {
            name: "Continue chat",
        });
        await user.click(continueButton);
        await act(async () => finish());
        expect(continueButton).toHaveFocus();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await user.click(trigger);
        expect(
            screen.getByRole("dialog", { name: "Спасибо за отзыв" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Спасибо за отзыв",
        );
        expect(sendFeedbackMock).toHaveBeenCalledTimes(1);
    });

    it("retains a late failure and retries with the same submission_id", async () => {
        let reject!: (error: Error) => void;
        sendFeedbackMock
            .mockImplementationOnce(
                () =>
                    new Promise((_resolve, rejectPromise) => {
                        reject = rejectPromise;
                    }),
            )
            .mockResolvedValueOnce({});
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-1" />);
        const trigger = screen.getByRole("button", {
            name: "Оставить отзыв об Ассистенте Вере",
        });
        await user.click(trigger);
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );
        await user.keyboard("{Escape}");
        await act(async () => reject(new Error("offline")));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await user.click(trigger);
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Не удалось отправить отзыв",
        );
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );
        expect(sendFeedbackMock).toHaveBeenCalledTimes(2);
        expect(sendFeedbackMock.mock.calls[1][0].submission_id).toBe(
            sendFeedbackMock.mock.calls[0][0].submission_id,
        );
    });

    it("updates the already mounted success status once", async () => {
        let finish!: () => void;
        sendFeedbackMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        const user = userEvent.setup();
        render(<VeraFeedbackModal sessionId="session-1" />);
        await user.click(
            screen.getByRole("button", {
                name: "Оставить отзыв об Ассистенте Вере",
            }),
        );
        const status = screen.getByRole("status");
        await user.click(
            screen.getByRole("button", { name: "Отправить отзыв" }),
        );
        await act(async () => finish());
        expect(screen.getByRole("status")).toBe(status);
        expect(status).toHaveTextContent("Спасибо за отзыв");
    });
});
