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
            session_id: "session-1",
            previous_session_id: null,
            boundary: "retained",
            session_ttl_seconds: 86_400,
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
            session_id: "session-1",
            boundary: "retained",
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

    it("accepts an expired boundary bound to the request replacement id", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        request_id: "request-1",
                        stream_ticket: "signed.ticket",
                        stream_url: "/vera/sse/request-1",
                        session_id: "request-1",
                        previous_session_id: "session-1",
                        boundary: "expired",
                        session_ttl_seconds: 86_400,
                    },
                    { status: 202 },
                ),
            ),
        );

        await expect(veraApi.sendMessage(request)).resolves.toMatchObject({
            session_id: "request-1",
            previous_session_id: "session-1",
            boundary: "expired",
        });
    });

    it("exposes a bound not-published lifecycle on ApiRequestError", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        detail: "Ticket не выпущен.",
                        publish_state: "not_published",
                        session_id: "session-1",
                        previous_session_id: null,
                        boundary: "retained",
                        session_ttl_seconds: 86_400,
                    },
                    { status: 503 },
                ),
            ),
        );

        await expect(veraApi.sendMessage(request)).rejects.toMatchObject({
            status: 503,
            publishState: "not_published",
            lifecycle: {
                session_id: "session-1",
                boundary: "retained",
            },
        });
    });
});

describe("veraApi.resolveSession", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns the server-selected replacement after expiry", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            Response.json({
                session_id: "session-2",
                previous_session_id: "session-1",
                boundary: "expired",
                session_ttl_seconds: 86_400,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            veraApi.resolveSession({
                session_id: "session-1",
                replacement_session_id: "session-2",
            }),
        ).resolves.toMatchObject({
            session_id: "session-2",
            boundary: "expired",
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/vera/session/resolve",
            expect.objectContaining({
                body: JSON.stringify({
                    session_id: "session-1",
                    replacement_session_id: "session-2",
                }),
            }),
        );
    });

    it("rejects a lifecycle response not bound to either candidate", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json({
                    session_id: "forged-session",
                    previous_session_id: "session-1",
                    boundary: "expired",
                    session_ttl_seconds: 86_400,
                }),
            ),
        );

        await expect(
            veraApi.resolveSession({
                session_id: "session-1",
                replacement_session_id: "session-2",
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});
