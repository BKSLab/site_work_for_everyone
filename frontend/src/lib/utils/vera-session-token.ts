import { createHmac, randomUUID } from "node:crypto";

const SESSION_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export class VeraSessionConfigurationError extends Error {
    constructor() {
        super("VERA_SESSION_SIGNING_KEY is not configured");
        this.name = "VeraSessionConfigurationError";
    }
}

export const VERA_SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/vera",
    maxAge: SESSION_TOKEN_TTL_SECONDS,
};

export function getVeraSessionCookieName(sessionId: string): string {
    return `vera_session_${sessionId.replace(/[^a-zA-Z0-9]/g, "")}`;
}

function getVeraSessionSigningKey(): string {
    const secret = process.env.VERA_SESSION_SIGNING_KEY;
    if (!secret) {
        throw new VeraSessionConfigurationError();
    }
    return secret;
}

export function assertVeraSessionSigningKey(): void {
    getVeraSessionSigningKey();
}

export function createVeraSessionToken(sessionId: string): string {
    const secret = getVeraSessionSigningKey();
    const payload = Buffer.from(
        JSON.stringify({
            session_id: sessionId,
            nonce: randomUUID(),
            exp: Math.floor(Date.now() / 1000) + SESSION_TOKEN_TTL_SECONDS,
        }),
    ).toString("base64url");
    const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
    return `${payload}.${signature}`;
}
