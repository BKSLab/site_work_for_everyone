import { describe, expect, it } from "vitest";

import {
    veraChatResponseSchema,
    veraCurrentChatSessionResponseSchema,
} from "@/lib/schemas/vera";
import {
    getVeraErrorDetail,
    parseVeraHttpResponse,
    parseVeraJsonResponse,
} from "../vera-response";

function response(
    body: string,
    contentType = "application/json; charset=utf-8",
    status = 200,
): Response {
    return new Response(body, {
        status,
        headers: { "Content-Type": contentType },
    });
}

const chatReceipt = {
    request_id: "request-1",
    stream_ticket: "signed.ticket",
    stream_url: "/vera/sse/request-1",
};

describe("parseVeraJsonResponse", () => {
    it("parses JSON only after validating its schema", async () => {
        const result = await parseVeraJsonResponse(
            response(JSON.stringify(chatReceipt)),
            veraChatResponseSchema,
        );

        expect(result).toEqual({
            success: true,
            data: chatReceipt,
        });
    });

    it.each([
        ["an empty body", "", "application/json"],
        ["a malformed JSON body", "{", "application/json"],
        ["a non-JSON content type", "<html />", "text/html"],
        [
            "a schema mismatch",
            JSON.stringify({ status: "completed" }),
            "application/json",
        ],
    ])("rejects %s without throwing", async (_name, body, contentType) => {
        await expect(
            parseVeraJsonResponse(
                response(body, contentType),
                veraChatResponseSchema,
            ),
        ).resolves.toEqual({ success: false });
    });

    it("accepts structured JSON media types", async () => {
        const result = await parseVeraJsonResponse(
            response(
                JSON.stringify({ session_id: null }),
                "application/problem+json",
            ),
            veraCurrentChatSessionResponseSchema,
        );

        expect(result.success).toBe(true);
    });
});

describe("parseVeraHttpResponse", () => {
    it("validates an HTTP error variant and exposes a controlled detail", async () => {
        const result = await parseVeraHttpResponse(
            response(
                JSON.stringify({
                    detail: [
                        {
                            loc: ["body", "message"],
                            msg: "Field required",
                            type: "missing",
                        },
                    ],
                }),
                "application/json",
                422,
            ),
            veraChatResponseSchema,
        );

        expect(result.success).toBe(true);
        if (result.success && result.kind === "error") {
            expect(getVeraErrorDetail(result.data)).toBe("Field required");
        }
    });

    it("rejects a success body returned with an error status", async () => {
        const result = await parseVeraHttpResponse(
            response(
                JSON.stringify(chatReceipt),
                "application/json",
                503,
            ),
            veraChatResponseSchema,
        );

        expect(result).toEqual({ success: false });
    });
});
