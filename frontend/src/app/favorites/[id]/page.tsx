"use client";

import { useParams } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { VacancyDetail } from "@/components/features/vacancies/VacancyDetail";
import { useFavoriteVacancyDetail } from "@/hooks/useFavoriteVacancyDetail";
import { useAuthStore } from "@/stores/auth";
import { ServiceError } from "@/components/ui/ServiceError";

export default function FavoriteVacancyDetailPage() {
    const params = useParams<{ id: string }>();
    const userId = useAuthStore((s) => s.user?.email);
    const { data, isLoading, isError } = useFavoriteVacancyDetail(params.id, userId);

    return (
        <Container className="py-12">
            {isLoading && (
                <p
                    role="status"
                    aria-live="polite"
                    className="text-sm text-muted"
                >
                    Загрузка вакансии…
                </p>
            )}

            {isError && !isLoading && (
                <ServiceError />
            )}

            {data && <VacancyDetail vacancy={{ ...data, is_favorite: true }} showAssistant />}
        </Container>
    );
}
