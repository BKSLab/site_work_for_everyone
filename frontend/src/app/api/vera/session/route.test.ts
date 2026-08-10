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
    getVeraSessionCookieName,
    readVeraSessionToken,
} from "@/lib/utils/vera-session-token";

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

function makeRequest(sessionId = "session-1"): NextRequest {
    return new NextRequest("http://localhost:3000/api/vera/session", {
        method: "POST",
        headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "Content-Type": "application/json",
            "X-Request-ID": "create-request-id",
        },
        body: JSON.stringify({ session_id: sessionId }),
    });
}

describe("POST /api/vera/session", () => {
    let POST: typeof import("./route").POST;

    beforeAll(async () => {
        vi.stubEnv("AUTH_API_URL", "http://backend:8000");
        ({ POST } = await import("./route"));
    });

    beforeEach(() => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
        useCookies({});
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    it("binds the new owner proof to the caller-selected session", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json({
                session_id: "session-1",
                session_ttl_seconds: 86_400,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest());

        expect(response.status).toBe(200);
        const upstream = fetchMock.mock.calls[0];
        expect(String(upstream[0])).toBe("http://backend:8000/api/vera/session");
        expect((upstream[1] as RequestInit).body).toBe(
            JSON.stringify({ session_id: "session-1" }),
        );
        const headers = new Headers((upstream[1] as RequestInit).headers);
        const token = headers.get("X-Vera-Session-Token")!;
        expect(readVeraSessionToken(token)).toMatchObject({
            session_id: "session-1",
        });
        expect(
            response.cookies.get(getVeraSessionCookieName("session-1"))
                ?.value,
        ).toBe(token);
    });

    it("keeps the exact generated proof after a controlled upstream 5xx for idempotent retry", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json(
                    { detail: "Ответ upstream потерян." },
                    { status: 503 },
                ),
            )
            .mockResolvedValueOnce(
                Response.json({
                    session_id: "session-1",
                    session_ttl_seconds: 86_400,
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const ambiguousResponse = await POST(makeRequest());
        const sessionCookieName = getVeraSessionCookieName("session-1");
        const exactToken = ambiguousResponse.cookies.get(sessionCookieName)?.value;
        expect(ambiguousResponse.status).toBe(503);
        expect(exactToken).toBeTruthy();
        const firstHeaders = new Headers(
            (fetchMock.mock.calls[0]?.[1] as RequestInit).headers,
        );
        expect(firstHeaders.get("X-Vera-Session-Token")).toBe(exactToken);

        useCookies({ [sessionCookieName]: exactToken! });
        const retryResponse = await POST(makeRequest());

        const retryHeaders = new Headers(
            (fetchMock.mock.calls[1]?.[1] as RequestInit).headers,
        );
        expect(retryHeaders.get("X-Vera-Session-Token")).toBe(exactToken);
        expect(retryResponse.status).toBe(200);
    });

    it("rejects a successful response bound to another session", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json({
                    session_id: "foreign-session",
                    session_ttl_seconds: 86_400,
                }),
            ),
        );

        const response = await POST(makeRequest());

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            detail: expect.any(String),
        });
    });
});
