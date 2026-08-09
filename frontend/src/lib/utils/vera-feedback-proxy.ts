import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

import { validateOrigin } from "@/lib/utils/csrf";
import { logger } from "@/lib/utils/logger";
import { getRequestId } from "@/lib/utils/request-id";
import {
    applyVeraOwnerCookies,
    getVeraOwnerHeaders,
    getVeraOwnerUpstreamError,
} from "@/lib/utils/vera-owner-headers";

const AUTH_API_URL = process.env.AUTH_API_URL;

interface RateLimiter {
    check(key: string): {
        allowed: boolean;
        resetAt: number;
    };
}

interface VeraFeedbackProxyOptions {
    request: NextRequest;
    method: "POST" | "PUT";
    backendPath: string;
    schema: z.ZodType;
    limiter: RateLimiter;
}

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function proxyVeraFeedback({
    request,
    method,
    backendPath,
    schema,
    limiter,
}: VeraFeedbackProxyOptions) {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const rateResult = limiter.check(getClientIp(request));
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
        const result = schema.safeParse(raw);
        if (!result.success) {
            return NextResponse.json(
                {
                    detail:
                        result.error.issues[0]?.message ?? "Validation error",
                },
                { status: 422 },
            );
        }
        const parsedData = result.data as { session_id?: unknown };
        if (typeof parsedData.session_id !== "string") {
            return NextResponse.json(
                { detail: "session_id обязателен." },
                { status: 422 },
            );
        }
        sessionId = parsedData.session_id;
        body = JSON.stringify(result.data);
    } catch {
        return NextResponse.json(
            { detail: "Invalid request body" },
            { status: 400 },
        );
    }

    const requestId = getRequestId(request);
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const owner = await getVeraOwnerHeaders(requestId, sessionId);
    if (!owner.ok) return owner.response;

    let response: Response;
    try {
        response = await fetch(new URL(backendPath, AUTH_API_URL).toString(), {
            method,
            headers: {
                "Content-Type": "application/json",
                "X-Request-ID": requestId,
                ...owner.headers,
            },
            body,
            signal: controller.signal,
        });
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        logger[isAbort ? "warn" : "error"](
            isAbort
                ? "Vera feedback proxy timeout"
                : "Vera feedback proxy connection error",
            {
                requestId,
                backendPath,
                method,
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
    logFn("Vera feedback proxy request", {
        requestId,
        backendPath,
        method,
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
