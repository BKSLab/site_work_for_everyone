import type { NextResponse } from "next/server";

export const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/",
};

const ACCESS_TOKEN_MAX_AGE = 60 * 60;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

export interface AuthUser {
    email: string;
    first_name: string;
    last_name: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export type AuthSessionResolution =
    | {
          status: "authenticated";
          accessToken: string;
          user: AuthUser;
          refreshedTokens: AuthTokens | null;
      }
    | { status: "anonymous" }
    | { status: "expired" };

interface RefreshSuccess {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
}

const refreshPromises = new Map<string, Promise<RefreshSuccess | null>>();

function decodeJwtPayload(token: string): Record<string, unknown> {
    const base64Payload = token.split(".")[1];
    const jsonPayload = Buffer.from(base64Payload, "base64").toString("utf-8");
    return JSON.parse(jsonPayload);
}

export function getAuthUserFromAccessToken(token: string): AuthUser | null {
    try {
        const payload = decodeJwtPayload(token);
        const email = payload.sub;
        const firstName = payload.first_name;
        const lastName = payload.last_name;
        if (
            typeof email !== "string" ||
            typeof firstName !== "string" ||
            typeof lastName !== "string" ||
            !email ||
            !firstName ||
            !lastName
        ) {
            return null;
        }
        return {
            email,
            first_name: firstName,
            last_name: lastName,
        };
    } catch {
        return null;
    }
}

function isAccessTokenActive(token: string): boolean {
    try {
        const payload = decodeJwtPayload(token);
        return (
            typeof payload.exp === "number" &&
            payload.exp * 1000 >= Date.now() &&
            getAuthUserFromAccessToken(token) !== null
        );
    } catch {
        return false;
    }
}

async function performRefresh(
    refreshToken: string,
    authApiUrl: string,
): Promise<RefreshSuccess | null> {
    try {
        const response = await fetch(
            new URL("/api/auth/refresh", authApiUrl).toString(),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: refreshToken }),
            },
        );
        if (!response.ok) return null;

        const data: unknown = await response.json();
        if (
            typeof data !== "object" ||
            data === null ||
            !("access_token" in data) ||
            !("refresh_token" in data) ||
            typeof data.access_token !== "string" ||
            typeof data.refresh_token !== "string"
        ) {
            return null;
        }

        const user = getAuthUserFromAccessToken(data.access_token);
        if (!user) return null;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            user,
        };
    } catch {
        return null;
    }
}

function refreshAccessToken(
    refreshToken: string,
    authApiUrl: string,
): Promise<RefreshSuccess | null> {
    const activeRefresh = refreshPromises.get(refreshToken);
    if (activeRefresh) return activeRefresh;

    const refresh = performRefresh(refreshToken, authApiUrl);
    refreshPromises.set(refreshToken, refresh);
    void refresh.finally(() => {
        if (refreshPromises.get(refreshToken) === refresh) {
            refreshPromises.delete(refreshToken);
        }
    });
    return refresh;
}

export async function resolveAuthSession({
    accessToken,
    refreshToken,
    authApiUrl,
}: {
    accessToken?: string;
    refreshToken?: string;
    authApiUrl?: string;
}): Promise<AuthSessionResolution> {
    if (accessToken && isAccessTokenActive(accessToken)) {
        return {
            status: "authenticated",
            accessToken,
            user: getAuthUserFromAccessToken(accessToken) as AuthUser,
            refreshedTokens: null,
        };
    }

    if (refreshToken && authApiUrl) {
        const refreshed = await refreshAccessToken(refreshToken, authApiUrl);
        if (refreshed) {
            return {
                status: "authenticated",
                accessToken: refreshed.accessToken,
                user: refreshed.user,
                refreshedTokens: {
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken,
                },
            };
        }
    }

    if (accessToken || refreshToken) return { status: "expired" };
    return { status: "anonymous" };
}

export function setAuthCookies(
    response: NextResponse,
    tokens: AuthTokens,
): void {
    response.cookies.set("access_token", tokens.accessToken, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    response.cookies.set("refresh_token", tokens.refreshToken, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_MAX_AGE,
    });
}

export function clearAuthCookies(response: NextResponse): void {
    response.cookies.set("access_token", "", {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: 0,
    });
    response.cookies.set("refresh_token", "", {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: 0,
    });
}
