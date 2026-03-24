"use client";

import { useQuery } from "@tanstack/react-query";
import { vacanciesApi } from "@/lib/api";

export function useVacancyDetail(vacancyId: string, userId?: string) {
    return useQuery({
        queryKey: ["vacancy", vacancyId, userId ?? null],
        queryFn: () => vacanciesApi.getById(vacancyId, userId),
        enabled: !!vacancyId,
    });
}
