import { describe, expect, it } from "vitest";
import {
    veraChatSchema,
    veraFeedbackSchema,
    veraMessageFeedbackSchema,
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
