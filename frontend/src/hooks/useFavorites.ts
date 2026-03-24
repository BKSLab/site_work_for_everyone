"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { favoritesApi } from "@/lib/api";

export function useFavorites(userId: string, page: number = 1, pageSize: number = 10) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["favorites", userId, page, pageSize],
        queryFn: () => favoritesApi.getList(userId, page, pageSize),
        enabled: !!userId,
        refetchOnMount: "always", // всегда свежие данные при переходе на страницу
    });

    const addMutation = useMutation({
        mutationFn: (vacancyId: string) =>
            favoritesApi.add({ user_id: userId, vacancy_id: vacancyId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["favorites", userId] });
        },
    });

    const removeMutation = useMutation({
        mutationFn: (vacancyId: string) =>
            favoritesApi.remove({ user_id: userId, vacancy_id: vacancyId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["favorites", userId] });
        },
    });

    return { query, addMutation, removeMutation };
}
