import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { logger } from "@/lib/utils/logger";
import {
    assertVeraSessionSigningKey,
    createVeraSessionToken,
    getVeraSessionCookieName,
    VeraSessionConfigurationError,
    VERA_SESSION_COOKIE_OPTIONS,
} from "@/lib/utils/vera-session-token";

const INVALID_SESSION_DETAIL = "Сессия чата не подтверждена.";

interface VeraSessionCookie {
    name: string;
    value: string;
}

interface VeraOwnerHeadersSuccess {
    ok: true;
    headers: Record<string, string>;
    sessionCookie: VeraSessionCookie | null;
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
    const headers: Record<string, string> = {};
    const accessToken = cookieStore.get("access_token")?.value;
    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    if (!sessionId) {
        return { ok: true, headers, sessionCookie: null };
    }

    const sessionCookieName = getVeraSessionCookieName(sessionId);
    const existingSessionToken = cookieStore.get(sessionCookieName)?.value;
    const sessionToken =
        existingSessionToken ?? createVeraSessionToken(sessionId);
    headers["X-Vera-Session-Token"] = sessionToken;

    return {
        ok: true,
        headers,
        sessionCookie: existingSessionToken
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

export function applyVeraSessionCookie(
    response: NextResponse,
    sessionCookie: VeraSessionCookie | null,
): void {
    if (!sessionCookie) return;
    response.cookies.set(
        sessionCookie.name,
        sessionCookie.value,
        VERA_SESSION_COOKIE_OPTIONS,
    );
}
