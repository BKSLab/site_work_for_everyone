import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/utils/logger";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { getRequestId } from "@/lib/utils/request-id";

const AUTH_API_URL = process.env.AUTH_API_URL;
const currentSessionLimiter = createRateLimiter({
    interval: 60_000,
    limit: 60,
});

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function GET(request: NextRequest) {
    const rateResult = currentSessionLimiter.check(getClientIp(request));
    if (!rateResult.allowed) {
        return NextResponse.json(
            { detail: "Слишком много запросов. Подождите и попробуйте снова." },
            {
                status: 429,
                headers: {
                    "Retry-After": String(
                        Math.ceil((rateResult.resetAt - Date.now()) / 1000),
                    ),
                },
            },
        );
    }

    if (!AUTH_API_URL) {
        return NextResponse.json(
            { detail: "Сервер не настроен." },
            { status: 503 },
        );
    }

    const requestId = getRequestId(request);
    const headers: HeadersInit = {
        "X-Request-ID": requestId,
    };
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;
    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const backendUrl = new URL("/api/vera/session/current", AUTH_API_URL);
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
        response = await fetch(backendUrl, {
            method: "GET",
            headers,
            signal: controller.signal,
            cache: "no-store",
        });
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        logger[isAbort ? "warn" : "error"](
            isAbort
                ? "Vera current session proxy timeout"
                : "Vera current session proxy connection error",
            {
                requestId,
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
            },
        );
        return NextResponse.json(
            {
                detail: isAbort
                    ? "Сервер не отвечает. Попробуйте позже."
                    : "Ошибка соединения с сервером.",
            },
            { status: isAbort ? 504 : 502 },
        );
    } finally {
        clearTimeout(timeoutId);
    }

    const data = await response.json();
    const logFn = response.ok
        ? logger.info
        : response.status >= 500
          ? logger.error
          : logger.warn;
    logFn("Vera current session proxy request", {
        requestId,
        status: response.status,
        durationMs: Date.now() - startTime,
    });

    const result = NextResponse.json(data, { status: response.status });
    result.headers.set("X-Request-ID", requestId);
    return result;
}
