import type { Metadata } from "next";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { SearchForm } from "@/components/features/search/SearchForm";
import { FeatureCards } from "@/components/features/home/FeatureCards";
import { BlogPreview } from "@/components/features/blog/BlogPreview";
import { FocusHeading } from "@/components/ui/FocusHeading";

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
            {/* ── Hero ─────────────────────────────────────────────── */}
            <div className="flex flex-col items-center gap-8 pb-10 text-center">

                {/* Логотип */}
                <Image
                    src="/logo.png"
                    alt=""
                    aria-hidden="true"
                    width={144}
                    height={144}
                    className="mx-auto block rounded-full border-2 border-accent/60 shadow-[0_0_40px_rgba(245,184,0,0.32)]"
                    priority
                />

                {/* Текст */}
                <div className="flex flex-col gap-6">
                    <FocusHeading className="text-3xl font-black leading-tight text-foreground sm:text-4xl">
                        Поиск вакансий для людей с инвалидностью
                    </FocusHeading>
                    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-lg text-foreground/70">
                        Агрегируем вакансии из&nbsp;
                        <span className="inline-flex items-center gap-1.5 rounded border border-accent/50 bg-white/10 px-2.5 py-1 text-sm font-semibold text-accent">
                            <Image src="/hh.ru.png" alt="" width={16} height={16} className="rounded-sm" />
                            hh.ru
                        </span>
                        &nbsp;и&nbsp;
                        <span className="inline-flex items-center gap-1.5 rounded border border-accent/50 bg-white/10 px-2.5 py-1 text-sm font-semibold text-accent">
                            <Image src="/trudvsem.ru.png" alt="" width={16} height={16} className="rounded-sm" />
                            Работа России
                        </span>
                        &nbsp;в едином доступном интерфейсе
                    </p>
                </div>

            </div>

            {/* ── Форма поиска ─────────────────────────────────────── */}
            <div className="mt-4">
                <div className="mx-auto max-w-4xl rounded-2xl border border-white/20 bg-surface bg-[radial-gradient(ellipse_at_top,rgba(245,184,0,0.05),transparent_60%)] p-8 shadow-[0_1px_1px_rgba(255,255,255,0.05)_inset]">
                    <SearchForm />
                </div>
            </div>

            {/* ── Возможности сервиса ──────────────────────────────── */}
            <section
                aria-labelledby="features-heading"
                className="mt-20"
            >
                <h2
                    id="features-heading"
                    className="mb-8 text-center text-2xl font-black text-foreground"
                >
                    Возможности сервиса
                </h2>
                <FeatureCards />
            </section>

            {/* ── Блог ─────────────────────────────────────────────── */}
            <section aria-labelledby="blog-heading" className="mt-24">
                <BlogPreview />
            </section>
        </Container>
    );
}
