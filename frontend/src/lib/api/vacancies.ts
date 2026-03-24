import { api } from "./client";
import type { VacanciesSearchRequest, VacanciesInfo, VacanciesList, VacancyDetail } from "@/types/vacancy";

export const vacanciesApi = {
    search: (data: VacanciesSearchRequest) =>
        api.post<VacanciesInfo>("/vacancies/search", data),

    getList: (
        location: string,
        page: number = 1,
        pageSize: number = 20,
        userId?: string,
        keyword?: string,
        source?: string,
    ) =>
        api.get<VacanciesList>("/vacancies/list", {
            location,
            page: String(page),
            page_size: String(pageSize),
            ...(userId && { user_id: userId }),
            ...(keyword && { keyword }),
            ...(source && { source }),
        }),

    getById: (vacancyId: string, userId?: string) =>
        api.get<VacancyDetail>(`/vacancies/${vacancyId}`, userId ? { user_id: userId } : {}),
};
