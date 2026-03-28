"use client";

import { useQuery } from "@tanstack/react-query";
import { regionsApi } from "@/lib/api";

export function useRegions(federalDistrictCode?: string) {
    return useQuery({
        queryKey: ["regions", federalDistrictCode ?? "all"],
        queryFn: () =>
            federalDistrictCode
                ? regionsApi.getByFederalDistrict(federalDistrictCode)
                : regionsApi.getAll(),
        staleTime: 24 * 60 * 60 * 1000, // 24 часа
    });
}
