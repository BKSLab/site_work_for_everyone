"use client";

import { useParams } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { VacancyDetail } from "@/components/features/vacancies/VacancyDetail";
import { useVacancyDetail } from "@/hooks/useVacancyDetail";
import { useAuthStore } from "@/stores/auth";
import { ServiceError } from "@/components/ui/ServiceError";

export default function VacancyDetailPage() {
    const params = useParams<{ id: string }>();
    const userId = useAuthStore((s) => s.user?.email);
    const { data, isLoading, isError } = useVacancyDetail(params.id, userId);

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

            {data && <VacancyDetail vacancy={data} />}
        </Container>
    );
}
