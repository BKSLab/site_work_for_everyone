import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../rate-limit";

describe("createRateLimiter", () => {
    it("allows requests within limit", () => {
        const limiter = createRateLimiter({ interval: 60_000, limit: 3 });
        expect(limiter.check("user1").allowed).toBe(true);
        expect(limiter.check("user1").allowed).toBe(true);
        expect(limiter.check("user1").allowed).toBe(true);
    });

    it("blocks requests over the limit", () => {
        const limiter = createRateLimiter({ interval: 60_000, limit: 2 });
        limiter.check("user1");
        limiter.check("user1");
        const result = limiter.check("user1");
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    it("tracks different keys independently", () => {
        const limiter = createRateLimiter({ interval: 60_000, limit: 2 });
        limiter.check("user1");
        limiter.check("user1");
        const blocked = limiter.check("user1");
        const allowed = limiter.check("user2");
        expect(blocked.allowed).toBe(false);
        expect(allowed.allowed).toBe(true);
    });

    it("returns correct remaining count", () => {
        const limiter = createRateLimiter({ interval: 60_000, limit: 3 });
        expect(limiter.check("user1").remaining).toBe(2);
        expect(limiter.check("user1").remaining).toBe(1);
        expect(limiter.check("user1").remaining).toBe(0);
    });

    it("returns resetAt in the future", () => {
        const before = Date.now();
        const limiter = createRateLimiter({ interval: 60_000, limit: 5 });
        const result = limiter.check("user1");
        expect(result.resetAt).toBeGreaterThan(before);
    });
});
