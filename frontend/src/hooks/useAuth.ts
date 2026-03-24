"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/lib/api/auth";

export function useAuth() {
    const { user, isAuthenticated, isLoading, setUser, reset } =
        useAuthStore();

    useEffect(() => {
        let cancelled = false;

        async function hydrate() {
            try {
                const data = await authApi.me();
                if (!cancelled) {
                    setUser(data.user);
                }
            } catch {
                if (!cancelled) {
                    reset();
                }
            }
        }

        if (isLoading) {
            hydrate();
        }

        return () => {
            cancelled = true;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return { user, isAuthenticated, isLoading };
}
