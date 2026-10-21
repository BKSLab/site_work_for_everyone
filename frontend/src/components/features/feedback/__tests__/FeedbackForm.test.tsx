import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/client";

const { sendFeedback } = vi.hoisted(() => ({ sendFeedback: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ authApi: { sendFeedback } }));

import { FeedbackForm } from "../FeedbackForm";

function deferred() {
    let resolve!: (value: { msg: string }) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<{ msg: string }>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fill(message: string, email = "") {
    fireEvent.change(screen.getByLabelText(/^Сообщение/), { target: { value: message } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
}

function submit() {
    fireEvent.submit(document.querySelector("form")!);
}

beforeEach(() => sendFeedback.mockReset().mockResolvedValue({ msg: "Сообщение отправлено." }));
afterEach(cleanup);

describe("feedback result and draft preservation", () => {
    it.each([9, 10, 2000, 2001])("describes limits before input and validates a message with %i characters", async (length) => {
        render(<FeedbackForm />);
        const message = screen.getByLabelText(/^Сообщение/);
        expect(message).toHaveAccessibleDescription("От 10 до 2000 символов.");
        expect(message).toHaveAttribute("maxlength", "2000");
        fill("a".repeat(length));
        submit();
        if (length === 9 || length === 2001) {
            expect(message).toHaveFocus();
            expect(message).toHaveAccessibleDescription(length === 9 ? /минимум 10/ : /превышать 2000/);
            expect(sendFeedback).not.toHaveBeenCalled();
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        } else {
            await waitFor(() => expect(sendFeedback).toHaveBeenCalledOnce());
            expect(sendFeedback.mock.calls[0][0].message).toHaveLength(length);
        }
    });

    it("focuses a bad reply email without discarding a valid message", () => {
        render(<FeedbackForm />);
        fill("A valid message", "bad");
        submit();
        expect(screen.getByLabelText(/^Email/)).toHaveFocus();
        expect(screen.getByLabelText(/^Сообщение/)).toHaveValue("A valid message");
        expect(sendFeedback).not.toHaveBeenCalled();
    });

    it("keeps the form and a single result status, clears only the submitted revision and permits a new message", async () => {
        const request = deferred();
        sendFeedback.mockReturnValueOnce(request.promise);
        render(<FeedbackForm />);
        const status = screen.getByRole("status");
        const message = screen.getByLabelText(/^Сообщение/);
        fill("A valid message", "person@example.com");
        act(() => { submit(); submit(); });
        expect(sendFeedback).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeDisabled();
        expect(status).toHaveTextContent("Отправляем сообщение…");
        expect(status.closest('[aria-busy="true"]')).toBeNull();
        message.focus();
        await act(async () => request.resolve({ msg: "Сообщение отправлено." }));
        expect(screen.getByRole("status")).toBe(status);
        expect(status).toHaveTextContent("Сообщение отправлено.");
        expect(message).toHaveFocus();
        expect(message).toHaveValue("");
        expect(screen.getByLabelText(/^Email/)).toHaveValue("");
        expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled();
        fill("The next message");
        submit();
        await waitFor(() => expect(sendFeedback).toHaveBeenCalledTimes(2));
    });

    it.each(["message", "email"])("preserves the entire new revision and current focus after a delayed success following a changed %s", async (field) => {
        const request = deferred();
        sendFeedback.mockReturnValueOnce(request.promise);
        render(<FeedbackForm />);
        fill("The submitted message", "old@example.com");
        submit();
        const target = screen.getByLabelText(field === "message" ? /^Сообщение/ : /^Email/);
        fireEvent.change(target, { target: { value: field === "message" ? "A new unsent message" : "new@example.com" } });
        target.focus();
        await act(async () => request.resolve({ msg: "Сообщение отправлено." }));
        expect(screen.getByLabelText(/^Сообщение/)).toHaveValue(field === "message" ? "A new unsent message" : "The submitted message");
        expect(screen.getByLabelText(/^Email/)).toHaveValue(field === "email" ? "new@example.com" : "old@example.com");
        expect(target).toHaveFocus();
        expect(screen.getByRole("status")).toHaveTextContent("Сообщение отправлено. Новая редакция сохранена.");
        expect(sendFeedback.mock.calls[0][0]).toMatchObject({ message: "The submitted message", reply_email: "old@example.com" });
    });

    it.each([new TypeError("offline"), new ApiRequestError(503, "Сервис временно недоступен.")])("preserves a new revision after rejection and permits retry: %s", async (error) => {
        const request = deferred();
        sendFeedback.mockReturnValueOnce(request.promise);
        render(<FeedbackForm />);
        fill("The submitted message");
        submit();
        fill("A new unsent message", "new@example.com");
        const email = screen.getByLabelText(/^Email/);
        email.focus();
        await act(async () => request.reject(error));
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByLabelText(/^Сообщение/)).toHaveValue("A new unsent message");
        expect(email).toHaveValue("new@example.com");
        expect(email).toHaveFocus();
        submit();
        await waitFor(() => expect(sendFeedback).toHaveBeenCalledTimes(2));
        expect(sendFeedback.mock.calls[1][0]).toMatchObject({ message: "A new unsent message", reply_email: "new@example.com" });
    });
});
