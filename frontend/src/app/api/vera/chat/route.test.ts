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
import { NextRequest } from "next/server";

import {
    createVeraSessionToken,
    getVeraSessionCookieName,
    readVeraSessionToken,
} from "@/lib/utils/vera-session-token";
import { VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX } from "@/lib/utils/vera-owner-headers";

const cookiesMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/utils/logger", () => ({ logger: loggerMock }));

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

function useCurrentSessionCookie(token: string): void {
    useCookies({ [getVeraSessionCookieName("session-1")]: token });
}

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost:3000/api/vera/chat", {
        method: "POST",
        headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Request-ID": "proxy-request-id",
        },
        body: JSON.stringify({
            session_id: "session-1",
            request_id: "message-request-id",
            message: "Вопрос",
        }),
    });
}

describe("POST /api/vera/chat lifecycle", () => {
    let POST: typeof import("./route").POST;

    beforeAll(async () => {
        vi.stubEnv("AUTH_API_URL", "http://backend:8000");
        ({ POST } = await import("./route"));
    });

    beforeEach(() => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    it("adds lifecycle-only payload and tokens while keeping the browser request unchanged", async () => {
        const currentToken = createVeraSessionToken("session-1");
        useCurrentSessionCookie(currentToken);
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json(
                {
                    request_id: "message-request-id",
                    stream_ticket: "signed.ticket",
                    stream_url: "/vera/sse/message-request-id",
                    session_id: "session-1",
                    previous_session_id: null,
                    boundary: "retained",
                    session_ttl_seconds: 86_400,
                },
                { status: 202 },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest());

        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(init.body as string)).toEqual({
            session_id: "session-1",
            request_id: "message-request-id",
            message: "Вопрос",
            replacement_session_id: "message-request-id",
        });
        const headers = new Headers(init.headers);
        expect(headers.get("X-Vera-Session-Token")).toBe(currentToken);
        expect(
            readVeraSessionToken(
                headers.get("X-Vera-Refreshed-Session-Token")!,
            ),
        ).toMatchObject({ session_id: "session-1" });
        expect(headers.get("X-Vera-Refreshed-Session-Token")).toBe(
            currentToken,
        );
        expect(
            readVeraSessionToken(
                headers.get("X-Vera-Replacement-Session-Token")!,
            ),
        ).toMatchObject({ session_id: "message-request-id" });
        expect(response.status).toBe(202);
        expect(
            response.cookies.get(getVeraSessionCookieName("session-1"))?.value,
        ).toBe(currentToken);
        await expect(response.json()).resolves.toMatchObject({
            session_id: "session-1",
            boundary: "retained",
        });
    });

    it("applies a bound lifecycle rollover returned with a publish error", async () => {
        const currentToken = createVeraSessionToken("session-1");
        useCurrentSessionCookie(currentToken);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        detail: "Публикация не удалась.",
                        session_id: "message-request-id",
                        previous_session_id: "session-1",
                        boundary: "expired",
                        session_ttl_seconds: 86_400,
                    },
                    { status: 503 },
                ),
            ),
        );

        const response = await POST(makeRequest());

        expect(response.status).toBe(503);
        expect(
            response.cookies.get(getVeraSessionCookieName("session-1"))?.value,
        ).toBe(currentToken);
        expect(
            response.cookies.get(
                getVeraSessionCookieName("message-request-id"),
            )?.value,
        ).toBeTruthy();
        expect(
            response.cookies
                .getAll()
                .some(({ name }) =>
                    name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
                ),
        ).toBe(false);
    });

    it("does not change the session cookie for an error without lifecycle fields", async () => {
        const currentToken = createVeraSessionToken("session-1");
        useCurrentSessionCookie(currentToken);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    { detail: "Сервис недоступен." },
                    { status: 503 },
                ),
            ),
        );

        const response = await POST(makeRequest());

        expect(response.status).toBe(503);
        expect(
            response.cookies.get(getVeraSessionCookieName("session-1")),
        ).toBeUndefined();
        expect(
            response.cookies
                .getAll()
                .some(({ name }) =>
                    name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
                ),
        ).toBe(true);
    });

    it("reuses the exact lifecycle token triplet after an ambiguous upstream response", async () => {
        const currentCookieName = getVeraSessionCookieName("session-1");
        const currentToken = createVeraSessionToken("session-1");
        useCurrentSessionCookie(currentToken);
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce(
                Response.json(
                    {
                        request_id: "message-request-id",
                        stream_ticket: "signed.ticket",
                        stream_url: "/vera/sse/message-request-id",
                        session_id: "session-1",
                        previous_session_id: null,
                        boundary: "retained",
                        session_ttl_seconds: 86_400,
                    },
                    { status: 202 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);

        const ambiguousResponse = await POST(makeRequest());
        const recoveryCookie = ambiguousResponse.cookies
            .getAll()
            .find(({ name }) =>
                name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
            );
        expect(recoveryCookie?.value).toBeTruthy();
        expect(ambiguousResponse.headers.get("set-cookie")).toContain(
            "HttpOnly",
        );
        const firstHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        useCookies({
            [currentCookieName]: currentToken,
            [recoveryCookie!.name]: recoveryCookie!.value,
            [`${VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX}other-operation`]: "other-tab",
        });

        const acceptedResponse = await POST(makeRequest());

        const retryHeaders = new Headers(
            (fetchMock.mock.calls[1]?.[1] as RequestInit).headers,
        );
        for (const headerName of [
            "X-Vera-Session-Token",
            "X-Vera-Refreshed-Session-Token",
            "X-Vera-Replacement-Session-Token",
        ]) {
            expect(retryHeaders.get(headerName)).toBe(
                firstHeaders.get(headerName),
            );
        }
        expect(acceptedResponse.headers.get("set-cookie")).toContain(
            `${recoveryCookie!.name}=;`,
        );
        expect(acceptedResponse.headers.get("set-cookie")).not.toContain(
            `${VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX}other-operation=;`,
        );
    });

    it("passes through a definite not-published marker and clears recovery", async () => {
        const currentToken = createVeraSessionToken("session-1");
        useCurrentSessionCookie(currentToken);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        detail: "Ticket не выпущен.",
                        publish_state: "not_published",
                        session_id: "session-1",
                        previous_session_id: null,
                        boundary: "retained",
                        session_ttl_seconds: 86_400,
                    },
                    { status: 503 },
                ),
            ),
        );

        const response = await POST(makeRequest());

        await expect(response.json()).resolves.toMatchObject({
            publish_state: "not_published",
        });
        expect(
            response.cookies
                .getAll()
                .some(({ name }) =>
                    name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
                ),
        ).toBe(false);
    });

    it("keeps lifecycle recovery for a 5xx not-published error without a bound lifecycle", async () => {
        const currentToken = createVeraSessionToken("session-1");
        useCurrentSessionCookie(currentToken);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        detail: "Agent не подтвердил lifecycle.",
                        publish_state: "not_published",
                    },
                    { status: 503 },
                ),
            ),
        );

        const response = await POST(makeRequest());

        await expect(response.json()).resolves.toMatchObject({
            publish_state: "not_published",
        });
        expect(
            response.cookies
                .getAll()
                .some(({ name }) =>
                    name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
                ),
        ).toBe(true);
    });

    it("marks a local owner-proof configuration failure as not published", async () => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "");
        useCookies({});
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest());

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
            detail: "Сервис сессий чата временно не настроен.",
            publish_state: "not_published",
        });
        expect(response.headers.get("X-Request-ID")).toBe(
            "proxy-request-id",
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("POST /api/vera/chat without an upstream URL", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it("marks the local 503 as definitely not published", async () => {
        vi.resetModules();
        vi.stubEnv("AUTH_API_URL", "");
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const { POST: postWithoutUpstream } = await import("./route");

        const response = await postWithoutUpstream(makeRequest());

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            detail: "Сервер не настроен.",
            publish_state: "not_published",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
