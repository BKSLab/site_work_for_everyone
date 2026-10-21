import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Вакансия",
};

export default function VacancyDetailLayout({ children }: { children: React.ReactNode }) {
    return children;
}
