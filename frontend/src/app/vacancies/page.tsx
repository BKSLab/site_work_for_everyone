import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/layout/Container";
import { VacanciesContent } from "./VacanciesContent";

export const metadata: Metadata = {
    title: "Результаты поиска",
};

export default function VacanciesPage() {
    return (
        <Suspense
            fallback={
                <Container className="py-12">
                    <p
                        role="status"
                        aria-live="polite"
                        className="text-sm text-muted"
                    >
                        Загрузка…
                    </p>
                </Container>
            }
        >
            <VacanciesContent />
        </Suspense>
    );
}
