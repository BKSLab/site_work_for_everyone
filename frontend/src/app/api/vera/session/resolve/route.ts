import { NextRequest, NextResponse } from "next/server";

import {
    veraChatSessionResolveResponseSchema,
    veraChatSessionResolveSchema,
} from "@/lib/schemas/vera";
import { validateOrigin } from "@/lib/utils/csrf";
import { logger } from "@/lib/utils/logger";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { getRequestId } from "@/lib/utils/request-id";
import {
    applyVeraLifecycleOwnerCookies,
    getVeraLifecycleOwnerHeaders,
    getVeraOwnerUpstreamError,
    isVeraLifecycleResponseBoundToOwner,
} from "@/lib/utils/vera-owner-headers";
import {
    getVeraErrorDetail,
    parseVeraHttpResponse,
    VERA_RESPONSE_CONTRACT_ERROR,
} from "@/lib/utils/vera-response";

const AUTH_API_URL = process.env.AUTH_API_URL;
const resolveSessionLimiter = createRateLimiter({
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

export async function POST(request: NextRequest) {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const rateResult = resolveSessionLimiter.check(getClientIp(request));
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
    let replacementSessionId: string;
    try {
        const raw = await request.json();
        const parsed = veraChatSessionResolveSchema.safeParse(raw);
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
        replacementSessionId = parsed.data.replacement_session_id;
    } catch {
        return NextResponse.json(
            { detail: "Invalid request body" },
            { status: 400 },
        );
    }

    const requestId = getRequestId(request);
    const owner = await getVeraLifecycleOwnerHeaders(
        requestId,
        sessionId,
        replacementSessionId,
    );
    if (!owner.ok) return owner.response;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const startTime = Date.now();
    let response: Response;
    try {
        response = await fetch(
            new URL("/api/vera/session/resolve", AUTH_API_URL),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Request-ID": requestId,
                    ...owner.headers,
                },
                body,
                signal: controller.signal,
                cache: "no-store",
            },
        );
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        logger[isAbort ? "warn" : "error"](
            isAbort
                ? "Vera session resolve proxy timeout"
                : "Vera session resolve proxy connection error",
            {
                requestId,
                durationMs: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
            },
        );
        return applyVeraLifecycleOwnerCookies(
            NextResponse.json(
                {
                    detail: isAbort
                        ? "Сервер не отвечает. Попробуйте позже."
                        : "Ошибка соединения с сервером.",
                },
                { status: isAbort ? 504 : 502 },
            ),
            owner,
            null,
            "store",
        );
    } finally {
        clearTimeout(timeoutId);
    }

    const parsedResponse = await parseVeraHttpResponse(
        response,
        veraChatSessionResolveResponseSchema,
    );
    const lifecycle =
        parsedResponse.success && parsedResponse.kind === "success"
            ? parsedResponse.data
            : null;
    if (
        !parsedResponse.success ||
        (lifecycle !== null &&
            !isVeraLifecycleResponseBoundToOwner(lifecycle, owner))
    ) {
        logger.error("Vera session resolve proxy invalid response", {
            requestId,
            status: response.status,
            durationMs: Date.now() - startTime,
        });
        const invalidResponse = NextResponse.json(
            { detail: VERA_RESPONSE_CONTRACT_ERROR },
            { status: 502 },
        );
        invalidResponse.headers.set("X-Request-ID", requestId);
        return applyVeraLifecycleOwnerCookies(
            invalidResponse,
            owner,
            null,
            "store",
        );
    }

    const data = parsedResponse.data;
    const logFn = response.ok
        ? logger.info
        : response.status >= 500
          ? logger.error
          : logger.warn;
    logFn("Vera session resolve proxy request", {
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
    if (ownerError) {
        return applyVeraLifecycleOwnerCookies(
            ownerError,
            owner,
            null,
            "clear",
        );
    }

    const result = NextResponse.json(data, { status: response.status });
    result.headers.set("X-Request-ID", requestId);
    const isDefinitelyRejected = [400, 401, 403, 409, 422, 429].includes(
        response.status,
    );
    return applyVeraLifecycleOwnerCookies(
        result,
        owner,
        lifecycle,
        lifecycle || isDefinitelyRejected ? "clear" : "store",
    );
}
