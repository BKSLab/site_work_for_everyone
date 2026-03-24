"use client";

import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import type { ForgotPasswordRequest } from "@/types/auth";

export function useForgotPassword() {
    return useMutation({
        mutationFn: (data: ForgotPasswordRequest) =>
            authApi.forgotPassword(data),
    });
}
