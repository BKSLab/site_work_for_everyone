import { Container } from "@/components/layout/Container";
import { VacancyDetailSkeleton } from "@/components/features/vacancies/VacancyDetailSkeleton";

export default function VacancyDetailLoading() {
    return (
        <Container className="py-12">
            <VacancyDetailSkeleton />
        </Container>
    );
}
