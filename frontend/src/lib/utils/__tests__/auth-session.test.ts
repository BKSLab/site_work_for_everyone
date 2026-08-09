import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAuthSession } from "../auth-session";

function createAccessToken(exp: number): string {
    const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
        sub: "user@example.com",
        first_name: "Иван",
        last_name: "Иванов",
        exp,
    })}.signature`;
}

function createRefreshResponse(accessToken: string): Response {
    return new Response(
        JSON.stringify({
            access_token: accessToken,
            refresh_token: "rotated-refresh-token",
        }),
        {
            status: 200,
            headers: { "Content-Type": "application/json" },
        },
    );
}

describe("resolveAuthSession", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uses an active access token without refresh", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const accessToken = createAccessToken(
            Math.floor(Date.now() / 1000) + 3600,
        );

        const result = await resolveAuthSession({
            accessToken,
            refreshToken: "refresh-token",
            authApiUrl: "http://backend:8000",
        });

        expect(result).toMatchObject({
            status: "authenticated",
            accessToken,
            refreshedTokens: null,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps a request without auth cookies anonymous", async () => {
        const result = await resolveAuthSession({
            authApiUrl: "http://backend:8000",
        });

        expect(result).toEqual({ status: "anonymous" });
    });

    it("deduplicates parallel refreshes for the same refresh token", async () => {
        const refreshedAccessToken = createAccessToken(
            Math.floor(Date.now() / 1000) + 3600,
        );
        const fetchMock = vi
            .fn()
            .mockResolvedValue(createRefreshResponse(refreshedAccessToken));
        vi.stubGlobal("fetch", fetchMock);
        const expiredAccessToken = createAccessToken(
            Math.floor(Date.now() / 1000) - 1,
        );

        const results = await Promise.all([
            resolveAuthSession({
                accessToken: expiredAccessToken,
                refreshToken: "shared-refresh-token",
                authApiUrl: "http://backend:8000",
            }),
            resolveAuthSession({
                accessToken: expiredAccessToken,
                refreshToken: "shared-refresh-token",
                authApiUrl: "http://backend:8000",
            }),
        ]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(results).toEqual([
            expect.objectContaining({
                status: "authenticated",
                accessToken: refreshedAccessToken,
            }),
            expect.objectContaining({
                status: "authenticated",
                accessToken: refreshedAccessToken,
            }),
        ]);
    });

    it("marks the auth session expired when refresh is rejected", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
        );

        const result = await resolveAuthSession({
            accessToken: createAccessToken(
                Math.floor(Date.now() / 1000) - 1,
            ),
            refreshToken: "rejected-refresh-token",
            authApiUrl: "http://backend:8000",
        });

        expect(result).toEqual({ status: "expired" });
    });
});
