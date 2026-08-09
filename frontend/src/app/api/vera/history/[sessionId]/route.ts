import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/utils/logger";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { getRequestId } from "@/lib/utils/request-id";
import {
    applyVeraOwnerCookies,
    getVeraOwnerHeaders,
    getVeraOwnerUpstreamError,
} from "@/lib/utils/vera-owner-headers";

const AUTH_API_URL = process.env.AUTH_API_URL;
const historyLimiter = createRateLimiter({
    interval: 60_000,
    limit: 60,
});
const sessionIdSchema = z.string().min(1).max(100);

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const rateResult = historyLimiter.check(getClientIp(request));
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

    const parsedSessionId = sessionIdSchema.safeParse((await params).sessionId);
    if (!parsedSessionId.success) {
        return NextResponse.json(
            { detail: "Некорректный идентификатор сессии." },
            { status: 422 },
        );
    }

    const requestId = getRequestId(request);
    const owner = await getVeraOwnerHeaders(requestId, parsedSessionId.data);
    if (!owner.ok) return owner.response;
    const headers: HeadersInit = {
        "X-Request-ID": requestId,
        ...owner.headers,
    };

    const backendUrl = new URL(
        `/api/vera/history/${encodeURIComponent(parsedSessionId.data)}`,
        AUTH_API_URL,
    );
    const beforeSequence = request.nextUrl.searchParams.get("before_sequence");
    if (beforeSequence) {
        backendUrl.searchParams.set("before_sequence", beforeSequence);
    }
    backendUrl.searchParams.set("limit", "30");
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
                ? "Vera history proxy timeout"
                : "Vera history proxy connection error",
            {
                requestId,
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
            },
        );
        return applyVeraOwnerCookies(
            NextResponse.json(
                {
                    detail: isAbort
                        ? "Сервер не отвечает. Попробуйте позже."
                        : "Ошибка соединения с сервером.",
                },
                { status: isAbort ? 504 : 502 },
            ),
            owner,
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
    logFn("Vera history proxy request", {
        requestId,
        status: response.status,
        durationMs: Date.now() - startTime,
    });

    const ownerError = getVeraOwnerUpstreamError(
        response.status,
        data,
        requestId,
    );
    if (ownerError) return applyVeraOwnerCookies(ownerError, owner);

    const result = NextResponse.json(data, { status: response.status });
    result.headers.set("X-Request-ID", requestId);
    return applyVeraOwnerCookies(result, owner);
}
