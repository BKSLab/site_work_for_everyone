import { describe, it, expect } from "vitest";
import { getSafeRedirect } from "../redirect";

describe("getSafeRedirect", () => {
    it("returns / for null", () => {
        expect(getSafeRedirect(null)).toBe("/");
    });

    it("returns / for empty string", () => {
        expect(getSafeRedirect("")).toBe("/");
    });

    it("allows relative paths", () => {
        expect(getSafeRedirect("/favorites")).toBe("/favorites");
        expect(getSafeRedirect("/vacancies?page=2")).toBe("/vacancies?page=2");
    });

    it("blocks absolute URLs", () => {
        expect(getSafeRedirect("https://evil.com")).toBe("/");
        expect(getSafeRedirect("http://evil.com")).toBe("/");
    });

    it("blocks protocol-relative URLs", () => {
        expect(getSafeRedirect("//evil.com")).toBe("/");
    });

    it("blocks URLs with protocol in path", () => {
        expect(getSafeRedirect("/foo://bar")).toBe("/");
    });
});
