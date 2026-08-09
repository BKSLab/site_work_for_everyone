import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import {
    createVeraSessionToken,
    getVeraSessionCookieName,
    VERA_SESSION_COOKIE_OPTIONS,
} from "@/lib/utils/vera-session-token";

interface VeraSessionCookie {
    name: string;
    value: string;
}

interface VeraOwnerHeadersResult {
    headers: Record<string, string>;
    sessionCookie: VeraSessionCookie | null;
}

export async function getVeraOwnerHeaders(
    sessionId?: string,
): Promise<VeraOwnerHeadersResult> {
    const cookieStore = await cookies();
    const headers: Record<string, string> = {};
    const accessToken = cookieStore.get("access_token")?.value;
    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    if (!sessionId) {
        return { headers, sessionCookie: null };
    }

    const sessionCookieName = getVeraSessionCookieName(sessionId);
    const existingSessionToken = cookieStore.get(sessionCookieName)?.value;
    const sessionToken =
        existingSessionToken ?? createVeraSessionToken(sessionId);
    headers["X-Vera-Session-Token"] = sessionToken;

    return {
        headers,
        sessionCookie: existingSessionToken
            ? null
            : { name: sessionCookieName, value: sessionToken },
    };
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
