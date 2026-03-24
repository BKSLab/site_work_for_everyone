import { describe, it, expect } from "vitest";
import {
    loginSchema,
    registerSchema,
    verifyEmailSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
} from "../auth";

describe("loginSchema", () => {
    it("accepts valid data", () => {
        expect(
            loginSchema.safeParse({ email: "test@example.com", password: "password123" }).success
        ).toBe(true);
    });

    it("rejects empty email", () => {
        expect(
            loginSchema.safeParse({ email: "", password: "password123" }).success
        ).toBe(false);
    });

    it("rejects invalid email format", () => {
        expect(
            loginSchema.safeParse({ email: "notanemail", password: "password123" }).success
        ).toBe(false);
    });

    it("rejects short password (< 8 chars)", () => {
        expect(
            loginSchema.safeParse({ email: "test@example.com", password: "short" }).success
        ).toBe(false);
    });

    it("rejects password over 255 chars", () => {
        expect(
            loginSchema.safeParse({ email: "test@example.com", password: "a".repeat(256) }).success
        ).toBe(false);
    });
});

describe("registerSchema", () => {
    const valid = { username: "testuser", email: "test@example.com", password: "password123" };

    it("accepts valid data", () => {
        expect(registerSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects username shorter than 4 chars", () => {
        expect(
            registerSchema.safeParse({ ...valid, username: "abc" }).success
        ).toBe(false);
    });

    it("rejects username over 255 chars", () => {
        expect(
            registerSchema.safeParse({ ...valid, username: "a".repeat(256) }).success
        ).toBe(false);
    });

    it("rejects invalid email", () => {
        expect(
            registerSchema.safeParse({ ...valid, email: "bademail" }).success
        ).toBe(false);
    });

    it("rejects short password", () => {
        expect(
            registerSchema.safeParse({ ...valid, password: "1234567" }).success
        ).toBe(false);
    });

    it("rejects password over 255 chars", () => {
        expect(
            registerSchema.safeParse({ ...valid, password: "a".repeat(256) }).success
        ).toBe(false);
    });
});

describe("verifyEmailSchema", () => {
    it("accepts valid data", () => {
        expect(
            verifyEmailSchema.safeParse({ email: "test@example.com", code: "123456" }).success
        ).toBe(true);
    });

    it("rejects empty code", () => {
        expect(
            verifyEmailSchema.safeParse({ email: "test@example.com", code: "" }).success
        ).toBe(false);
    });

    it("rejects invalid email", () => {
        expect(
            verifyEmailSchema.safeParse({ email: "bademail", code: "123456" }).success
        ).toBe(false);
    });
});

describe("forgotPasswordSchema", () => {
    it("accepts valid email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "test@example.com" }).success).toBe(true);
    });

    it("rejects invalid email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "notanemail" }).success).toBe(false);
    });

    it("rejects empty email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
    });
});

describe("resetPasswordSchema", () => {
    const valid = { email: "test@example.com", code: "123456", new_password: "newpassword" };

    it("accepts valid data", () => {
        expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects empty code", () => {
        expect(
            resetPasswordSchema.safeParse({ ...valid, code: "" }).success
        ).toBe(false);
    });

    it("rejects short new_password", () => {
        expect(
            resetPasswordSchema.safeParse({ ...valid, new_password: "short" }).success
        ).toBe(false);
    });

    it("rejects new_password over 255 chars", () => {
        expect(
            resetPasswordSchema.safeParse({ ...valid, new_password: "a".repeat(256) }).success
        ).toBe(false);
    });
});
