import type {
    VeraChatFormData,
    VeraFeedbackFormData,
    VeraMessageFeedbackFormData,
} from "@/lib/schemas/vera";
import { ApiRequestError } from "./client";

const VERA_BASE = "/api/vera";

interface VeraMessageFeedbackResponse extends VeraMessageFeedbackFormData {
    id: string;
    review_status: string;
    created_at: string;
    updated_at: string;
}

interface VeraFeedbackResponse {
    id: string;
    session_id: string;
    submission_id: string;
    review_status: string;
    created_at: string;
}

export interface VeraChatHistoryTurn {
    request_id: string;
    sequence_number: number;
    question: string;
    answer: string | null;
    status: string;
    feedback_value: "up" | "down" | null;
    created_at: string;
    completed_at: string | null;
}

export interface VeraChatHistoryResponse {
    session_id: string;
    turns: VeraChatHistoryTurn[];
    next_before_sequence: number | null;
}

export interface VeraCurrentChatSessionResponse {
    session_id: string | null;
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

        const body = await response.json();

        if (!response.ok) {
            throw new ApiRequestError(
                response.status,
                body.detail ?? "Неизвестная ошибка",
            );
        }

        return body;
    },

    sendMessage: async (
        data: VeraChatFormData,
    ): Promise<{ status: string }> => {
        const response = await fetch(`${VERA_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const body = await response.json();

        if (!response.ok) {
            throw new ApiRequestError(
                response.status,
                body.detail ?? "Неизвестная ошибка",
            );
        }

        return body;
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

        const body = await response.json();

        if (!response.ok) {
            throw new ApiRequestError(
                response.status,
                body.detail ?? "Неизвестная ошибка",
            );
        }

        return body;
    },

    sendFeedback: async (
        data: VeraFeedbackFormData,
    ): Promise<VeraFeedbackResponse> => {
        const response = await fetch(`${VERA_BASE}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const body = await response.json();

        if (!response.ok) {
            throw new ApiRequestError(
                response.status,
                body.detail ?? "Неизвестная ошибка",
            );
        }

        return body;
    },

    sendMessageFeedback: async (
        data: VeraMessageFeedbackFormData,
    ): Promise<VeraMessageFeedbackResponse> => {
        const response = await fetch(`${VERA_BASE}/feedback/message`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const body = await response.json();

        if (!response.ok) {
            throw new ApiRequestError(
                response.status,
                body.detail ?? "Неизвестная ошибка",
            );
        }

        return body;
    },
};
