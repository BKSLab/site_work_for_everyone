import {
    type VeraChatHistoryResponse,
    type VeraChatFormData,
    veraChatHistoryResponseSchema,
    type VeraChatResponse,
    veraChatResponseSchema,
    type VeraCurrentChatSessionResponse,
    veraCurrentChatSessionResponseSchema,
    type VeraFeedbackResponse,
    type VeraFeedbackFormData,
    veraFeedbackResponseSchema,
    type VeraMessageFeedbackResponse,
    type VeraMessageFeedbackFormData,
    veraMessageFeedbackResponseSchema,
} from "@/lib/schemas/vera";
import {
    getVeraErrorDetail,
    parseVeraHttpResponse,
    VERA_RESPONSE_CONTRACT_ERROR,
} from "@/lib/utils/vera-response";
import type { z } from "zod";
import { ApiRequestError } from "./client";

const VERA_BASE = "/api/vera";
const VERA_STREAM_PREFIX = "/vera/sse/";

export type {
    VeraChatHistoryResponse,
    VeraChatHistoryTurn,
    VeraCurrentChatSessionResponse,
} from "@/lib/schemas/vera";

async function readVeraResponse<T>(
    response: Response,
    successSchema: z.ZodType<T>,
): Promise<T> {
    const parsed = await parseVeraHttpResponse(response, successSchema);

    if (!parsed.success) {
        throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
    }

    if (parsed.kind === "error") {
        throw new ApiRequestError(
            response.status,
            getVeraErrorDetail(parsed.data),
        );
    }

    return parsed.data;
}

function isStreamUrlForRequest(streamUrl: string, requestId: string): boolean {
    const encodedRequestId = streamUrl.slice(VERA_STREAM_PREFIX.length);
    if (!streamUrl.startsWith(VERA_STREAM_PREFIX) || encodedRequestId.includes("/")) {
        return false;
    }

    try {
        return decodeURIComponent(encodedRequestId) === requestId;
    } catch {
        return false;
    }
}

export const veraApi = {
    getCurrentSession: async (
        signal?: AbortSignal,
    ): Promise<VeraCurrentChatSessionResponse> => {
        const response = await fetch(`${VERA_BASE}/session/current`, {
            method: "GET",
            signal,
            cache: "no-store",
        });

        return readVeraResponse(
            response,
            veraCurrentChatSessionResponseSchema,
        );
    },

    sendMessage: async (
        data: VeraChatFormData,
    ): Promise<VeraChatResponse> => {
        const response = await fetch(`${VERA_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const receipt = await readVeraResponse(
            response,
            veraChatResponseSchema,
        );
        if (
            receipt.request_id !== data.request_id ||
            !isStreamUrlForRequest(receipt.stream_url, data.request_id)
        ) {
            throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
        }
        return receipt;
    },

    getHistory: async (
        sessionId: string,
        options: {
            beforeSequence?: number;
            signal?: AbortSignal;
        } = {},
    ): Promise<VeraChatHistoryResponse> => {
        const query = new URLSearchParams();
        if (options.beforeSequence !== undefined) {
            query.set("before_sequence", String(options.beforeSequence));
        }
        const suffix = query.size > 0 ? `?${query.toString()}` : "";
        const response = await fetch(
            `${VERA_BASE}/history/${encodeURIComponent(sessionId)}${suffix}`,
            {
                method: "GET",
                signal: options.signal,
                cache: "no-store",
            },
        );

        return readVeraResponse(response, veraChatHistoryResponseSchema);
    },

    sendFeedback: async (
        data: VeraFeedbackFormData,
    ): Promise<VeraFeedbackResponse> => {
        const response = await fetch(`${VERA_BASE}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        return readVeraResponse(response, veraFeedbackResponseSchema);
    },

    sendMessageFeedback: async (
        data: VeraMessageFeedbackFormData,
    ): Promise<VeraMessageFeedbackResponse> => {
        const response = await fetch(`${VERA_BASE}/feedback/message`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        return readVeraResponse(
            response,
            veraMessageFeedbackResponseSchema,
        );
    },
};
