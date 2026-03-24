import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VacanciesInfo } from "@/types/vacancy";

interface SearchState {
    summary: VacanciesInfo | null;
    setSummary: (summary: VacanciesInfo | null) => void;
    clearSummary: () => void;
}

export const useSearchStore = create<SearchState>()(
    persist(
        (set) => ({
            summary: null,
            setSummary: (summary) => set({ summary }),
            clearSummary: () => set({ summary: null }),
        }),
        {
            name: "search-summary",
            storage: createJSONStorage(() => sessionStorage),
        }
    )
);
