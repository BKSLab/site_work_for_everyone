"use client";

import { useQuery } from "@tanstack/react-query";
import { regionsApi } from "@/lib/api";

export function useFederalDistricts() {
    return useQuery({
        queryKey: ["federalDistricts"],
        queryFn: () => regionsApi.getFederalDistricts(),
        staleTime: Infinity,
    });
}
