import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

/**
 * Проверяет Origin header входящего запроса.
 * Возвращает NextResponse с 403 если Origin не совпадает с хостом запроса.
 * Возвращает null если проверка пройдена.
 *
 * Логика:
 * 1. Для GET/HEAD/OPTIONS — пропускаем (не мутирующие методы)
 * 2. Извлекаем Origin header (или Referer как fallback)
 * 3. Сравниваем хост Origin с хостом запроса
 * 4. Если нет Origin и нет Referer — блокируем (strict mode)
 */
export function validateOrigin(request: NextRequest): NextResponse | null {
    const method = request.method.toUpperCase();

    // Не проверяем safe methods
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        return null;
    }

    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");

    // Определяем хост запроса
    const requestHost = request.headers.get("host") ?? request.nextUrl.host;

    // requestHost может быть с портом или без — нормализуем к hostname
    const requestHostname = requestHost.split(":")[0];

    if (origin) {
        try {
            const originUrl = new URL(origin);
            if (originUrl.hostname === requestHostname) {
                return null; // Origin совпадает — OK
            }
        } catch {
            // Невалидный Origin — блокируем
        }
        logger.warn("CSRF blocked: invalid origin", { origin, requestHost, method });
        return NextResponse.json(
            { detail: "Forbidden: invalid origin" },
            { status: 403 }
        );
    }

    // Нет Origin — проверяем Referer (некоторые браузеры/прокси не отправляют Origin)
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            if (refererUrl.hostname === requestHostname) {
                return null; // Referer совпадает — OK
            }
        } catch {
            // Невалидный Referer — блокируем
        }
        logger.warn("CSRF blocked: invalid referer", { referer, requestHost, method });
        return NextResponse.json(
            { detail: "Forbidden: invalid referer" },
            { status: 403 }
        );
    }

    // Нет ни Origin, ни Referer — блокируем
    // (Легитимные браузерные fetch всегда отправляют Origin)
    logger.warn("CSRF blocked: missing origin", { requestHost, method });
    return NextResponse.json(
        { detail: "Forbidden: missing origin" },
        { status: 403 }
    );
}
