import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Страницы, доступные только авторизованным
const PROTECTED_PATHS = ["/favorites"];

// Auth-страницы, недоступные авторизованным (нет смысла логиниться повторно)
const AUTH_PATHS = [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Считаем сессию активной если есть хотя бы один из токенов.
    // access_token живёт 1 час, refresh_token — 30 дней.
    // Если access_token истёк, /api/auth/me автоматически обновит его через refresh_token.
    const hasToken = Boolean(
        request.cookies.get("access_token")?.value ||
        request.cookies.get("refresh_token")?.value,
    );

    // Защищённые страницы → редирект на /auth/login если нет токена
    if (PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
        if (!hasToken) {
            const loginUrl = new URL("/auth/login", request.url);
            loginUrl.searchParams.set("redirect", pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    // Auth-страницы → редирект на / если уже авторизован
    if (AUTH_PATHS.some((p) => pathname.startsWith(p))) {
        if (hasToken) {
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/favorites/:path*", "/auth/:path*"],
};
