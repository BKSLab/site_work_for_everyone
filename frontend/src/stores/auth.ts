import { create } from "zustand";
import type { AuthUser } from "@/types/auth";

interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    setUser: (user: AuthUser | null) => void;
    setLoading: (loading: boolean) => void;
    reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true, // true по умолчанию — пока не проверим /api/auth/me
    setUser: (user) =>
        set({
            user,
            isAuthenticated: user !== null,
            isLoading: false,
        }),
    setLoading: (isLoading) => set({ isLoading }),
    reset: () =>
        set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
        }),
}));
