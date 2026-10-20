"use client";

import { useState, useRef, type FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RegionCombobox } from "./RegionCombobox";
import { LocationInput } from "./LocationInput";
import { useVacancySearch } from "@/hooks/useVacancySearch";
import { SearchModal } from "./SearchModal";
import { useSearchStore } from "@/stores/search";
import { searchSchema } from "@/lib/schemas/search";
import { zodFieldErrors } from "@/lib/utils/validation";
import { Button } from "@/components/ui/Button";
import styles from "./SearchForm.module.css";

export function SearchForm() {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
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
            setTimeout(() => {
                const firstError = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
                firstError?.focus();
            }, 0);
            return;
        }

        setErrors({});
        searchMutation.mutate({ location: trimmed, region_code: regionCode });
        setIsModalOpen(true);
    }

    return (
        <div>
            <form
                ref={formRef}
                role="search"
                onSubmit={handleSubmit}
                className={styles.form}
            >
                <div className={styles.field}>
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

                <div className={styles.field}>
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

                <div className="flex flex-col gap-1 md:gap-0">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={searchMutation.isPending}
                        className={styles.submit}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="10.5" cy="10.5" r="6.5" />
                            <path d="m16 16 4.5 4.5" />
                        </svg>
                        Найти вакансии
                    </Button>
                    <span className="hidden md:block min-h-[1.25rem]" aria-hidden="true" />
                </div>
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
