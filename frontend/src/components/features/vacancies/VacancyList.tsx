import { VacancyCard } from "./VacancyCard";
import { Pagination } from "@/components/ui/Pagination";
import type { VacanciesList } from "@/types/vacancy";

interface VacancyListProps {
    data: VacanciesList;
    currentPage: number;
    onPageChange: (page: number) => void;
}

export function VacancyList({ data, currentPage, onPageChange }: VacancyListProps) {
    const totalPages = Math.ceil(data.total / data.page_size);

    if (data.items.length === 0) {
        return (
            <p className="py-16 text-center text-muted">Вакансии не найдены. Попробуйте изменить параметры поиска.</p>
        );
    }

    return (
        <div>
            <ul role="list" className="flex flex-col gap-3">
                {data.items.map((vacancy) => (
                    <li key={vacancy.vacancy_id}>
                        <VacancyCard vacancy={vacancy} />
                    </li>
                ))}
            </ul>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
            />
        </div>
    );
}
