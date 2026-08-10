import { NextRequest, NextResponse } from "next/server";
import { validateOrigin } from "@/lib/utils/csrf";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { getRequestId } from "@/lib/utils/request-id";
import { logger } from "@/lib/utils/logger";
import {
    veraChatResponseSchema,
    veraChatSchema,
    veraChatSessionLifecycleResponseSchema,
} from "@/lib/schemas/vera";
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

// AUTH_API_URL уже указывает на backend этого репозитория (не на внешний
// API_URL, используемый /api/v1/[...path] для вакансий hh.ru).
const AUTH_API_URL = process.env.AUTH_API_URL;

const chatLimiter = createRateLimiter({ interval: 60_000, limit: 20 }); // 20 сообщений/мин

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function POST(request: NextRequest) {
    // 1. CSRF protection: проверяем Origin header
    const originError = validateOrigin(request);
    if (originError) return originError;

    // 2. Rate limiting
    const ip = getClientIp(request);
    const rateResult = chatLimiter.check(ip);
    if (!rateResult.allowed) {
        return NextResponse.json(
            {
                detail: "Слишком много сообщений. Подождите и попробуйте снова.",
            },
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
            {
                detail: "Сервер не настроен.",
                publish_state: "not_published",
            },
            { status: 503 },
        );
    }

    const requestId = getRequestId(request);
    const startTime = Date.now();

    // 3. Валидация тела запроса (Zod) — второй рубеж, работает даже если
    // клиентская валидация обойдена
    let body: string;
    let sessionId: string;
    let replacementSessionId: string;
    try {
        const raw = await request.json();
        const result = veraChatSchema.safeParse(raw);
        if (!result.success) {
            return NextResponse.json(
                {
                    detail:
                        result.error.issues[0]?.message ?? "Validation error",
                },
                { status: 422 },
            );
        }
        sessionId = result.data.session_id;
        replacementSessionId = result.data.request_id;
        body = JSON.stringify({
            ...result.data,
            replacement_session_id: replacementSessionId,
        });
    } catch {
        return NextResponse.json(
            { detail: "Invalid request body" },
            { status: 400 },
        );
    }

    // 4. Пробрасываем access_token cookie как Bearer — user_id для агента
    // определяется backend'ом из верифицированного JWT, не из тела запроса
    // (см. AGENT_VERA_ARCHITECTURE.md — user_id влияет на доступные тулы)
    const owner = await getVeraLifecycleOwnerHeaders(
        requestId,
        sessionId,
        replacementSessionId,
    );
    if (!owner.ok) {
        return owner.response.status === 503
            ? markAsNotPublished(owner.response, requestId)
            : owner.response;
    }
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        ...owner.headers,
    };

    const url = new URL("/api/vera/chat", AUTH_API_URL);

    // Публикация в очередь мгновенная — короткий таймаут, ответ придёт
    // отдельно через SSE, не через этот запрос
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
        response = await fetch(url.toString(), {
            method: "POST",
            headers,
            body,
            signal: controller.signal,
        });
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (isAbort) {
            logger.warn("Vera chat proxy timeout", {
                requestId,
                durationMs: Date.now() - startTime,
            });
            return applyVeraLifecycleOwnerCookies(
                NextResponse.json(
                    { detail: "Сервер не отвечает. Попробуйте позже." },
                    { status: 504 },
                ),
                owner,
                null,
                "store",
            );
        }
        logger.error("Vera chat proxy connection error", {
            requestId,
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        });
        return applyVeraLifecycleOwnerCookies(
            NextResponse.json(
                { detail: "Ошибка соединения с сервером." },
                { status: 502 },
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
        veraChatResponseSchema,
    );
    const lifecycleResult = parsedResponse.success
        ? veraChatSessionLifecycleResponseSchema.safeParse(
              parsedResponse.data,
          )
        : null;
    const hasLifecycleFields =
        parsedResponse.success &&
        typeof parsedResponse.data === "object" &&
        parsedResponse.data !== null &&
        [
            "session_id",
            "previous_session_id",
            "boundary",
            "session_ttl_seconds",
        ].some((field) => field in parsedResponse.data);
    const lifecycle = lifecycleResult?.success
        ? lifecycleResult.data
        : null;
    if (
        !parsedResponse.success ||
        (hasLifecycleFields && lifecycle === null) ||
        (lifecycle !== null &&
            !isVeraLifecycleResponseBoundToOwner(lifecycle, owner))
    ) {
        logger.error("Vera chat proxy invalid response", {
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

    if (!response.ok) {
        const logFn = response.status >= 500 ? logger.error : logger.warn;
        logFn("Vera chat proxy error response", {
            requestId,
            status: response.status,
            durationMs: Date.now() - startTime,
            detail:
                parsedResponse.kind === "error"
                    ? getVeraErrorDetail(parsedResponse.data)
                    : undefined,
        });
    } else {
        logger.info("Vera chat proxy request", {
            requestId,
            status: response.status,
            durationMs: Date.now() - startTime,
        });
    }

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

    const res = NextResponse.json(data, { status: response.status });
    res.headers.set("X-Request-ID", requestId);
    const isDefinitelyRejected =
        [400, 401, 403, 409, 422, 429].includes(response.status);
    return applyVeraLifecycleOwnerCookies(
        res,
        owner,
        lifecycle,
        response.ok || lifecycle !== null || isDefinitelyRejected
            ? "clear"
            : "store",
    );
}

async function markAsNotPublished(
    response: NextResponse,
    requestId: string,
): Promise<NextResponse> {
    let detail = "Сервис сессий чата временно не настроен.";
    try {
        const body = (await response.clone().json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
    } catch {
        // Configuration failures are generated locally as JSON. Keep a safe
        // fallback should that implementation detail ever change.
    }
    const marked = NextResponse.json(
        { detail, publish_state: "not_published" },
        { status: response.status },
    );
    marked.headers.set(
        "X-Request-ID",
        response.headers.get("X-Request-ID") ?? requestId,
    );
    return marked;
}
