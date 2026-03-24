"use client";

import { useFederalDistricts } from "@/hooks/useFederalDistricts";
import { useRegions } from "@/hooks/useRegions";

interface RegionSelectProps {
    federalDistrictCode: string;
    regionCode: string;
    onFederalDistrictChange: (code: string) => void;
    onRegionChange: (code: string) => void;
}

export function RegionSelect({
    federalDistrictCode,
    regionCode,
    onFederalDistrictChange,
    onRegionChange,
}: RegionSelectProps) {
    const { data: districts, isLoading: isLoadingDistricts } = useFederalDistricts();
    const { data: regions, isLoading: isLoadingRegions } = useRegions(
        federalDistrictCode || undefined
    );

    return (
        <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-lg font-medium text-foreground">
                Выбор региона
            </legend>

            <div className="flex flex-col gap-1">
                <label
                    htmlFor="federal-district"
                    className="text-sm font-medium text-foreground"
                >
                    Федеральный округ
                    <span className="ml-1 text-muted text-xs">(необязательно)</span>
                </label>
                <select
                    id="federal-district"
                    value={federalDistrictCode}
                    onChange={(e) => {
                        onFederalDistrictChange(e.target.value);
                        onRegionChange("");
                    }}
                    disabled={isLoadingDistricts}
                    className="rounded border border-border bg-surface px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                    <option value="">Все округа</option>
                    {districts?.map((d) => (
                        <option key={d.code} value={d.code}>
                            {d.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-1">
                <label
                    htmlFor="region"
                    className="text-sm font-medium text-foreground"
                >
                    Регион
                    <span aria-hidden="true" className="ml-1 text-accent">*</span>
                    <span className="sr-only"> (обязательное поле)</span>
                </label>
                <select
                    id="region"
                    value={regionCode}
                    onChange={(e) => onRegionChange(e.target.value)}
                    disabled={isLoadingRegions}
                    aria-required="true"
                    aria-invalid={regionCode === "" ? undefined : undefined}
                    className="rounded border border-border bg-surface px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                    <option value="">Выберите регион</option>
                    {regions?.map((r) => (
                        <option key={r.region_code} value={r.region_code}>
                            {r.name}
                        </option>
                    ))}
                </select>
            </div>
        </fieldset>
    );
}
