import { api } from "./client";
import type { Region, FederalDistrict } from "@/types/region";

export const regionsApi = {
    getAll: () =>
        api.get<Region[]>("/regions/list"),

    getByFederalDistrict: (code: string) =>
        api.get<Region[]>("/regions/by-federal-districts", { federal_district_code: code }),

    getFederalDistricts: () =>
        api.get<FederalDistrict[]>("/federal-districts/list"),
};
