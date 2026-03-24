export interface VacanciesSearchRequest {
    region_code: string;
    location: string;
}

export interface VacanciesInfo {
    all_vacancies_count: number;
    vacancies_count_tv: number;
    vacancies_count_hh: number;
    error_request_hh: boolean;
    error_request_tv: boolean;
    error_details_hh: string;
    error_details_tv: string;
    location: string;
    region_name: string;
}

// Единая схема вакансии (VacancySchema по API-документации).
// Используется в списке вакансий, детальной странице и избранном.
export interface Vacancy {
    vacancy_id: string;
    vacancy_name: string;
    location: string;
    vacancy_url: string;
    vacancy_source: string;
    status: string;
    description: string;
    salary: string;
    employer_name: string;
    employer_location: string;
    employer_phone: string;
    employer_code: string;
    employer_email: string;
    contact_person: string;
    employment: string;
    schedule: string;
    work_format: string;
    experience_required: string;
    requirements: string;
    category: string;
    social_protected: string;
    is_favorite: boolean;
}

// Алиасы для обратной совместимости
export type VacancyOut = Vacancy;
export type VacancyDetail = Vacancy;

export interface VacanciesList {
    total: number;
    page: number;
    page_size: number;
    vacancies_count_hh: number;
    vacancies_count_tv: number;
    items: Vacancy[];
}
