"use client";

import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import type { ResendCodeRequest } from "@/types/auth";

export function useResendCode() {
    return useMutation({
        mutationFn: (data: ResendCodeRequest) =>
            authApi.resendVerificationCode(data),
    });
}
