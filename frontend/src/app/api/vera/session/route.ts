import { NextRequest, NextResponse } from "next/server";

import {
    veraChatSessionCreateResponseSchema,
    veraChatSessionCreateSchema,
} from "@/lib/schemas/vera";
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
const createSessionLimiter = createRateLimiter({
    interval: 60_000,
    limit: 20,
});

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function POST(request: NextRequest) {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const rateResult = createSessionLimiter.check(getClientIp(request));
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

    let body: string;
    let sessionId: string;
    try {
        const raw = await request.json();
        const parsed = veraChatSessionCreateSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    detail:
                        parsed.error.issues[0]?.message ?? "Validation error",
                },
                { status: 422 },
            );
        }
        body = JSON.stringify(parsed.data);
        sessionId = parsed.data.session_id;
    } catch {
        return NextResponse.json(
            { detail: "Invalid request body" },
            { status: 400 },
        );
    }

    const requestId = getRequestId(request);
    const owner = await getVeraOwnerHeaders(requestId, sessionId);
    if (!owner.ok) return owner.response;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const startTime = Date.now();
    let response: Response;
    try {
        response = await fetch(new URL("/api/vera/session", AUTH_API_URL), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Request-ID": requestId,
                ...owner.headers,
            },
            body,
            signal: controller.signal,
            cache: "no-store",
        });
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        logger[isAbort ? "warn" : "error"](
            isAbort
                ? "Vera session create proxy timeout"
                : "Vera session create proxy connection error",
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

    const parsedResponse = await parseVeraHttpResponse(
        response,
        veraChatSessionCreateResponseSchema,
    );
    if (
        !parsedResponse.success ||
        (parsedResponse.kind === "success" &&
            parsedResponse.data.session_id !== sessionId)
    ) {
        logger.error("Vera session create proxy invalid response", {
            requestId,
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
    logFn("Vera session create proxy request", {
        requestId,
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
