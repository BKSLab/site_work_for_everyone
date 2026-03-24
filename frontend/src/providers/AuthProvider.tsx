"use client";

import { useAuth } from "@/hooks/useAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    useAuth(); // Запускает гидратацию (GET /api/auth/me) при монтировании
    return <>{children}</>;
}
