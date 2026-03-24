import type { VacancyDetail } from "./vacancy";

export interface VacancyAddFavorite {
    user_id: string;
    vacancy_id: string;
}

export interface FavoriteVacanciesList {
    total: number;
    page: number;
    page_size: number;
    items: VacancyDetail[];
}
