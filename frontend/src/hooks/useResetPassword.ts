"use client";

import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import type { ResetPasswordRequest } from "@/types/auth";

export function useResetPassword() {
    return useMutation({
        mutationFn: (data: ResetPasswordRequest) =>
            authApi.resetPassword(data),
    });
}
