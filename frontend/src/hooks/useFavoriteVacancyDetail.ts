"use client";

import { useQuery } from "@tanstack/react-query";
import { favoritesApi } from "@/lib/api";

export function useFavoriteVacancyDetail(vacancyId: string, userId?: string) {
    return useQuery({
        queryKey: ["favorite-vacancy", vacancyId, userId ?? null],
        queryFn: () => favoritesApi.getById(vacancyId, userId),
        enabled: !!vacancyId,
    });
}
