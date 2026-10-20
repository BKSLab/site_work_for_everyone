import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { SearchHero } from "@/components/features/home/SearchHero";
import { FeatureCards } from "@/components/features/home/FeatureCards";
import { BlogPreview } from "@/components/features/blog/BlogPreview";
import { VeraChatBanner } from "@/components/features/vera/VeraChatBanner";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
    title: "Поиск вакансий",
    description: "Находите вакансии из hh.ru и Работы России в едином доступном интерфейсе для людей с инвалидностью.",
    alternates: { canonical: "/" },
    openGraph: {
        title: "Поиск вакансий для людей с инвалидностью — Работа для всех",
        description: "Находите вакансии из hh.ru и Работы России в едином доступном интерфейсе для людей с инвалидностью.",
        url: "/",
    },
};

const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Работа для всех",
    url: "https://work-for-everyone.ru",
    description: "Сервис поиска вакансий для людей с инвалидностью",
};

export default function HomePage() {
    return (
        <Container className="py-12">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <SearchHero />

            {/* ── Ассистент Вера: консультация по трудовым вопросам ── */}
            <div className="mx-auto max-w-4xl">
                <VeraChatBanner />
            </div>

            {/* ── Возможности сервиса ──────────────────────────────── */}
            <section
                aria-labelledby="features-heading"
                className="mt-20"
            >
                <SectionHeading
                    id="features-heading"
                    className="mb-8"
                    icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3.5" />
                            <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)" />
                            <circle cx="19" cy="5" r="1.3" fill="currentColor" stroke="none" />
                        </svg>
                    }
                >
                    Возможности сервиса
                </SectionHeading>
                <FeatureCards />
            </section>

            {/* ── Полезные материалы ───────────────────────────────── */}
            <section aria-labelledby="blog-heading" className="mt-24">
                <BlogPreview />
            </section>
        </Container>
    );
}
