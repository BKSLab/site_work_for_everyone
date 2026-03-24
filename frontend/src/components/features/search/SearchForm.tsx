"use client";

import { useState, type FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RegionCombobox } from "./RegionCombobox";
import { LocationInput } from "./LocationInput";
import { useVacancySearch } from "@/hooks/useVacancySearch";
import { SearchModal } from "./SearchModal";
import { useSearchStore } from "@/stores/search";
import { searchSchema } from "@/lib/schemas/search";
import { zodFieldErrors } from "@/lib/utils/validation";

export function SearchForm() {
    const router = useRouter();
    const [regionCode, setRegionCode] = useState("");
    const [location, setLocation] = useState("");
    const [errors, setErrors] = useState<{ region?: string; location?: string }>({});
    const [isModalOpen, setIsModalOpen] = useState(false);

    const searchMutation = useVacancySearch();
    const { setSummary, clearSummary } = useSearchStore();

    useEffect(() => {
        if (searchMutation.isSuccess) {
            setSummary(searchMutation.data);

            const params = new URLSearchParams({
                location: searchMutation.data.location,
                region_code: regionCode,
            });
            router.push(`/vacancies?${params.toString()}`);
        }
    }, [searchMutation.isSuccess, searchMutation.data, router, regionCode, setSummary]);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();

        // Clear previous summary before starting a new search
        clearSummary();

        const trimmed = location.trim();
        const result = searchSchema.safeParse({ region_code: regionCode, location: trimmed });
        if (!result.success) {
            const fieldErrors = zodFieldErrors(result.error);
            setErrors({
                region: fieldErrors.region_code,
                location: fieldErrors.location,
            });
            return;
        }

        setErrors({});
        searchMutation.mutate({ location: trimmed, region_code: regionCode });
        setIsModalOpen(true);
    }

    return (
        <div className="rounded-lg border border-white/20 bg-surface bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_35%)] p-8">
            <form
                role="search"
                onSubmit={handleSubmit}
                className="flex flex-col gap-4 md:flex-row md:items-end md:gap-3"
            >
                <div className="flex-1">
                    <RegionCombobox
                        regionCode={regionCode}
                        onRegionChange={(code) => {
                            setRegionCode(code);
                            if (errors.region)
                                setErrors((prev) => ({ ...prev, region: undefined }));
                        }}
                        error={errors.region}
                    />
                </div>

                <div className="flex-1">
                    <LocationInput
                        value={location}
                        onChange={(val) => {
                            setLocation(val);
                            if (errors.location)
                                setErrors((prev) => ({ ...prev, location: undefined }));
                        }}
                        error={errors.location}
                    />
                </div>

                <button
                    type="submit"
                    disabled={searchMutation.isPending}
                    className="w-full rounded border border-accent/50 bg-white/10 px-6 py-2 text-lg font-semibold text-accent hover:border-accent hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:w-fit disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Найти
                </button>
            </form>

            <SearchModal
                isOpen={isModalOpen}
                isPending={searchMutation.isPending}
                isError={searchMutation.isError}
                isSuccess={searchMutation.isSuccess}
                onClose={() => {
                    setIsModalOpen(false);
                    // Reset mutation state if modal is closed manually after an error
                    if (searchMutation.isError) {
                        searchMutation.reset();
                    }
                }}
            />
        </div>
    );
}
