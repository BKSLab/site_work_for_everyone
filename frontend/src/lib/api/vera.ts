import type { VeraChatFormData } from "@/lib/schemas/vera";
import { ApiRequestError } from "./client";

const VERA_BASE = "/api/vera";

export const veraApi = {
    sendMessage: async (data: VeraChatFormData): Promise<{ status: string }> => {
        const response = await fetch(`${VERA_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const body = await response.json();

        if (!response.ok) {
            throw new ApiRequestError(response.status, body.detail ?? "Неизвестная ошибка");
        }

        return body;
    },
};
