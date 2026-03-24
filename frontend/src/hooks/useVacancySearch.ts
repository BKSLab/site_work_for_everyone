"use client";

import { useMutation } from "@tanstack/react-query";
import { vacanciesApi } from "@/lib/api";
import type { VacanciesSearchRequest } from "@/types/vacancy";

export function useVacancySearch() {
    return useMutation({
        mutationFn: (data: VacanciesSearchRequest) => vacanciesApi.search(data),
    });
}
