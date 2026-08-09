import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createVeraSessionToken,
    getVeraSessionCookieName,
    readVeraSessionToken,
} from "@/lib/utils/vera-session-token";

describe("vera session token", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses a deterministic SHA-256 hash of the full session id", () => {
        const cookieName = getVeraSessionCookieName("session-with_symbols");

        expect(cookieName).toMatch(/^vera_session_[a-f0-9]{64}$/);
        expect(cookieName).toBe(
            getVeraSessionCookieName("session-with_symbols"),
        );
        expect(cookieName).not.toBe(
            getVeraSessionCookieName("sessionwithsymbols"),
        );
    });

    it("reads a valid signed payload and rejects a modified signature", () => {
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "test-signing-key");
        const token = createVeraSessionToken("session-1");

        expect(readVeraSessionToken(token)).toMatchObject({
            session_id: "session-1",
        });
        expect(readVeraSessionToken(`${token}modified`)).toBeNull();
    });
});
