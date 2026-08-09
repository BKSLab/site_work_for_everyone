import { NextRequest } from "next/server";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

const ownerMocks = vi.hoisted(() => ({
    applyVeraOwnerCookies: vi.fn((response: Response) => response),
    getVeraOwnerHeaders: vi.fn(),
    getVeraOwnerUpstreamError: vi.fn(() => null),
}));

vi.mock("@/lib/utils/vera-owner-headers", () => ownerMocks);
vi.mock("@/lib/utils/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe("GET /api/vera/history/[sessionId]", () => {
    let GET: typeof import("./route").GET;

    beforeAll(async () => {
        vi.stubEnv("AUTH_API_URL", "http://backend:8000");
        ({ GET } = await import("./route"));
    });

    beforeEach(() => {
        vi.clearAllMocks();
        ownerMocks.getVeraOwnerHeaders.mockResolvedValue({
            ok: true,
            headers: { Authorization: "Bearer access-token" },
            sessionCookie: null,
            sessionCookiesToDelete: [],
            refreshedTokens: null,
        });
        ownerMocks.applyVeraOwnerCookies.mockImplementation(
            (response) => response,
        );
        ownerMocks.getVeraOwnerUpstreamError.mockReturnValue(null);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it.each([
        [403, "Нет доступа к этой сессии."],
        [404, "Сессия missing-session не найдена."],
    ])("preserves a controlled backend %i response", async (status, detail) => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail }), {
                status,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const request = new NextRequest(
            "http://localhost:3000/api/vera/history/missing-session",
            {
                headers: {
                    "x-forwarded-for": "198.51.100.8",
                    "x-request-id": `history-${status}-request`,
                },
            },
        );

        const response = await GET(request, {
            params: Promise.resolve({ sessionId: "missing-session" }),
        });

        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual({ detail });
        expect(response.headers.get("X-Request-ID")).toBe(
            `history-${status}-request`,
        );
        const [upstreamUrl] = fetchMock.mock.calls[0];
        expect(String(upstreamUrl)).toBe(
            "http://backend:8000/api/vera/history/missing-session?limit=30",
        );
    });
});
