"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { vacanciesApi } from "@/lib/api";

export function useVacancies(
    location: string,
    page: number,
    pageSize: number = 20,
    userId?: string,
    keyword?: string,
    source?: string,
) {
    return useQuery({
        queryKey: ["vacancies", location, page, pageSize, userId ?? null, keyword ?? null, source ?? null],
        queryFn: () => vacanciesApi.getList(location, page, pageSize, userId, keyword, source),
        enabled: !!location,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // Сохраняет предыдущие данные пока грузится новая страница/фильтр —
        // список не исчезает при пагинации и смене фильтров
        placeholderData: keepPreviousData,
    });
}
