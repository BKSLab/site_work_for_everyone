/**
 * Генерирует или извлекает Request ID для трассировки запроса
 * через всю цепочку: Browser → Next.js → Backend.
 */
import { NextRequest } from "next/server";

export function getRequestId(request: NextRequest): string {
    // Если входящий запрос уже имеет X-Request-ID (от nginx) — используем его
    const existing = request.headers.get("x-request-id");
    if (existing) return existing;

    // Иначе генерируем новый
    return crypto.randomUUID();
}
