"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { favoritesApi } from "@/lib/api";
import { ApiRequestError } from "@/lib/api/client";
import {
    setPendingFavorite,
    getPendingFavorite,
    clearPendingFavorite,
} from "@/lib/utils/pendingFavorite";

export function useFavoriteToggle(vacancyId: string, initialState: boolean) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const user = useAuthStore((s) => s.user);
    const [isFavorite, setIsFavorite] = useState(initialState);
    const [isFavoritePending, setIsFavoritePending] = useState(false);
    const [favoriteError, setFavoriteError] = useState<string | null>(null);

    // После логина — автоматически выполняем отложенное действие «добавить в избранное»
    useEffect(() => {
        if (!user) return;
        if (getPendingFavorite() !== vacancyId) return;

        clearPendingFavorite();
        setIsFavoritePending(true);
        setFavoriteError(null);

        favoritesApi
            .add({ user_id: user.email, vacancy_id: vacancyId })
            .then(() => setIsFavorite(true))
            .catch((err) => {
                if (err instanceof ApiRequestError && err.status === 409) {
                    setIsFavorite(true); // уже в избранном — окей
                } else {
                    setFavoriteError("Не удалось добавить в избранное");
                }
            })
            .finally(() => setIsFavoritePending(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    async function handleFavoriteClick() {
        if (!user) {
            setPendingFavorite(vacancyId);
            const params = searchParams.toString();
            const currentUrl = pathname + (params ? `?${params}` : "");
            router.push(`/auth/login?redirect=${encodeURIComponent(currentUrl)}`);
            return;
        }

        const previous = isFavorite;

        // Оптимистичное обновление — UI меняется сразу
        setIsFavorite(!isFavorite);
        setIsFavoritePending(true);
        setFavoriteError(null);

        try {
            if (previous) {
                await favoritesApi.remove({ user_id: user.email, vacancy_id: vacancyId });
            } else {
                await favoritesApi.add({ user_id: user.email, vacancy_id: vacancyId });
            }
        } catch (err) {
            setIsFavorite(previous);
            if (err instanceof ApiRequestError && err.status === 409) {
                setIsFavorite(true);
                setFavoriteError("Вакансия уже в избранном");
            } else {
                setFavoriteError("Не удалось обновить избранное");
            }
        } finally {
            setIsFavoritePending(false);
        }
    }

    return { isFavorite, isFavoritePending, favoriteError, handleFavoriteClick };
}
