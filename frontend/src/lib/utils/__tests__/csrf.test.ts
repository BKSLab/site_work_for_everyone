import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { validateOrigin } from "../csrf";

// Минимальный мок NextRequest — использует только те свойства, что нужны validateOrigin
function makeRequest(
    method: string,
    headers: Record<string, string> = {},
): NextRequest {
    return {
        method,
        headers: new Headers(headers),
        nextUrl: new URL("http://localhost:3000/api/test"),
    } as unknown as NextRequest;
}

describe("validateOrigin", () => {
    it("returns null for GET requests", () => {
        const req = makeRequest("GET");
        expect(validateOrigin(req)).toBeNull();
    });

    it("returns null for HEAD requests", () => {
        const req = makeRequest("HEAD");
        expect(validateOrigin(req)).toBeNull();
    });

    it("returns null for OPTIONS requests", () => {
        const req = makeRequest("OPTIONS");
        expect(validateOrigin(req)).toBeNull();
    });

    it("returns null for POST with matching origin", () => {
        const req = makeRequest("POST", {
            origin: "http://localhost:3000",
            host: "localhost:3000",
        });
        expect(validateOrigin(req)).toBeNull();
    });

    it("returns 403 for POST with foreign origin", () => {
        const req = makeRequest("POST", {
            origin: "https://evil.com",
            host: "localhost:3000",
        });
        const result = validateOrigin(req);
        expect(result).not.toBeNull();
        expect(result?.status).toBe(403);
    });

    it("returns 403 for POST without origin and referer", () => {
        const req = makeRequest("POST", {
            host: "localhost:3000",
        });
        const result = validateOrigin(req);
        expect(result).not.toBeNull();
        expect(result?.status).toBe(403);
    });

    it("returns null for POST with matching referer (no origin)", () => {
        const req = makeRequest("POST", {
            referer: "http://localhost:3000/auth/login",
            host: "localhost:3000",
        });
        expect(validateOrigin(req)).toBeNull();
    });

    it("returns 403 for POST with foreign referer (no origin)", () => {
        const req = makeRequest("POST", {
            referer: "https://evil.com/page",
            host: "localhost:3000",
        });
        const result = validateOrigin(req);
        expect(result).not.toBeNull();
        expect(result?.status).toBe(403);
    });
});
