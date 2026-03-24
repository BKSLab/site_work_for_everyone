import { api } from "./client";
import type { VacancyAddFavorite, FavoriteVacanciesList } from "@/types/favorites";
import type { MessageResponse } from "@/types/api";
import type { Vacancy } from "@/types/vacancy";

export const favoritesApi = {
    getList: (userId: string, page: number = 1, pageSize: number = 10) =>
        api.get<FavoriteVacanciesList>("/favorites/list", {
            user_id: userId,
            page: String(page),
            page_size: String(pageSize),
        }),

    getById: (vacancyId: string, userId?: string) =>
        api.get<Vacancy>(`/favorites/${vacancyId}`, userId ? { user_id: userId } : undefined),

    add: (data: VacancyAddFavorite) =>
        api.post<MessageResponse>("/favorites/add-vacancy", data),

    remove: (data: VacancyAddFavorite) =>
        api.post<void>("/favorites/delete-vacancy", data),
};
