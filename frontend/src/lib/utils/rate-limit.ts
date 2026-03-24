/**
 * Простой in-memory rate limiter для Next.js Route Handlers.
 *
 * ВАЖНО: работает только в рамках одного инстанса Node.js.
 * Для multi-instance deployment нужен Redis-based rate limiter.
 * Для нашего проекта (один контейнер) — достаточно.
 *
 * Использование:
 *   const limiter = createRateLimiter({ interval: 60_000, limit: 5 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) return NextResponse.json(..., { status: 429 });
 */

interface RateLimiterConfig {
    /** Временное окно в миллисекундах */
    interval: number;
    /** Максимум запросов за окно */
    limit: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

export function createRateLimiter(config: RateLimiterConfig) {
    const hits = new Map<string, { count: number; resetAt: number }>();

    // Периодическая очистка просроченных записей (предотвращение утечки памяти)
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of hits) {
            if (value.resetAt <= now) {
                hits.delete(key);
            }
        }
    }, config.interval);

    return {
        check(key: string): RateLimitResult {
            const now = Date.now();
            const existing = hits.get(key);

            if (!existing || existing.resetAt <= now) {
                // Новое окно
                const resetAt = now + config.interval;
                hits.set(key, { count: 1, resetAt });
                return { allowed: true, remaining: config.limit - 1, resetAt };
            }

            existing.count++;
            if (existing.count > config.limit) {
                return { allowed: false, remaining: 0, resetAt: existing.resetAt };
            }

            return {
                allowed: true,
                remaining: config.limit - existing.count,
                resetAt: existing.resetAt,
            };
        },
    };
}
