import { afterEach, describe, expect, it, vi } from "vitest";

import { veraApi } from "../vera";

const request = {
    session_id: "session-1",
    request_id: "request-1",
    message: "Вопрос",
};

function receiptResponse(requestId: string, streamRequestId = requestId): Response {
    return Response.json(
        {
            request_id: requestId,
            stream_ticket: "signed.ticket",
            stream_url: `/vera/sse/${streamRequestId}`,
        },
        { status: 202 },
    );
}

describe("veraApi.sendMessage", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns the receipt bound to the published request", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(receiptResponse("request-1")),
        );

        await expect(veraApi.sendMessage(request)).resolves.toMatchObject({
            request_id: "request-1",
            stream_ticket: "signed.ticket",
            stream_url: "/vera/sse/request-1",
        });
    });

    it("forwards the caller abort signal to the chat POST", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(receiptResponse("request-1"));
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();

        await veraApi.sendMessage(request, controller.signal);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/vera/chat",
            expect.objectContaining({ signal: controller.signal }),
        );
    });

    it("rejects a receipt for another request as a contract error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(receiptResponse("request-2")),
        );

        await expect(veraApi.sendMessage(request)).rejects.toMatchObject({
            status: 502,
        });
    });

    it("rejects a stream URL bound to another request", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                receiptResponse("request-1", "request-2"),
            ),
        );

        await expect(veraApi.sendMessage(request)).rejects.toMatchObject({
            status: 502,
        });
    });
});
