import { describe, expect, it } from "vitest";
import { authFlowUrl, emailContextError } from "../auth-flow";
import { isUnverifiedEmailError } from "@/lib/constants/auth-errors";

describe("auth flow context", () => {
    it("preserves editable email and nested local query parameters", () => {
        const path = authFlowUrl("/auth/forgot-password", "person+tag@example.com", "/assistant/start?step=2&source=hh");
        const url = new URL(path, "https://example.test");
        expect(url.searchParams.get("email")).toBe("person+tag@example.com");
        expect(url.searchParams.get("redirect")).toBe("/assistant/start?step=2&source=hh");
    });

    it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/\n/evil.test"])("does not propagate an unsafe target %j", (redirect) => {
        const url = new URL(authFlowUrl("/auth/login", "person@example.com", redirect), "https://example.test");
        expect(url.searchParams.has("redirect")).toBe(false);
        expect(url.searchParams.get("email")).toBe("person@example.com");
    });

    it("identifies missing and malformed email before submitting a code", () => {
        expect(emailContextError("")).toBe("Email обязателен.");
        expect(emailContextError("bad")).toBe("Некорректный email.");
        expect(emailContextError("person@example.com")).toBe("");
    });

    it("routes only explicit unverified-email reasons to verification", () => {
        expect(isUnverifiedEmailError("The email address has not been verified. Please confirm your email to proceed.")).toBe(true);
        expect(isUnverifiedEmailError("The user is inactive. Access is denied.")).toBe(false);
        expect(isUnverifiedEmailError("Email not verified or account inactive.")).toBe(false);
        expect(isUnverifiedEmailError("")).toBe(false);
    });
});
