import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateOrigin } from "@/lib/utils/csrf";
import { sanitizeProxyPath } from "@/lib/utils/proxy";
import { getRequestId } from "@/lib/utils/request-id";
import { logger } from "@/lib/utils/logger";

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

async function proxyRequest(request: NextRequest, path: string) {
    const requestId = getRequestId(request);
    const startTime = Date.now();

    const url = new URL(`/api/v1/${path}`, API_URL);
    url.search = new URL(request.url).search;

    const headers: HeadersInit = {
        "X-API-Key": API_KEY!,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
    };

    // Пробрасываем access_token для защищённых эндпоинтов
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;
    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const fetchOptions: RequestInit = {
        method: request.method,
        headers,
    };

    if (request.method === "POST") {
        fetchOptions.body = await request.text();
    }

    // === Fetch с таймаутом 120 секунд (поиск вакансий может занимать >1 минуты) ===
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let response: Response;
    try {
        response = await fetch(url.toString(), {
            ...fetchOptions,
            signal: controller.signal,
        });
    } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (isAbort) {
            logger.warn("V1 proxy timeout", {
                requestId,
                path: `/api/v1/${path}`,
                method: request.method,
                durationMs: Date.now() - startTime,
            });
            return NextResponse.json(
                { detail: "Сервер не отвечает. Попробуйте позже." },
                { status: 504 }
            );
        }
        logger.error("V1 proxy connection error", {
            requestId,
            path: `/api/v1/${path}`,
            method: request.method,
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
            targetUrl: url.toString(),
        });
        return NextResponse.json(
            { detail: "Ошибка соединения с сервером." },
            { status: 502 }
        );
    } finally {
        clearTimeout(timeoutId);
    }

    logger.info("V1 proxy request", {
        requestId,
        path: `/api/v1/${path}`,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startTime,
    });

    if (response.status === 204) {
        return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();

    if (!response.ok) {
        const logFn = response.status >= 500 ? logger.error : logger.warn;
        logFn("V1 proxy error response", {
            requestId,
            path: `/api/v1/${path}`,
            method: request.method,
            status: response.status,
            detail: data.detail,
        });
    }

    const res = NextResponse.json(data, { status: response.status });
    res.headers.set("X-Request-ID", requestId);
    return res;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    return proxyRequest(request, sanitizeProxyPath(path));
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    // CSRF protection: проверяем Origin header
    const originError = validateOrigin(request);
    if (originError) return originError;

    const { path } = await params;
    return proxyRequest(request, sanitizeProxyPath(path));
}
