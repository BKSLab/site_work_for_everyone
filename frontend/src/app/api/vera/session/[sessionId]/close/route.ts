import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { veraChatSessionCloseResponseSchema } from "@/lib/schemas/vera";
import { validateOrigin } from "@/lib/utils/csrf";
import { logger } from "@/lib/utils/logger";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { getRequestId } from "@/lib/utils/request-id";
import {
    applyVeraOwnerCookies,
    getVeraOwnerHeaders,
    getVeraOwnerUpstreamError,
} from "@/lib/utils/vera-owner-headers";
import {
    getVeraErrorDetail,
    parseVeraHttpResponse,
    VERA_RESPONSE_CONTRACT_ERROR,
} from "@/lib/utils/vera-response";

const AUTH_API_URL = process.env.AUTH_API_URL;
const closeSessionLimiter = createRateLimiter({
    interval: 60_000,
    limit: 20,
});
const sessionIdSchema = z.string().min(1).max(100);

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const rateResult = closeSessionLimiter.check(getClientIp(request));
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
    const sessionId = parsedSessionId.data;
    const requestId = getRequestId(request);
    const owner = await getVeraOwnerHeaders(requestId, sessionId);
    if (!owner.ok) return owner.response;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const startTime = Date.now();
    let response: Response;
    try {
        response = await fetch(
            new URL(
                `/api/vera/session/${encodeURIComponent(sessionId)}/close`,
                AUTH_API_URL,
            ),
            {
                method: "POST",
                headers: {
                    "X-Request-ID": requestId,
                    ...owner.headers,
                },
                signal: controller.signal,
                cache: "no-store",
            },
        );
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        logger[isAbort ? "warn" : "error"](
            isAbort
                ? "Vera session close proxy timeout"
                : "Vera session close proxy connection error",
            {
                requestId,
                sessionId,
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

    const parsedResponse = await parseVeraHttpResponse(
        response,
        veraChatSessionCloseResponseSchema,
    );
    if (
        !parsedResponse.success ||
        (parsedResponse.kind === "success" &&
            parsedResponse.data.session_id !== sessionId)
    ) {
        logger.error("Vera session close proxy invalid response", {
            requestId,
            sessionId,
            status: response.status,
            durationMs: Date.now() - startTime,
        });
        const invalidResponse = NextResponse.json(
            { detail: VERA_RESPONSE_CONTRACT_ERROR },
            { status: 502 },
        );
        invalidResponse.headers.set("X-Request-ID", requestId);
        return applyVeraOwnerCookies(invalidResponse, owner);
    }

    const data = parsedResponse.data;
    const logFn = response.ok
        ? logger.info
        : response.status >= 500
          ? logger.error
          : logger.warn;
    logFn("Vera session close proxy request", {
        requestId,
        sessionId,
        status: response.status,
        durationMs: Date.now() - startTime,
        detail:
            parsedResponse.kind === "error"
                ? getVeraErrorDetail(parsedResponse.data)
                : undefined,
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
