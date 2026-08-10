import {
    createHash,
    createHmac,
    randomUUID,
    timingSafeEqual,
} from "node:crypto";

// Lifetime of the signed owner proof, not of the chat session. The active
// context boundary is resolved only by the server; an expired proof is used
// solely by the lifecycle recovery handshake.
export const VERA_OWNER_PROOF_CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;
export const VERA_SESSION_COOKIE_PREFIX = "vera_session_";

interface VeraSessionTokenPayload {
    session_id: string;
    exp: number;
}

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
};

export function getVeraSessionCookieName(sessionId: string): string {
    const sessionHash = createHash("sha256")
        .update(sessionId, "utf8")
        .digest("hex");
    return `${VERA_SESSION_COOKIE_PREFIX}${sessionHash}`;
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
            exp:
                Math.floor(Date.now() / 1000) +
                VERA_OWNER_PROOF_CREDENTIAL_TTL_SECONDS,
        }),
    ).toString("base64url");
    const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
    return `${payload}.${signature}`;
}

export function readVeraSessionToken(
    token: string,
): VeraSessionTokenPayload | null {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;

    const secret = getVeraSessionSigningKey();
    const expectedSignature = createHmac("sha256", secret)
        .update(payload)
        .digest();

    let actualSignature: Buffer;
    try {
        actualSignature = Buffer.from(signature, "base64url");
    } catch {
        return null;
    }
    if (
        actualSignature.length !== expectedSignature.length ||
        !timingSafeEqual(actualSignature, expectedSignature)
    ) {
        return null;
    }

    try {
        const parsed = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8"),
        ) as Partial<VeraSessionTokenPayload>;
        if (
            typeof parsed.session_id !== "string" ||
            typeof parsed.exp !== "number"
        ) {
            return null;
        }
        return { session_id: parsed.session_id, exp: parsed.exp };
    } catch {
        return null;
    }
}
