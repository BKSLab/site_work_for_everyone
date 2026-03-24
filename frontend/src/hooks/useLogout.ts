"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/auth";

export function useLogout() {
    const reset = useAuthStore((s) => s.reset);
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => authApi.logout(),
        onSuccess: () => {
            reset();
            queryClient.clear(); // Очищаем весь кеш запросов при выходе
        },
    });
}
