"use client";

import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/auth";
import type { VerifyEmailRequest } from "@/types/auth";

export function useVerifyEmail() {
    const setUser = useAuthStore((s) => s.setUser);

    return useMutation({
        mutationFn: (data: VerifyEmailRequest) => authApi.verifyEmail(data),
        onSuccess: (response) => {
            setUser(response.user);
        },
    });
}
