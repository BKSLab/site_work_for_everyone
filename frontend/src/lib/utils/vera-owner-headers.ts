import { createHash } from "node:crypto";
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
    VERA_OWNER_PROOF_CREDENTIAL_TTL_SECONDS,
    VERA_SESSION_COOKIE_PREFIX,
    VERA_SESSION_COOKIE_OPTIONS,
} from "@/lib/utils/vera-session-token";

const INVALID_SESSION_DETAIL = "Сессия чата не подтверждена.";

interface VeraSessionCookie {
    name: string;
    value: string;
}

interface VeraLifecycleSessionTokens {
    current: VeraSessionCookie;
    refreshed: VeraSessionCookie;
    replacement: VeraSessionCookie;
}

interface VeraLifecycleRecoveryBundle {
    tokens: VeraLifecycleSessionTokens;
    createdAt: number;
    expiresAt: number;
}

export const VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX =
    "vera_lifecycle_recovery_";
// Bounded replay window for an ambiguous BFF-to-backend transport outcome.
// This is operation recovery metadata, not a chat-session lifetime.
const VERA_LIFECYCLE_TRANSPORT_RECOVERY_SECONDS = 5 * 60;
const VERA_LIFECYCLE_RECOVERY_COOKIE_OPTIONS = {
    ...VERA_SESSION_COOKIE_OPTIONS,
    maxAge: VERA_LIFECYCLE_TRANSPORT_RECOVERY_SECONDS,
};

export type VeraLifecycleRecoveryMode = "store" | "clear";

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

export interface VeraLifecycleOwnerHeadersSuccess
    extends VeraOwnerHeadersSuccess {
    sessionCookie: null;
    lifecycleSessionTokens: VeraLifecycleSessionTokens;
    lifecycleRecoveryCookie: VeraSessionCookie;
    lifecycleRecoveryExpiresAt: number;
    hadLifecycleRecoveryCookie: boolean;
}

type VeraLifecycleOwnerHeadersResult =
    | VeraLifecycleOwnerHeadersSuccess
    | VeraOwnerHeadersFailure;

interface VeraLifecycleResponse {
    session_id: string;
    previous_session_id: string | null;
    boundary: "created" | "retained" | "expired";
}

function getVeraLifecycleRecoveryCookieName(
    sessionId: string,
    replacementSessionId: string,
): string {
    const operationHash = createHash("sha256")
        .update(`${sessionId}\0${replacementSessionId}`, "utf8")
        .digest("hex");
    return `${VERA_LIFECYCLE_RECOVERY_COOKIE_PREFIX}${operationHash}`;
}

function encodeVeraLifecycleRecoveryCookie(
    bundle: VeraLifecycleRecoveryBundle,
): string {
    return Buffer.from(
        JSON.stringify({
            current: bundle.tokens.current.value,
            refreshed: bundle.tokens.refreshed.value,
            replacement: bundle.tokens.replacement.value,
            createdAt: bundle.createdAt,
            expiresAt: bundle.expiresAt,
        }),
        "utf8",
    ).toString("base64url");
}

function readVeraLifecycleRecoveryCookie(
    value: string,
    sessionId: string,
    replacementSessionId: string,
): VeraLifecycleRecoveryBundle | null {
    try {
        const parsed = JSON.parse(
            Buffer.from(value, "base64url").toString("utf8"),
        ) as {
            current?: unknown;
            refreshed?: unknown;
            replacement?: unknown;
            createdAt?: unknown;
            expiresAt?: unknown;
        };
        if (
            typeof parsed.current !== "string" ||
            typeof parsed.refreshed !== "string" ||
            typeof parsed.replacement !== "string" ||
            typeof parsed.createdAt !== "number" ||
            !Number.isInteger(parsed.createdAt) ||
            typeof parsed.expiresAt !== "number" ||
            !Number.isInteger(parsed.expiresAt)
        ) {
            return null;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        if (
            parsed.createdAt > nowSeconds ||
            parsed.expiresAt <= nowSeconds ||
            parsed.expiresAt - parsed.createdAt !==
                VERA_LIFECYCLE_TRANSPORT_RECOVERY_SECONDS
        ) {
            return null;
        }

        const currentPayload = readVeraSessionToken(parsed.current);
        const refreshedPayload = readVeraSessionToken(parsed.refreshed);
        const replacementPayload = readVeraSessionToken(parsed.replacement);
        if (
            currentPayload?.session_id !== sessionId ||
            refreshedPayload?.session_id !== sessionId ||
            !replacementPayload ||
            replacementPayload.session_id !== replacementSessionId ||
            replacementPayload.exp -
                VERA_OWNER_PROOF_CREDENTIAL_TTL_SECONDS !==
                parsed.createdAt
        ) {
            return null;
        }

        return {
            tokens: {
                current: {
                    name: getVeraSessionCookieName(sessionId),
                    value: parsed.current,
                },
                refreshed: {
                    name: getVeraSessionCookieName(sessionId),
                    value: parsed.refreshed,
                },
                replacement: {
                    name: getVeraSessionCookieName(replacementSessionId),
                    value: parsed.replacement,
                },
            },
            createdAt: parsed.createdAt,
            expiresAt: parsed.expiresAt,
        };
    } catch {
        return null;
    }
}

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
    const sessionCookiesToDelete = cookieStore
        .getAll()
        .filter(({ name }) => name.startsWith(VERA_SESSION_COOKIE_PREFIX))
        .filter(({ name, value }) => {
            const payload = readVeraSessionToken(value);
            return (
                payload === null ||
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
    // Ordinary endpoints pass an expired proof through unchanged. Their
    // backend verification remains strict and rejects it, while the browser
    // keeps the only credential that lifecycle recovery can refresh.
    const canReuseExistingSessionToken =
        existingSessionPayload?.session_id === sessionId;
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

export async function getVeraLifecycleOwnerHeaders(
    requestId: string,
    sessionId: string,
    replacementSessionId: string,
): Promise<VeraLifecycleOwnerHeadersResult> {
    const owner = await getVeraOwnerHeaders(requestId, sessionId);
    if (!owner.ok) return owner;

    const sessionCookieName = getVeraSessionCookieName(sessionId);
    const cookieStore = await cookies();
    const recoveryCookieName = getVeraLifecycleRecoveryCookieName(
        sessionId,
        replacementSessionId,
    );
    const storedRecoveryCookie = cookieStore.get(recoveryCookieName)?.value;
    const recoveredBundle = storedRecoveryCookie
        ? readVeraLifecycleRecoveryCookie(
              storedRecoveryCookie,
              sessionId,
              replacementSessionId,
          )
        : null;
    const storedCurrentToken = cookieStore.get(sessionCookieName)?.value;
    const storedCurrentPayload = storedCurrentToken
        ? readVeraSessionToken(storedCurrentToken)
        : null;
    // Lifecycle resolve is the only path allowed to prove an inactive
    // session with an expired, but still correctly signed, current token.
    // A fresh same-session proof is minted only when that credential expired;
    // otherwise retained activity keeps the existing owner hash stable.
    const currentToken =
        storedCurrentPayload?.session_id === sessionId && storedCurrentToken
            ? storedCurrentToken
            : owner.headers["X-Vera-Session-Token"];
    const currentPayload = readVeraSessionToken(currentToken);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const replacementCookieName = getVeraSessionCookieName(
        replacementSessionId,
    );
    const storedReplacementToken = cookieStore.get(
        replacementCookieName,
    )?.value;
    const storedReplacementPayload = storedReplacementToken
        ? readVeraSessionToken(storedReplacementToken)
        : null;
    let recoveryBundle = recoveredBundle;
    if (!recoveryBundle) {
        // A successful expired rollover can reach the browser (and install
        // both owner proofs) just before JS persists the effective session.
        // Reuse that exact successor proof when the stale operation journal
        // retries, because Agent recovery is bound to its token hash.
        const replacementToken =
            storedReplacementPayload?.session_id === replacementSessionId &&
            storedReplacementPayload.exp > nowSeconds &&
            storedReplacementToken
                ? storedReplacementToken
                : createVeraSessionToken(replacementSessionId);
        const replacementPayload = readVeraSessionToken(replacementToken);
        if (!replacementPayload) {
            throw new Error("Failed to create Vera replacement proof");
        }
        const createdAt =
            replacementPayload.exp -
            VERA_OWNER_PROOF_CREDENTIAL_TTL_SECONDS;
        recoveryBundle = {
            createdAt,
            expiresAt:
                createdAt + VERA_LIFECYCLE_TRANSPORT_RECOVERY_SECONDS,
            tokens: {
                current: {
                    name: sessionCookieName,
                    value: currentToken,
                },
                refreshed: {
                    name: sessionCookieName,
                    // Retained activity keeps the same still-valid anonymous
                    // owner hash. Rotation is only needed to recover an
                    // expired predecessor proof.
                    value:
                        currentPayload && currentPayload.exp > nowSeconds
                            ? currentToken
                            : createVeraSessionToken(sessionId),
                },
                replacement: {
                    name: replacementCookieName,
                    value: replacementToken,
                },
            },
        };
    }
    const lifecycleSessionTokens = recoveryBundle.tokens;
    const recoveryCookieValue = encodeVeraLifecycleRecoveryCookie(
        recoveryBundle,
    );
    return {
        ...owner,
        headers: {
            ...owner.headers,
            "X-Vera-Session-Token": lifecycleSessionTokens.current.value,
            "X-Vera-Refreshed-Session-Token":
                lifecycleSessionTokens.refreshed.value,
            "X-Vera-Replacement-Session-Token":
                lifecycleSessionTokens.replacement.value,
        },
        // Lifecycle routes choose the cookie only after the server returns the
        // effective session. This prevents an unaccepted replacement token
        // from becoming browser state after a failed request.
        sessionCookie: null,
        sessionCookiesToDelete: [
            ...owner.sessionCookiesToDelete.filter(
                (name) => name !== sessionCookieName,
            ),
        ],
        lifecycleSessionTokens,
        lifecycleRecoveryCookie: {
            name: recoveryCookieName,
            value: recoveryCookieValue,
        },
        lifecycleRecoveryExpiresAt: recoveryBundle.expiresAt,
        hadLifecycleRecoveryCookie: storedRecoveryCookie !== undefined,
    };
}

export function isVeraLifecycleResponseBoundToOwner(
    data: VeraLifecycleResponse,
    owner: VeraLifecycleOwnerHeadersSuccess,
): boolean {
    const currentSessionId = readVeraSessionToken(
        owner.lifecycleSessionTokens.current.value,
    )?.session_id;
    const replacementSessionId = readVeraSessionToken(
        owner.lifecycleSessionTokens.replacement.value,
    )?.session_id;

    if (data.boundary === "expired") {
        return (
            data.session_id === replacementSessionId &&
            data.previous_session_id === currentSessionId
        );
    }

    return (
        data.session_id === currentSessionId &&
        data.previous_session_id === null
    );
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

export function applyVeraLifecycleOwnerCookies(
    response: NextResponse,
    owner: VeraLifecycleOwnerHeadersSuccess,
    lifecycle: VeraLifecycleResponse | null,
    recoveryMode: VeraLifecycleRecoveryMode,
): NextResponse {
    const protectedCookieNames = new Set<string>();
    if (lifecycle?.boundary === "expired") {
        protectedCookieNames.add(owner.lifecycleSessionTokens.refreshed.name);
        protectedCookieNames.add(owner.lifecycleSessionTokens.replacement.name);
    }
    applyVeraOwnerCookies(response, {
        ...owner,
        sessionCookiesToDelete: owner.sessionCookiesToDelete.filter(
            (name) => !protectedCookieNames.has(name),
        ),
    });

    if (recoveryMode === "store") {
        const remainingRecoverySeconds = Math.max(
            0,
            owner.lifecycleRecoveryExpiresAt -
                Math.floor(Date.now() / 1000),
        );
        if (remainingRecoverySeconds > 0) {
            response.cookies.set(
                owner.lifecycleRecoveryCookie.name,
                owner.lifecycleRecoveryCookie.value,
                {
                    ...VERA_LIFECYCLE_RECOVERY_COOKIE_OPTIONS,
                    maxAge: remainingRecoverySeconds,
                },
            );
        } else if (owner.hadLifecycleRecoveryCookie) {
            response.cookies.set(owner.lifecycleRecoveryCookie.name, "", {
                ...VERA_LIFECYCLE_RECOVERY_COOKIE_OPTIONS,
                maxAge: 0,
            });
        }
    } else if (owner.hadLifecycleRecoveryCookie) {
        response.cookies.set(owner.lifecycleRecoveryCookie.name, "", {
            ...VERA_LIFECYCLE_RECOVERY_COOKIE_OPTIONS,
            maxAge: 0,
        });
    }
    if (!lifecycle) return response;

    if (lifecycle.boundary === "expired") {
        response.cookies.set(
            owner.lifecycleSessionTokens.refreshed.name,
            owner.lifecycleSessionTokens.refreshed.value,
            VERA_SESSION_COOKIE_OPTIONS,
        );
        response.cookies.set(
            owner.lifecycleSessionTokens.replacement.name,
            owner.lifecycleSessionTokens.replacement.value,
            VERA_SESSION_COOKIE_OPTIONS,
        );
        return response;
    }

    const sessionCookie =
        lifecycle.boundary === "created"
            ? owner.lifecycleSessionTokens.current
            : owner.lifecycleSessionTokens.refreshed;
    response.cookies.set(
        sessionCookie.name,
        sessionCookie.value,
        VERA_SESSION_COOKIE_OPTIONS,
    );
    return response;
}
