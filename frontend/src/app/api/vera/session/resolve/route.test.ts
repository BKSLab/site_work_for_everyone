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

function makeRequest(
    sessionId = "session-1",
    replacementSessionId = "session-2",
): NextRequest {
    return new NextRequest("http://localhost:3000/api/vera/session/resolve", {
        method: "POST",
        headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Request-ID": "resolve-request-id",
        },
        body: JSON.stringify({
            session_id: sessionId,
            replacement_session_id: replacementSessionId,
        }),
    });
}

function backendResponse({
    sessionId,
    previousSessionId,
    boundary,
}: {
    sessionId: string;
    previousSessionId: string | null;
    boundary: "created" | "retained" | "expired";
}): Response {
    return Response.json({
        session_id: sessionId,
        previous_session_id: previousSessionId,
        boundary,
        session_ttl_seconds: 86_400,
    });
}

describe("POST /api/vera/session/resolve", () => {
    let POST: typeof import("./route").POST;
    let GET_CURRENT: typeof import("../current/route").GET;
    let GET_HISTORY: typeof import("../../history/[sessionId]/route").GET;

    beforeAll(async () => {
        vi.stubEnv("AUTH_API_URL", "http://backend:8000");
        ({ POST } = await import("./route"));
        ({ GET: GET_CURRENT } = await import("../current/route"));
        ({ GET: GET_HISTORY } = await import("../../history/[sessionId]/route"));
    });

    beforeEach(() => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
        useCookies({});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    it("sets the current proof cookie when the session is created", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            backendResponse({
                sessionId: "session-1",
                previousSessionId: null,
                boundary: "created",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest());

        const headers = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        const currentToken = headers.get("X-Vera-Session-Token")!;
        expect(readVeraSessionToken(currentToken)).toMatchObject({
            session_id: "session-1",
        });
        expect(
            readVeraSessionToken(
                headers.get("X-Vera-Refreshed-Session-Token")!,
            ),
        ).toMatchObject({ session_id: "session-1" });
        expect(
            readVeraSessionToken(
                headers.get("X-Vera-Replacement-Session-Token")!,
            ),
        ).toMatchObject({ session_id: "session-2" });
        expect(
            response.cookies.get(getVeraSessionCookieName("session-1"))?.value,
        ).toBe(currentToken);
    });

    it("replaces the same-session cookie with the refreshed proof when retained", async () => {
        const currentToken = createVeraSessionToken("session-1");
        useCookies({
            [getVeraSessionCookieName("session-1")]: currentToken,
        });
        const fetchMock = vi.fn().mockResolvedValue(
            backendResponse({
                sessionId: "session-1",
                previousSessionId: null,
                boundary: "retained",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest());

        const headers = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        const refreshedToken = headers.get("X-Vera-Refreshed-Session-Token");
        expect(headers.get("X-Vera-Session-Token")).toBe(currentToken);
        expect(refreshedToken).toBe(currentToken);
        expect(
            response.cookies.get(getVeraSessionCookieName("session-1"))?.value,
        ).toBe(refreshedToken);
        expect(response.headers.get("set-cookie")).not.toContain("Max-Age");
    });

    it("reuses an expired proof and refreshes both predecessor and replacement cookies", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));
        const oldCookieName = getVeraSessionCookieName("session-1");
        const expiredToken = createVeraSessionToken("session-1");
        vi.setSystemTime(new Date("2026-08-10T00:00:01Z"));
        useCookies({
            [oldCookieName]: expiredToken,
        });
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                backendResponse({
                    sessionId: "session-2",
                    previousSessionId: "session-1",
                    boundary: "expired",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest());

        const headers = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        expect(headers.get("X-Vera-Session-Token")).toBe(expiredToken);
        expect(
            response.cookies.get(getVeraSessionCookieName("session-2"))?.value,
        ).toBeTruthy();
        expect(response.cookies.get(oldCookieName)?.value).toBe(
            headers.get("X-Vera-Refreshed-Session-Token"),
        );
        expect(response.headers.get("set-cookie")).not.toContain(
            `${oldCookieName}=;`,
        );
        expect(response.headers.get("set-cookie")).not.toContain("Max-Age=0");
    });

    it("preserves an expired proof across current lookup before lifecycle recovery", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));
        const oldCookieName = getVeraSessionCookieName("session-1");
        const expiredToken = createVeraSessionToken("session-1");
        vi.setSystemTime(new Date("2026-08-10T00:00:01Z"));
        useCookies({ [oldCookieName]: expiredToken });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ session_id: null }))
            .mockResolvedValueOnce(
                backendResponse({
                    sessionId: "session-2",
                    previousSessionId: "session-1",
                    boundary: "expired",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const currentResponse = await GET_CURRENT(
            new NextRequest("http://localhost:3000/api/vera/session/current", {
                headers: {
                    host: "localhost:3000",
                    "X-Request-ID": "current-request-id",
                },
            }),
        );
        const response = await POST(makeRequest());

        expect(currentResponse.headers.get("set-cookie")).toBeNull();
        const resolveHeaders = new Headers(
            (fetchMock.mock.calls[1]?.[1] as RequestInit).headers,
        );
        expect(resolveHeaders.get("X-Vera-Session-Token")).toBe(expiredToken);
        expect(response.status).toBe(200);
        expect(response.cookies.get(oldCookieName)?.value).toBe(
            resolveHeaders.get("X-Vera-Refreshed-Session-Token"),
        );
        expect(
            response.cookies.get(getVeraSessionCookieName("session-2"))?.value,
        ).toBeTruthy();
    });

    it("preserves valid expired proofs and recovery bundles owned by another tab", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));
        const archiveCookieName = getVeraSessionCookieName("archive-session");
        const activeCookieName = getVeraSessionCookieName("active-session");
        const archiveToken = createVeraSessionToken("archive-session");
        const activeToken = createVeraSessionToken("active-session");
        vi.setSystemTime(new Date("2026-08-10T00:00:01Z"));
        useCookies({
            [archiveCookieName]: archiveToken,
            [activeCookieName]: activeToken,
        });
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json(
                    { detail: "Сессия чата не подтверждена." },
                    { status: 401 },
                ),
            )
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce(
                backendResponse({
                    sessionId: "replacement-session",
                    previousSessionId: "active-session",
                    boundary: "expired",
                }),
            )
            .mockResolvedValueOnce(
                backendResponse({
                    sessionId: "archive-replacement",
                    previousSessionId: "archive-session",
                    boundary: "expired",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const archiveResponse = await GET_HISTORY(
            new NextRequest(
                "http://localhost:3000/api/vera/history/archive-session",
                {
                    headers: {
                        host: "localhost:3000",
                        "X-Request-ID": "history-request-id",
                    },
                },
            ),
            { params: Promise.resolve({ sessionId: "archive-session" }) },
        );

        const historyHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        expect(historyHeaders.get("X-Vera-Session-Token")).toBe(
            archiveToken,
        );
        expect(archiveResponse.headers.get("set-cookie")).toBeNull();

        const archiveAmbiguousResponse = await POST(
            makeRequest("archive-session", "archive-replacement"),
        );
        const archiveRecoveryCookie = archiveAmbiguousResponse.cookies
            .getAll()
            .find(({ name }) =>
                name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
            );
        expect(archiveRecoveryCookie?.value).toBeTruthy();
        const archiveLifecycleHeaders = new Headers(
            (fetchMock.mock.calls[1]?.[1] as RequestInit).headers,
        );
        useCookies({
            [archiveCookieName]: archiveToken,
            [activeCookieName]: activeToken,
            [archiveRecoveryCookie!.name]: archiveRecoveryCookie!.value,
        });

        const activeResponse = await POST(
            makeRequest("active-session", "replacement-session"),
        );
        const resolveHeaders = new Headers(
            (fetchMock.mock.calls[2]?.[1] as RequestInit).headers,
        );
        expect(resolveHeaders.get("X-Vera-Session-Token")).toBe(activeToken);
        expect(activeResponse.headers.get("set-cookie")).not.toContain(
            `${archiveCookieName}=;`,
        );
        expect(activeResponse.headers.get("set-cookie")).not.toContain(
            `${archiveRecoveryCookie!.name}=;`,
        );

        // A later exact retry from the other tab can still use its original
        // predecessor proof and operation-scoped recovery token triplet.
        useCookies({
            [archiveCookieName]: archiveToken,
            [archiveRecoveryCookie!.name]: archiveRecoveryCookie!.value,
        });
        await POST(makeRequest("archive-session", "archive-replacement"));
        const archiveRetryHeaders = new Headers(
            (fetchMock.mock.calls[3]?.[1] as RequestInit).headers,
        );
        for (const headerName of [
            "X-Vera-Session-Token",
            "X-Vera-Refreshed-Session-Token",
            "X-Vera-Replacement-Session-Token",
        ]) {
            expect(archiveRetryHeaders.get(headerName)).toBe(
                archiveLifecycleHeaders.get(headerName),
            );
        }
    });

    it("replays the exact first-created token triplet after an ambiguous response", async () => {
        useCookies({});
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce(
                backendResponse({
                    sessionId: "session-1",
                    previousSessionId: null,
                    boundary: "created",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const ambiguousResponse = await POST(makeRequest());
        const recoveryCookie = ambiguousResponse.cookies
            .getAll()
            .find(({ name }) =>
                name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
            );
        expect(recoveryCookie?.value).toBeTruthy();
        const firstHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        useCookies({ [recoveryCookie!.name]: recoveryCookie!.value });

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
        expect(
            acceptedResponse.cookies.get(
                getVeraSessionCookieName("session-1"),
            )?.value,
        ).toBe(firstHeaders.get("X-Vera-Session-Token"));
        expect(acceptedResponse.headers.get("set-cookie")).toContain(
            `${recoveryCookie!.name}=;`,
        );
    });

    it("reuses the installed successor proof when an expired success is retried from stale client storage", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));
        const predecessorCookieName = getVeraSessionCookieName("session-1");
        const successorCookieName = getVeraSessionCookieName("session-2");
        const expiredPredecessorToken = createVeraSessionToken("session-1");
        vi.setSystemTime(new Date("2026-08-10T00:00:01Z"));
        useCookies({ [predecessorCookieName]: expiredPredecessorToken });
        const fetchMock = vi.fn().mockResolvedValue(
            backendResponse({
                sessionId: "session-2",
                previousSessionId: "session-1",
                boundary: "expired",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const firstResponse = await POST(makeRequest());
        const firstHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        const installedPredecessorToken = firstResponse.cookies.get(
            predecessorCookieName,
        )?.value;
        const installedSuccessorToken = firstResponse.cookies.get(
            successorCookieName,
        )?.value;
        expect(installedPredecessorToken).toBe(
            firstHeaders.get("X-Vera-Refreshed-Session-Token"),
        );
        expect(installedSuccessorToken).toBe(
            firstHeaders.get("X-Vera-Replacement-Session-Token"),
        );

        // The browser applied Set-Cookie, but JS crashed before advancing the
        // local session/journal and therefore retries the same operation.
        useCookies({
            [predecessorCookieName]: installedPredecessorToken!,
            [successorCookieName]: installedSuccessorToken!,
        });
        await POST(makeRequest());

        const retryHeaders = new Headers(
            (fetchMock.mock.calls[1]?.[1] as RequestInit).headers,
        );
        expect(retryHeaders.get("X-Vera-Session-Token")).toBe(
            installedPredecessorToken,
        );
        expect(retryHeaders.get("X-Vera-Refreshed-Session-Token")).toBe(
            installedPredecessorToken,
        );
        expect(retryHeaders.get("X-Vera-Replacement-Session-Token")).toBe(
            installedSuccessorToken,
        );
    });

    it("rejects a recovery bundle outside the five-minute transport window", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));
        useCookies({});
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce(
                backendResponse({
                    sessionId: "session-1",
                    previousSessionId: null,
                    boundary: "created",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const ambiguousResponse = await POST(makeRequest());
        const recoveryCookie = ambiguousResponse.cookies
            .getAll()
            .find(({ name }) =>
                name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
            );
        const firstHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        expect(ambiguousResponse.headers.get("set-cookie")).toContain(
            "Max-Age=300",
        );
        useCookies({ [recoveryCookie!.name]: recoveryCookie!.value });
        vi.setSystemTime(new Date("2026-08-10T00:05:01Z"));

        const response = await POST(makeRequest());

        const retryHeaders = new Headers(
            (fetchMock.mock.calls[1]?.[1] as RequestInit).headers,
        );
        for (const headerName of [
            "X-Vera-Session-Token",
            "X-Vera-Refreshed-Session-Token",
            "X-Vera-Replacement-Session-Token",
        ]) {
            expect(retryHeaders.get(headerName)).not.toBe(
                firstHeaders.get(headerName),
            );
        }
        expect(response.headers.get("set-cookie")).toContain(
            `${recoveryCookie!.name}=;`,
        );
        expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    });

    it("does not extend the original recovery window on an ambiguous retry", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));
        useCookies({});
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        const fetchMock = vi.fn().mockRejectedValue(abortError);
        vi.stubGlobal("fetch", fetchMock);

        const firstResponse = await POST(makeRequest());
        const recoveryCookie = firstResponse.cookies
            .getAll()
            .find(({ name }) =>
                name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
            );
        expect(firstResponse.headers.get("set-cookie")).toContain(
            "Max-Age=300",
        );
        const firstHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        useCookies({ [recoveryCookie!.name]: recoveryCookie!.value });
        vi.setSystemTime(new Date("2026-08-10T00:04:00Z"));

        const retryResponse = await POST(makeRequest());

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
        expect(retryResponse.headers.get("set-cookie")).toContain(
            "Max-Age=60",
        );
        expect(retryResponse.headers.get("set-cookie")).not.toContain(
            "Max-Age=300",
        );
    });

    it("does not store recovery metadata for an installed successor older than the recovery window", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));
        const currentToken = createVeraSessionToken("session-1");
        const successorToken = createVeraSessionToken("session-2");
        vi.setSystemTime(new Date("2026-08-10T00:05:01Z"));
        useCookies({
            [getVeraSessionCookieName("session-1")]: currentToken,
            [getVeraSessionCookieName("session-2")]: successorToken,
        });
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

        const response = await POST(makeRequest());

        expect(
            response.cookies
                .getAll()
                .some(({ name }) =>
                    name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
                ),
        ).toBe(false);
    });

    it("clears a stored recovery operation after a definite rejection", async () => {
        useCookies({});
        const abortError = new Error("timeout");
        abortError.name = "AbortError";
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce(
                Response.json(
                    { detail: "Операция конфликтует с завершённой." },
                    { status: 409 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);

        const ambiguousResponse = await POST(makeRequest());
        const recoveryCookie = ambiguousResponse.cookies
            .getAll()
            .find(({ name }) =>
                name.startsWith(VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX),
            );
        useCookies({ [recoveryCookie!.name]: recoveryCookie!.value });

        const rejectedResponse = await POST(makeRequest());

        expect(rejectedResponse.status).toBe(409);
        expect(rejectedResponse.headers.get("set-cookie")).toContain(
            `${recoveryCookie!.name}=;`,
        );
    });

    it("rejects a mismatched lifecycle response without accepting the replacement cookie", async () => {
        useCookies({
            [getVeraSessionCookieName("session-1")]:
                createVeraSessionToken("session-1"),
        });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                backendResponse({
                    sessionId: "forged-session",
                    previousSessionId: "session-1",
                    boundary: "expired",
                }),
            ),
        );

        const response = await POST(makeRequest());

        expect(response.status).toBe(502);
        expect(
            response.cookies.get(getVeraSessionCookieName("session-2")),
        ).toBeUndefined();
    });
});
