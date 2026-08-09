import { NextRequest } from "next/server";

import { createRateLimiter } from "@/lib/utils/rate-limit";
import { veraFeedbackSchema } from "@/lib/schemas/vera";
import { proxyVeraFeedback } from "@/lib/utils/vera-feedback-proxy";

const feedbackLimiter = createRateLimiter({
    interval: 60_000,
    limit: 10,
});

export async function POST(request: NextRequest) {
    return proxyVeraFeedback({
        request,
        method: "POST",
        backendPath: "/api/vera/feedback/session",
        schema: veraFeedbackSchema,
        limiter: feedbackLimiter,
    });
}
