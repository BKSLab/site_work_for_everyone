import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import {
    veraFeedbackSchema,
    veraMessageFeedbackSchema,
} from "@/lib/schemas/vera";

const cookiesMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/utils/logger", () => ({ logger: loggerMock }));

const limiter = {
    check: vi.fn(() => ({ allowed: true, resetAt: Date.now() + 60_000 })),
};

function makeRequest(
    method: "POST" | "PUT",
    body: Record<string, unknown>,
): NextRequest {
    return {
        method,
        headers: new Headers({
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-request-id": "test-request-id",
        }),
        nextUrl: new URL("http://localhost:3000/api/vera/feedback"),
        json: vi.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
}

function useCookies(values: Record<string, string>): void {
    cookiesMock.mockResolvedValue({
        get: (name: string) =>
            values[name] === undefined ? undefined : { value: values[name] },
    });
}

function createBackendResponse(status = 200): Response {
    return new Response(JSON.stringify({ detail: "ok" }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("proxyVeraFeedback", () => {
    let proxyVeraFeedback: typeof import("../vera-feedback-proxy").proxyVeraFeedback;

    beforeAll(async () => {
        vi.stubEnv("AUTH_API_URL", "http://backend:8000");
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
        ({ proxyVeraFeedback } = await import("../vera-feedback-proxy"));
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    it("forwards Authorization and the existing session token for auth feedback", async () => {
        useCookies({
            access_token: "access-token",
            vera_session_authsession: "session-token",
        });
        const fetchMock = vi
            .fn()
            .mockResolvedValue(createBackendResponse());
        vi.stubGlobal("fetch", fetchMock);

        const response = await proxyVeraFeedback({
            request: makeRequest("POST", {
                session_id: "auth-session",
                submission_id: "submission-1",
                usefulness: 5,
            }),
            method: "POST",
            backendPath: "/api/vera/feedback/session",
            schema: veraFeedbackSchema,
            limiter,
        });

        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer access-token");
        expect(headers.get("X-Vera-Session-Token")).toBe("session-token");
        expect(response.status).toBe(200);
        expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("creates a session token for anonymous feedback without Authorization", async () => {
        useCookies({});
        const fetchMock = vi
            .fn()
            .mockResolvedValue(createBackendResponse());
        vi.stubGlobal("fetch", fetchMock);

        const response = await proxyVeraFeedback({
            request: makeRequest("PUT", {
                session_id: "anonymous-session",
                request_id: "turn-1",
                value: "up",
            }),
            method: "PUT",
            backendPath: "/api/vera/feedback/message",
            schema: veraMessageFeedbackSchema,
            limiter,
        });

        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const headers = new Headers(init.headers);
        expect(headers.has("Authorization")).toBe(false);
        expect(headers.get("X-Vera-Session-Token")).toContain(".");
        expect(response.headers.get("set-cookie")).toContain(
            "vera_session_anonymoussession=",
        );
    });

    it("forwards an up to down feedback change without altering the payload", async () => {
        useCookies({ vera_session_anonymoussession: "session-token" });
        const fetchMock = vi
            .fn()
            .mockImplementation(() => Promise.resolve(createBackendResponse()));
        vi.stubGlobal("fetch", fetchMock);

        for (const value of ["up", "down"] as const) {
            await proxyVeraFeedback({
                request: makeRequest("PUT", {
                    session_id: "anonymous-session",
                    request_id: "turn-1",
                    value,
                }),
                method: "PUT",
                backendPath: "/api/vera/feedback/message",
                schema: veraMessageFeedbackSchema,
                limiter,
            });
        }

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(
            JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string),
        ).toMatchObject({ value: "up" });
        expect(
            JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string),
        ).toMatchObject({ value: "down" });
    });

    it("preserves an upstream ownership rejection", async () => {
        useCookies({
            access_token: "access-token",
            vera_session_foreignsession: "session-token",
        });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(createBackendResponse(403)),
        );

        const response = await proxyVeraFeedback({
            request: makeRequest("PUT", {
                session_id: "foreign-session",
                request_id: "turn-1",
                value: "down",
            }),
            method: "PUT",
            backendPath: "/api/vera/feedback/message",
            schema: veraMessageFeedbackSchema,
            limiter,
        });

        expect(response.status).toBe(403);
    });
});
