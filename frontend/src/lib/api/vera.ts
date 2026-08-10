import {
    type VeraChatHistoryResponse,
    type VeraChatFormData,
    veraChatHistoryResponseSchema,
    type VeraChatResponse,
    veraChatResponseSchema,
    type VeraChatSessionLifecycleResponse,
    veraChatSessionLifecycleResponseSchema,
    type VeraChatSessionCreateFormData,
    type VeraChatSessionCreateResponse,
    veraChatSessionCreateResponseSchema,
    type VeraChatSessionCloseResponse,
    veraChatSessionCloseResponseSchema,
    type VeraChatSessionResolveFormData,
    type VeraChatSessionResolveResponse,
    veraChatSessionResolveResponseSchema,
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
    VeraChatSessionLifecycleResponse,
    VeraChatSessionCreateResponse,
    VeraChatSessionCloseResponse,
    VeraChatSessionResolveResponse,
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
        const lifecycle = veraChatSessionLifecycleResponseSchema.safeParse(
            parsed.data,
        );
        throw new ApiRequestError(
            response.status,
            getVeraErrorDetail(parsed.data),
            {
                publishState: parsed.data.publish_state,
                lifecycle: lifecycle.success ? lifecycle.data : undefined,
            },
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

function isLifecycleBoundToRequest(
    lifecycle: VeraChatSessionLifecycleResponse,
    sessionId: string,
    replacementSessionId: string,
): boolean {
    if (lifecycle.boundary === "expired") {
        return (
            lifecycle.session_id === replacementSessionId &&
            lifecycle.previous_session_id === sessionId
        );
    }

    return (
        lifecycle.session_id === sessionId &&
        lifecycle.previous_session_id === null
    );
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

    resolveSession: async (
        data: VeraChatSessionResolveFormData,
        signal?: AbortSignal,
    ): Promise<VeraChatSessionResolveResponse> => {
        const response = await fetch(`${VERA_BASE}/session/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            signal,
        });
        let resolution: VeraChatSessionResolveResponse;
        try {
            resolution = await readVeraResponse(
                response,
                veraChatSessionResolveResponseSchema,
            );
        } catch (error) {
            if (
                error instanceof ApiRequestError &&
                error.lifecycle &&
                !isLifecycleBoundToRequest(
                    error.lifecycle,
                    data.session_id,
                    data.replacement_session_id,
                )
            ) {
                throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
            }
            throw error;
        }
        if (
            !isLifecycleBoundToRequest(
                resolution,
                data.session_id,
                data.replacement_session_id,
            )
        ) {
            throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
        }
        return resolution;
    },

    createSession: async (
        data: VeraChatSessionCreateFormData,
        signal?: AbortSignal,
    ): Promise<VeraChatSessionCreateResponse> => {
        const response = await fetch(`${VERA_BASE}/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            signal,
        });
        const created = await readVeraResponse(
            response,
            veraChatSessionCreateResponseSchema,
        );
        if (created.session_id !== data.session_id) {
            throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
        }
        return created;
    },

    closeSession: async (
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<VeraChatSessionCloseResponse> => {
        const response = await fetch(
            `${VERA_BASE}/session/${encodeURIComponent(sessionId)}/close`,
            {
                method: "POST",
                signal,
            },
        );
        const closed = await readVeraResponse(
            response,
            veraChatSessionCloseResponseSchema,
        );
        if (closed.session_id !== sessionId) {
            throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
        }
        return closed;
    },

    sendMessage: async (
        data: VeraChatFormData,
        signal?: AbortSignal,
    ): Promise<VeraChatResponse> => {
        const response = await fetch(`${VERA_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            signal,
        });

        let receipt: VeraChatResponse;
        try {
            receipt = await readVeraResponse(
                response,
                veraChatResponseSchema,
            );
        } catch (error) {
            if (
                error instanceof ApiRequestError &&
                error.lifecycle &&
                !isLifecycleBoundToRequest(
                    error.lifecycle,
                    data.session_id,
                    data.request_id,
                )
            ) {
                throw new ApiRequestError(502, VERA_RESPONSE_CONTRACT_ERROR);
            }
            throw error;
        }
        if (
            receipt.request_id !== data.request_id ||
            !isStreamUrlForRequest(receipt.stream_url, data.request_id) ||
            !isLifecycleBoundToRequest(
                receipt,
                data.session_id,
                data.request_id,
            )
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
