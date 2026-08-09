import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "@/instrumentation";

describe("Vera startup instrumentation", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("validates the signing key when the Node.js server starts", async () => {
        vi.stubEnv("NEXT_RUNTIME", "nodejs");
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "");

        await expect(register()).rejects.toThrow(
            "VERA_SESSION_SIGNING_KEY is not configured",
        );
    });

    it("does not load the Node.js signing helper in the Edge runtime", async () => {
        vi.stubEnv("NEXT_RUNTIME", "edge");
        vi.stubEnv("VERA_SESSION_SIGNING_KEY", "");

        await expect(register()).resolves.toBeUndefined();
    });
});
