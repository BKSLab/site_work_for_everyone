import { NextRequest } from "next/server";

import {
    veraMessageFeedbackResponseSchema,
    veraMessageFeedbackSchema,
} from "@/lib/schemas/vera";
import { createRateLimiter } from "@/lib/utils/rate-limit";
import { proxyVeraFeedback } from "@/lib/utils/vera-feedback-proxy";

const messageFeedbackLimiter = createRateLimiter({
    interval: 60_000,
    limit: 60,
});

export async function PUT(request: NextRequest) {
    return proxyVeraFeedback({
        request,
        method: "PUT",
        backendPath: "/api/vera/feedback/message",
        schema: veraMessageFeedbackSchema,
        responseSchema: veraMessageFeedbackResponseSchema,
        limiter: messageFeedbackLimiter,
    });
}
