import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VacanciesContent } from "@/app/vacancies/VacanciesContent";

const state = vi.hoisted(() => ({
    params: new URLSearchParams("location=Самара"),
    query: { data: { total: 20, page: 1, page_size: 10, items: Array.from({ length: 10 }, (_, index) => ({ vacancy_id: String(index) })), vacancies_count_hh: 20, vacancies_count_tv: 0 }, isFetching: false, isPlaceholderData: false, isError: false },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => state.params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useVacancies", () => ({ useVacancies: () => state.query }));
vi.mock("@/components/features/vacancies/VacancyList", () => ({ VacancyList: () => <div>Список</div> }));
vi.mock("@/components/features/vacancies/VacancyFilters", () => ({ VacancyFilters: () => null }));
vi.mock("@/components/features/vera/VeraChatBanner", () => ({ VeraChatBanner: () => null }));

describe("search result announcements", () => {
    beforeEach(() => {
        sessionStorage.clear();
        state.params = new URLSearchParams("location=Самара");
        state.query.isFetching = false;
        state.query.isPlaceholderData = false;
        state.query.isError = false;
        state.query.data = { total: 20, page: 1, page_size: 10, items: Array.from({ length: 10 }, (_, index) => ({ vacancy_id: String(index) })), vacancies_count_hh: 20, vacancies_count_tv: 0 };
    });

    it("uses one persistent status for the current filter and page, excluding placeholder counts", () => {
        const { rerender } = render(<VacanciesContent />);
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("Найдено вакансий: 20. Самара. Все источники. Страница 1, вакансии 1–10.");
        state.params = new URLSearchParams("location=Самара&keyword=врач&source=hh.ru&page=2");
        state.query.isPlaceholderData = true;
        state.query.isFetching = true;
        rerender(<VacanciesContent />);
        expect(status).toBeEmptyDOMElement();
        state.query.isPlaceholderData = false;
        state.query.isFetching = false;
        state.query.data = { ...state.query.data, total: 15, page: 2, items: state.query.data.items.slice(0, 5) };
        rerender(<VacanciesContent />);
        expect(screen.getByRole("status")).toBe(status);
        expect(status).toHaveTextContent("Ключевое слово: врач. Источник: hh.ru. Страница 2, вакансии 11–15.");
        expect(status.closest("[aria-busy]" )).toBeNull();
        state.query.isFetching = true;
        rerender(<VacanciesContent />);
        expect(status).toHaveTextContent("Найдено вакансий: 15");
    });

    it("distinguishes an actual empty result from an error", () => {
        state.query.data = { ...state.query.data, total: 0, items: [] };
        const { rerender } = render(<VacanciesContent />);
        expect(screen.getByRole("status")).toHaveTextContent("Найдено вакансий: 0");
        state.query.isError = true;
        rerender(<VacanciesContent />);
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
        expect(screen.getByRole("alert")).toHaveTextContent("Сервис временно недоступен");
    });
});
