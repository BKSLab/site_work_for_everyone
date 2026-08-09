import type { z } from "zod";

import {
    type VeraErrorResponse,
    veraErrorResponseSchema,
} from "@/lib/schemas/vera";

export const VERA_RESPONSE_CONTRACT_ERROR =
    "Сервис вернул некорректный ответ. Попробуйте позже.";

type VeraJsonParseResult<T> =
    | { success: true; data: T }
    | { success: false };

export type VeraHttpResponseResult<T> =
    | { success: true; kind: "success"; data: T }
    | { success: true; kind: "error"; data: VeraErrorResponse }
    | { success: false };

function hasJsonContentType(response: Response): boolean {
    const mediaType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();

    return (
        mediaType === "application/json" ||
        Boolean(mediaType?.endsWith("+json"))
    );
}

export async function parseVeraJsonResponse<T>(
    response: Response,
    schema: z.ZodType<T>,
): Promise<VeraJsonParseResult<T>> {
    if (!hasJsonContentType(response)) {
        return { success: false };
    }

    let text: string;
    try {
        text = await response.text();
    } catch {
        return { success: false };
    }

    if (!text.trim()) {
        return { success: false };
    }

    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return { success: false };
    }

    const parsed = schema.safeParse(body);
    return parsed.success
        ? { success: true, data: parsed.data }
        : { success: false };
}

export async function parseVeraHttpResponse<T>(
    response: Response,
    successSchema: z.ZodType<T>,
): Promise<VeraHttpResponseResult<T>> {
    if (response.ok) {
        const parsed = await parseVeraJsonResponse(response, successSchema);
        return parsed.success
            ? { success: true, kind: "success", data: parsed.data }
            : { success: false };
    }

    const parsed = await parseVeraJsonResponse(
        response,
        veraErrorResponseSchema,
    );
    return parsed.success
        ? { success: true, kind: "error", data: parsed.data }
        : { success: false };
}

export function getVeraErrorDetail(error: VeraErrorResponse): string {
    if (typeof error.detail === "string") {
        return error.detail;
    }

    return error.detail[0]?.msg ?? "Неизвестная ошибка";
}
