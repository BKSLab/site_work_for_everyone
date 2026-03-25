import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { ZodSchema } from "zod";
import { validateOrigin } from "@/lib/utils/csrf";
import { sanitizeProxyPath } from "@/lib/utils/proxy";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { getRequestId } from "@/lib/utils/request-id";
import { logger } from "@/lib/utils/logger";
import {
    loginSchema,
    registerSchema,
    verifyEmailSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    resendCodeSchema,
    feedbackSchema,
} from "@/lib/schemas/auth";

const AUTH_API_URL = process.env.AUTH_API_URL;

// Конфигурация cookies
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/",
};

// Время жизни cookies должно совпадать с настройками бэкенда
// Бэкенд: jwt_expire_seconds = 3600 (1 час), jwt_refresh_expire_days = 30
const ACCESS_TOKEN_MAX_AGE = 60 * 60; // 1 час
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 дней

// Эндпоинты, которые возвращают токены в ответе
const TOKEN_ENDPOINTS = ["login", "verify-email", "refresh"];

function isTokenEndpoint(path: string): boolean {
    return TOKEN_ENDPOINTS.includes(path);
}

// Декодирование JWT payload без криптографической верификации
// (верификация уже выполнена бэкендом при создании токена)
function decodeJwtPayload(token: string): Record<string, unknown> {
    const base64Payload = token.split(".")[1];
    const jsonPayload = Buffer.from(base64Payload, "base64").toString("utf-8");
    return JSON.parse(jsonPayload);
}

// === Rate limiters для auth эндпоинтов ===
const loginLimiter = createRateLimiter({ interval: 60_000, limit: 5 });     // 5 попыток/мин
const registerLimiter = createRateLimiter({ interval: 60_000, limit: 3 });  // 3/мин
const forgotLimiter = createRateLimiter({ interval: 60_000, limit: 3 });    // 3/мин
const resendLimiter = createRateLimiter({ interval: 60_000, limit: 3 });    // 3/мин

const feedbackLimiter = createRateLimiter({ interval: 60_000 * 60, limit: 5 }); // 5/час

const PATH_LIMITERS: Record<string, ReturnType<typeof createRateLimiter>> = {
    login: loginLimiter,
    register: registerLimiter,
    "forgot-password": forgotLimiter,
    "resend-verification-code": resendLimiter,
    feedback: feedbackLimiter,
};

// === Zod-схемы для серверной валидации запросов ===
const PATH_SCHEMAS: Record<string, ZodSchema> = {
    login: loginSchema,
    register: registerSchema,
    "verify-email": verifyEmailSchema,
    "forgot-password": forgotPasswordSchema,
    "reset-password": resetPasswordSchema,
    "resend-verification-code": resendCodeSchema,
    feedback: feedbackSchema,
};

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

async function proxyAuthRequest(request: NextRequest, path: string) {
    const requestId = getRequestId(request);
    const startTime = Date.now();

    const url = new URL(`/api/auth/${path}`, AUTH_API_URL);

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
    };

    let body: string | undefined;

    // === Специальная обработка logout ===
    // Читаем access_token из cookie, отправляем как Bearer
    if (path === "logout") {
        const cookieStore = await cookies();
        const accessToken = cookieStore.get("access_token")?.value;
        if (!accessToken) {
            return NextResponse.json(
                { detail: "Not authenticated" },
                { status: 401 }
            );
        }
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // === Специальная обработка refresh ===
    // Читаем refresh_token из cookie, вставляем в тело запроса
    if (path === "refresh") {
        const cookieStore = await cookies();
        const refreshToken = cookieStore.get("refresh_token")?.value;
        if (!refreshToken) {
            return NextResponse.json(
                { detail: "Not authenticated" },
                { status: 401 }
            );
        }
        body = JSON.stringify({ refresh_token: refreshToken });
    } else if (request.method === "POST") {
        body = await request.text();
    }

    // === Серверная валидация тела запроса (Zod) ===
    // Второй рубеж: работает даже если клиентская валидация обойдена
    if (body && PATH_SCHEMAS[path]) {
        try {
            const parsed = JSON.parse(body);
            const result = PATH_SCHEMAS[path].safeParse(parsed);
            if (!result.success) {
                return NextResponse.json(
                    { detail: result.error.issues[0]?.message ?? "Validation error" },
                    { status: 422 }
                );
            }
        } catch {
            return NextResponse.json(
                { detail: "Invalid request body" },
                { status: 400 }
            );
        }
    }

    const fetchOptions: RequestInit = {
        method: request.method,
        headers,
    };
    if (body) {
        fetchOptions.body = body;
    }

    // === Fetch с таймаутом 15 секунд ===
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
        response = await fetch(url.toString(), {
            ...fetchOptions,
            signal: controller.signal,
        });
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (isAbort) {
            logger.warn("Auth proxy timeout", {
                requestId,
                path: `/api/auth/${path}`,
                method: request.method,
                durationMs: Date.now() - startTime,
            });
            return NextResponse.json(
                { detail: "Сервер не отвечает. Попробуйте позже." },
                { status: 504 }
            );
        }
        logger.error("Auth proxy connection error", {
            requestId,
            path: `/api/auth/${path}`,
            method: request.method,
            durationMs: Date.now() - startTime,
        });
        return NextResponse.json(
            { detail: "Ошибка соединения с сервером." },
            { status: 502 }
        );
    } finally {
        clearTimeout(timeoutId);
    }

    logger.info("Auth proxy request", {
        requestId,
        path: `/api/auth/${path}`,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startTime,
    });

    // === Обработка logout: очищаем cookies ===
    if (path === "logout" && (response.status === 204 || response.ok)) {
        const res = new NextResponse(null, { status: 204 });
        res.cookies.set("access_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
        res.cookies.set("refresh_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
        return res;
    }

    if (response.status === 204) {
        return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();

    if (!response.ok) {
        const logFn = response.status >= 500 ? logger.error : logger.warn;
        logFn("Auth proxy error response", {
            requestId,
            path: `/api/auth/${path}`,
            method: request.method,
            status: response.status,
            detail: data.detail,
        });
    }

    // === Обработка token-эндпоинтов при успехе ===
    // Извлекаем токены из ответа, кладём в cookies, возвращаем user info
    if (response.ok && isTokenEndpoint(path)) {
        const { access_token, refresh_token } = data;

        // Безопасное декодирование JWT — если токен невалиден, возвращаем 502
        let payload: Record<string, unknown>;
        try {
            payload = decodeJwtPayload(access_token);
        } catch {
            return NextResponse.json(
                { detail: "Authentication error. Please try again." },
                { status: 502 }
            );
        }

        const email = payload.sub as string | undefined;
        const first_name = payload.first_name as string | undefined;
        const last_name = payload.last_name as string | undefined;

        if (!email || !first_name || !last_name) {
            return NextResponse.json(
                { detail: "Authentication error. Please try again." },
                { status: 502 }
            );
        }

        const res = NextResponse.json(
            { user: { email, first_name, last_name } },
            { status: response.status }
        );
        res.headers.set("X-Request-ID", requestId);

        res.cookies.set("access_token", access_token, {
            ...COOKIE_OPTIONS,
            maxAge: ACCESS_TOKEN_MAX_AGE,
        });
        res.cookies.set("refresh_token", refresh_token, {
            ...COOKIE_OPTIONS,
            maxAge: REFRESH_TOKEN_MAX_AGE,
        });

        return res;
    }

    // === Все остальные случаи: проброс ответа as-is ===
    const res = NextResponse.json(data, { status: response.status });
    res.headers.set("X-Request-ID", requestId);
    return res;
}

// === GET /api/auth/me — проверка текущей сессии ===
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const joinedPath = sanitizeProxyPath(path);

    if (joinedPath === "me") {
        const requestId = getRequestId(request);
        const cookieStore = await cookies();
        const accessToken = cookieStore.get("access_token")?.value;
        const refreshToken = cookieStore.get("refresh_token")?.value;

        // 1. Пробуем access_token — быстрый путь, без обращения к бэкенду
        if (accessToken) {
            try {
                const payload = decodeJwtPayload(accessToken);
                const exp = payload.exp as number;
                if (exp * 1000 >= Date.now()) {
                    const res = NextResponse.json({
                        user: {
                            email: payload.sub as string,
                            first_name: payload.first_name as string,
                            last_name: payload.last_name as string,
                        },
                    });
                    res.headers.set("X-Request-ID", requestId);
                    return res;
                }
                // Токен есть, но истёк — падаем в refresh ниже
            } catch {
                // Невалидный JWT — падаем в refresh ниже
            }
        }

        // 2. access_token отсутствует или истёк — пробуем обновить через refresh_token
        if (refreshToken && AUTH_API_URL) {
            try {
                const refreshUrl = new URL("/api/auth/refresh", AUTH_API_URL);
                const refreshRes = await fetch(refreshUrl.toString(), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });

                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    const { access_token, refresh_token: newRefreshToken } = data;

                    let payload: Record<string, unknown>;
                    try {
                        payload = decodeJwtPayload(access_token);
                    } catch {
                        return NextResponse.json(null, { status: 401 });
                    }

                    const email = payload.sub as string;
                    const first_name = payload.first_name as string;
                    const last_name = payload.last_name as string;
                    if (!email || !first_name || !last_name) {
                        return NextResponse.json(null, { status: 401 });
                    }

                    // Возвращаем пользователя и обновляем cookies
                    const res = NextResponse.json({ user: { email, first_name, last_name } });
                    res.headers.set("X-Request-ID", requestId);
                    res.cookies.set("access_token", access_token, {
                        ...COOKIE_OPTIONS,
                        maxAge: ACCESS_TOKEN_MAX_AGE,
                    });
                    res.cookies.set("refresh_token", newRefreshToken, {
                        ...COOKIE_OPTIONS,
                        maxAge: REFRESH_TOKEN_MAX_AGE,
                    });
                    return res;
                }
            } catch {
                // Сеть недоступна или бэкенд упал — возвращаем 401
            }
        }

        // Сессия невалидна — очищаем cookies, чтобы proxy не блокировал /auth/login
        const unauthRes = NextResponse.json(null, { status: 401 });
        unauthRes.cookies.set("access_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
        unauthRes.cookies.set("refresh_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
        return unauthRes;
    }

    return proxyAuthRequest(request, joinedPath);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    // 1. CSRF protection: проверяем Origin header
    const originError = validateOrigin(request);
    if (originError) return originError;

    const { path } = await params;
    const joinedPath = sanitizeProxyPath(path);

    // 2. Rate limiting
    const limiter = PATH_LIMITERS[joinedPath];
    if (limiter) {
        const ip = getClientIp(request);
        const result = limiter.check(ip);
        if (!result.allowed) {
            return NextResponse.json(
                { detail: "Слишком много запросов. Подождите и попробуйте снова." },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
                    },
                }
            );
        }
    }

    // 3. Proxy
    return proxyAuthRequest(request, joinedPath);
}
