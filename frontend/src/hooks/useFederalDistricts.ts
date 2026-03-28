"use client";

import { useQuery } from "@tanstack/react-query";
import { regionsApi } from "@/lib/api";

export function useFederalDistricts() {
    return useQuery({
        queryKey: ["federalDistricts"],
        queryFn: () => regionsApi.getFederalDistricts(),
        staleTime: 24 * 60 * 60 * 1000, // 24 часа
    });
}
