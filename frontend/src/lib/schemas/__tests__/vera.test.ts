import { describe, expect, it } from "vitest";
import {
    veraChatHistoryResponseSchema,
    veraChatResponseSchema,
    veraChatSchema,
    veraCurrentChatSessionResponseSchema,
    veraErrorResponseSchema,
    veraFeedbackResponseSchema,
    veraFeedbackSchema,
    veraMessageFeedbackResponseSchema,
    veraMessageFeedbackSchema,
    veraSseEventSchema,
} from "../vera";

describe("veraChatSchema", () => {
    const valid = {
        session_id: "conversation-1",
        request_id: "request-1",
        message: "Какой отпуск предоставляется работникам с инвалидностью?",
    };

    it("accepts separate conversation and delivery identifiers", () => {
        expect(veraChatSchema.safeParse(valid).success).toBe(true);
    });

    it("requires request_id for per-message SSE delivery", () => {
        const withoutRequestId = {
            session_id: valid.session_id,
            message: valid.message,
        };

        expect(veraChatSchema.safeParse(withoutRequestId).success).toBe(false);
    });

    it("rejects an empty request_id", () => {
        expect(
            veraChatSchema.safeParse({ ...valid, request_id: "" }).success,
        ).toBe(false);
    });
});

describe("veraFeedbackSchema", () => {
    const identifiers = {
        session_id: "conversation-1",
        submission_id: "submission-1",
    };

    it("accepts identifiers when every questionnaire field is omitted", () => {
        expect(veraFeedbackSchema.safeParse(identifiers).success).toBe(true);
    });

    it("accepts all questionnaire answers", () => {
        expect(
            veraFeedbackSchema.safeParse({
                ...identifiers,
                audience: "employer",
                usefulness: 4,
                trust: 5,
                comment: "Ответ помог разобраться.",
                contact_email: "user@example.ru",
            }).success,
        ).toBe(true);
    });

    it("rejects a rating outside the 1–5 scale", () => {
        expect(
            veraFeedbackSchema.safeParse({
                ...identifiers,
                usefulness: 6,
            }).success,
        ).toBe(false);
    });

    it("rejects an invalid optional contact email", () => {
        expect(
            veraFeedbackSchema.safeParse({
                ...identifiers,
                contact_email: "not-an-email",
            }).success,
        ).toBe(false);
    });

    it("requires a submission id", () => {
        expect(
            veraFeedbackSchema.safeParse({ session_id: "conversation-1" })
                .success,
        ).toBe(false);
    });

    it("uses Agent Service audience values", () => {
        expect(
            veraFeedbackSchema.safeParse({
                ...identifiers,
                audience: "seeker",
            }).success,
        ).toBe(true);
        expect(
            veraFeedbackSchema.safeParse({
                ...identifiers,
                audience: "person_with_disability",
            }).success,
        ).toBe(false);
    });
});

describe("veraMessageFeedbackSchema", () => {
    it("accepts an answer rating", () => {
        expect(
            veraMessageFeedbackSchema.safeParse({
                session_id: "conversation-1",
                request_id: "request-1",
                value: "down",
            }).success,
        ).toBe(true);
    });
});

describe("Vera HTTP response schemas", () => {
    const timestamp = "2026-08-09T12:00:00Z";

    it("accepts every successful response variant", () => {
        expect(
            veraChatResponseSchema.safeParse({ status: "queued" }).success,
        ).toBe(true);
        expect(
            veraCurrentChatSessionResponseSchema.safeParse({
                session_id: null,
            }).success,
        ).toBe(true);
        expect(
            veraChatHistoryResponseSchema.safeParse({
                session_id: "conversation-1",
                turns: [
                    {
                        request_id: "request-1",
                        sequence_number: 1,
                        question: "Вопрос",
                        answer: "Ответ",
                        status: "completed",
                        feedback_value: "up",
                        created_at: timestamp,
                        completed_at: timestamp,
                    },
                ],
                next_before_sequence: null,
            }).success,
        ).toBe(true);
        expect(
            veraFeedbackResponseSchema.safeParse({
                id: "feedback-1",
                session_id: "conversation-1",
                submission_id: "submission-1",
                review_status: "pending",
                created_at: timestamp,
            }).success,
        ).toBe(true);
        expect(
            veraMessageFeedbackResponseSchema.safeParse({
                id: "feedback-1",
                session_id: "conversation-1",
                request_id: "request-1",
                value: "down",
                review_status: "pending",
                created_at: timestamp,
                updated_at: timestamp,
            }).success,
        ).toBe(true);
    });

    it("accepts string and validation-list error responses", () => {
        expect(
            veraErrorResponseSchema.safeParse({ detail: "Forbidden" })
                .success,
        ).toBe(true);
        expect(
            veraErrorResponseSchema.safeParse({
                detail: [
                    {
                        loc: ["body", "message"],
                        msg: "Field required",
                        type: "missing",
                    },
                ],
            }).success,
        ).toBe(true);
    });

    it("rejects a response that does not match its endpoint contract", () => {
        expect(
            veraChatResponseSchema.safeParse({ status: "completed" }).success,
        ).toBe(false);
        expect(
            veraCurrentChatSessionResponseSchema.safeParse({
                session_id: 42,
            }).success,
        ).toBe(false);
    });
});

describe("veraSseEventSchema", () => {
    it.each([
        { type: "token", content: "Фрагмент" },
        { type: "done" },
        { type: "error", detail: "Не удалось ответить" },
    ])("accepts the $type event", (event) => {
        expect(veraSseEventSchema.safeParse(event).success).toBe(true);
    });

    it.each([
        { type: "token" },
        { type: "heartbeat" },
        null,
        42,
    ])("rejects an invalid event: %j", (event) => {
        expect(veraSseEventSchema.safeParse(event).success).toBe(false);
    });
});
