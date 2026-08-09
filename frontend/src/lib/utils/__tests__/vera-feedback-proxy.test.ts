import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type { NextRequest } from "next/server";

import {
    veraFeedbackSchema,
    veraMessageFeedbackSchema,
} from "@/lib/schemas/vera";
import {
    createVeraSessionToken,
    getVeraSessionCookieName,
} from "@/lib/utils/vera-session-token";

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
    const cookieValues = new Map(Object.entries(values));
    cookiesMock.mockResolvedValue({
        get: (name: string) => {
            const value = cookieValues.get(name);
            return value === undefined ? undefined : { value };
        },
        getAll: () =>
            [...cookieValues].map(([name, value]) => ({ name, value })),
    });
}

function sessionCookie(sessionId: string): Record<string, string> {
    return {
        [getVeraSessionCookieName(sessionId)]:
            createVeraSessionToken(sessionId),
    };
}

function createBackendResponse(status = 200, detail = "ok"): Response {
    return new Response(JSON.stringify({ detail }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function createAccessToken(exp = Math.floor(Date.now() / 1000) + 3600): string {
    const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
        sub: "user@example.com",
        first_name: "Иван",
        last_name: "Иванов",
        exp,
    })}.signature`;
}

describe("proxyVeraFeedback", () => {
    let proxyVeraFeedback: typeof import("../vera-feedback-proxy").proxyVeraFeedback;

    beforeAll(async () => {
        vi.stubEnv("AUTH_API_URL", "http://backend:8000");
        ({ proxyVeraFeedback } = await import("../vera-feedback-proxy"));
    });

    beforeEach(() => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    it("forwards Authorization and the existing session token for auth feedback", async () => {
        const accessToken = createAccessToken();
        const authSessionCookie = sessionCookie("auth-session");
        useCookies({
            access_token: accessToken,
            ...authSessionCookie,
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
        expect(headers.get("Authorization")).toBe(`Bearer ${accessToken}`);
        expect(headers.get("X-Vera-Session-Token")).toBe(
            Object.values(authSessionCookie)[0],
        );
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
            `${getVeraSessionCookieName("anonymous-session")}=`,
        );
    });

    it("forwards an up to down feedback change without altering the payload", async () => {
        useCookies(sessionCookie("anonymous-session"));
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
            access_token: createAccessToken(),
            ...sessionCookie("foreign-session"),
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

    it("returns a controlled 503 when the signing key is missing", async () => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "");
        useCookies({});
        const fetchMock = vi.fn();
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

        expect(response.status).toBe(503);
        expect(response.headers.get("X-Request-ID")).toBe("test-request-id");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns a controlled 503 when backend rejects the signed token", async () => {
        useCookies(sessionCookie("anonymous-session"));
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    createBackendResponse(401, "Сессия чата не подтверждена."),
                ),
        );

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

        expect(response.status).toBe(503);
        expect(response.headers.get("X-Request-ID")).toBe("test-request-id");
    });

    it("refreshes an expired access token before forwarding feedback", async () => {
        const refreshedAccessToken = createAccessToken();
        useCookies({
            access_token: createAccessToken(
                Math.floor(Date.now() / 1000) - 1,
            ),
            refresh_token: "refresh-token",
            ...sessionCookie("auth-session"),
        });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        access_token: refreshedAccessToken,
                        refresh_token: "rotated-refresh-token",
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            )
            .mockResolvedValueOnce(createBackendResponse());
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

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const feedbackInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
        expect(new Headers(feedbackInit.headers).get("Authorization")).toBe(
            `Bearer ${refreshedAccessToken}`,
        );
        expect(response.headers.get("set-cookie")).toContain(
            `access_token=${refreshedAccessToken}`,
        );
        expect(response.headers.get("set-cookie")).toContain(
            "refresh_token=rotated-refresh-token",
        );
    });

    it("deletes an expired per-session cookie while creating the current one", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));
        const expiredSessionId = "expired-session";
        const expiredCookieName = getVeraSessionCookieName(expiredSessionId);
        const expiredToken = createVeraSessionToken(expiredSessionId);
        vi.setSystemTime(new Date("2026-08-10T00:00:01Z"));
        useCookies({ [expiredCookieName]: expiredToken });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(createBackendResponse()),
        );

        const response = await proxyVeraFeedback({
            request: makeRequest("PUT", {
                session_id: "current-session",
                request_id: "turn-1",
                value: "up",
            }),
            method: "PUT",
            backendPath: "/api/vera/feedback/message",
            schema: veraMessageFeedbackSchema,
            limiter,
        });

        const setCookie = response.headers.get("set-cookie");
        expect(setCookie).toContain(`${expiredCookieName}=;`);
        expect(setCookie).toContain("Max-Age=0");
        expect(setCookie).toContain(
            `${getVeraSessionCookieName("current-session")}=`,
        );
    });
});
