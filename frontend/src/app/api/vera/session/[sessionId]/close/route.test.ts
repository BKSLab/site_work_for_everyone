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
    return new NextRequest(
        `http://localhost:3000/api/vera/session/${sessionId}/close`,
        {
            method: "POST",
            headers: {
                host: "localhost:3000",
                origin: "http://localhost:3000",
                "X-Request-ID": "close-request-id",
            },
        },
    );
}

describe("POST /api/vera/session/[sessionId]/close", () => {
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

    it("closes the bound session with its existing owner proof", async () => {
        const token = createVeraSessionToken("session-1");
        useCookies({ [getVeraSessionCookieName("session-1")]: token });
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json({
                session_id: "session-1",
                closed_at: "2026-08-10T12:00:00Z",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await POST(makeRequest(), {
            params: Promise.resolve({ sessionId: "session-1" }),
        });

        expect(response.status).toBe(200);
        const upstream = fetchMock.mock.calls[0];
        expect(String(upstream[0])).toBe(
            "http://backend:8000/api/vera/session/session-1/close",
        );
        const headers = new Headers((upstream[1] as RequestInit).headers);
        expect(headers.get("X-Vera-Session-Token")).toBe(token);
        expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("passes through a foreign-owner rejection without replacing the proof", async () => {
        const token = createVeraSessionToken("session-1");
        useCookies({ [getVeraSessionCookieName("session-1")]: token });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    { detail: "Чужая сессия." },
                    { status: 403 },
                ),
            ),
        );

        const response = await POST(makeRequest(), {
            params: Promise.resolve({ sessionId: "session-1" }),
        });

        expect(response.status).toBe(403);
        expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("rejects a close response bound to another session", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json({
                    session_id: "foreign-session",
                    closed_at: "2026-08-10T12:00:00Z",
                }),
            ),
        );

        const response = await POST(makeRequest(), {
            params: Promise.resolve({ sessionId: "session-1" }),
        });

        expect(response.status).toBe(502);
    });
});
