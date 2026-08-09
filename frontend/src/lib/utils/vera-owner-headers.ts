import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
    clearAuthCookies,
    resolveAuthSession,
    setAuthCookies,
    type AuthTokens,
} from "@/lib/utils/auth-session";
import { logger } from "@/lib/utils/logger";
import {
    assertVeraSessionSigningKey,
    createVeraSessionToken,
    getVeraSessionCookieName,
    readVeraSessionToken,
    VeraSessionConfigurationError,
    VERA_SESSION_COOKIE_PREFIX,
    VERA_SESSION_COOKIE_OPTIONS,
} from "@/lib/utils/vera-session-token";

const INVALID_SESSION_DETAIL = "Сессия чата не подтверждена.";

interface VeraSessionCookie {
    name: string;
    value: string;
}

export interface VeraOwnerHeadersSuccess {
    ok: true;
    headers: Record<string, string>;
    sessionCookie: VeraSessionCookie | null;
    sessionCookiesToDelete: string[];
    refreshedTokens: AuthTokens | null;
}

interface VeraOwnerHeadersFailure {
    ok: false;
    response: NextResponse;
}

type VeraOwnerHeadersResult =
    | VeraOwnerHeadersSuccess
    | VeraOwnerHeadersFailure;

function createConfigurationErrorResponse(requestId: string): NextResponse {
    const response = NextResponse.json(
        { detail: "Сервис сессий чата временно не настроен." },
        { status: 503 },
    );
    response.headers.set("X-Request-ID", requestId);
    return response;
}

function createAuthExpiredResponse(requestId: string): NextResponse {
    const response = NextResponse.json(
        { detail: "Сессия авторизации истекла. Войдите снова." },
        { status: 401 },
    );
    response.headers.set("X-Request-ID", requestId);
    clearAuthCookies(response);
    return response;
}

export async function getVeraOwnerHeaders(
    requestId: string,
    sessionId?: string,
): Promise<VeraOwnerHeadersResult> {
    try {
        assertVeraSessionSigningKey();
    } catch (error) {
        if (!(error instanceof VeraSessionConfigurationError)) throw error;
        logger.error("Vera session signing key is not configured", {
            requestId,
        });
        return {
            ok: false,
            response: createConfigurationErrorResponse(requestId),
        };
    }

    const cookieStore = await cookies();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sessionCookiesToDelete = cookieStore
        .getAll()
        .filter(({ name }) => name.startsWith(VERA_SESSION_COOKIE_PREFIX))
        .filter(({ name, value }) => {
            const payload = readVeraSessionToken(value);
            return (
                payload === null ||
                payload.exp <= nowSeconds ||
                name !== getVeraSessionCookieName(payload.session_id)
            );
        })
        .map(({ name }) => name);
    const headers: Record<string, string> = {};
    const accessToken = cookieStore.get("access_token")?.value;
    const refreshToken = cookieStore.get("refresh_token")?.value;
    const authSession = await resolveAuthSession({
        accessToken,
        refreshToken,
        authApiUrl: process.env.AUTH_API_URL,
    });
    if (authSession.status === "expired") {
        logger.warn("Vera request has an expired auth session", { requestId });
        return {
            ok: false,
            response: createAuthExpiredResponse(requestId),
        };
    }
    if (authSession.status === "authenticated") {
        headers["Authorization"] = `Bearer ${authSession.accessToken}`;
    }

    if (!sessionId) {
        return {
            ok: true,
            headers,
            sessionCookie: null,
            sessionCookiesToDelete,
            refreshedTokens:
                authSession.status === "authenticated"
                    ? authSession.refreshedTokens
                    : null,
        };
    }

    const sessionCookieName = getVeraSessionCookieName(sessionId);
    const existingSessionToken = cookieStore.get(sessionCookieName)?.value;
    const existingSessionPayload = existingSessionToken
        ? readVeraSessionToken(existingSessionToken)
        : null;
    const canReuseExistingSessionToken =
        existingSessionPayload?.session_id === sessionId &&
        existingSessionPayload.exp > nowSeconds;
    const sessionToken =
        canReuseExistingSessionToken && existingSessionToken
            ? existingSessionToken
            : createVeraSessionToken(sessionId);
    headers["X-Vera-Session-Token"] = sessionToken;

    return {
        ok: true,
        headers,
        sessionCookiesToDelete: sessionCookiesToDelete.filter(
            (name) => name !== sessionCookieName,
        ),
        refreshedTokens:
            authSession.status === "authenticated"
                ? authSession.refreshedTokens
                : null,
        sessionCookie: canReuseExistingSessionToken
            ? null
            : { name: sessionCookieName, value: sessionToken },
    };
}

export function getVeraOwnerUpstreamError(
    status: number,
    data: unknown,
    requestId: string,
): NextResponse | null {
    if (
        status !== 401 ||
        typeof data !== "object" ||
        data === null ||
        !("detail" in data) ||
        data.detail !== INVALID_SESSION_DETAIL
    ) {
        return null;
    }

    logger.error("Vera session token was rejected by backend", { requestId });
    return createConfigurationErrorResponse(requestId);
}

export function applyVeraOwnerCookies(
    response: NextResponse,
    owner: VeraOwnerHeadersSuccess,
): NextResponse {
    for (const cookieName of owner.sessionCookiesToDelete) {
        response.cookies.set(cookieName, "", {
            ...VERA_SESSION_COOKIE_OPTIONS,
            maxAge: 0,
        });
    }
    if (owner.refreshedTokens) {
        setAuthCookies(response, owner.refreshedTokens);
    }
    if (owner.sessionCookie) {
        response.cookies.set(
            owner.sessionCookie.name,
            owner.sessionCookie.value,
            VERA_SESSION_COOKIE_OPTIONS,
        );
    }
    return response;
}
