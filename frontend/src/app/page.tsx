import type { Metadata } from "next";
import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { SearchForm } from "@/components/features/search/SearchForm";
import { FeatureCards } from "@/components/features/home/FeatureCards";
import { BlogPreview } from "@/components/features/blog/BlogPreview";

export const metadata: Metadata = {
    title: "Поиск вакансий",
};

export default function HomePage() {
    return (
        <Container className="py-12">
            {/* ── Hero ─────────────────────────────────────────────── */}
            <section aria-label="О сервисе">
                <div className="relative flex flex-col items-center text-center">
                    {/* Атмосферное свечение за логотипом */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-8 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
                    />

                    {/* Логотип */}
                    <div className="relative mb-8">
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 scale-150 rounded-full bg-accent/25 blur-2xl"
                        />
                        <Image
                            src="/logo.jpg"
                            alt=""
                            aria-hidden="true"
                            width={160}
                            height={160}
                            className="relative rounded-full border-2 border-accent/60 shadow-[0_0_48px_rgba(245,184,0,0.35)]"
                            priority
                        />
                    </div>

                    <h1
                        className="text-4xl font-black leading-tight text-foreground sm:text-5xl"
                        tabIndex={-1}
                    >
                        Поиск вакансий{" "}
                        <span className="text-accent">
                            для людей с инвалидностью
                        </span>
                    </h1>
                    <p className="mt-4 max-w-lg text-lg text-muted">
                        Агрегируем вакансии с&nbsp;hh.ru и&nbsp;Работы России
                        в&nbsp;едином доступном интерфейсе
                    </p>
                </div>
            </section>

            {/* ── Форма поиска ─────────────────────────────────────── */}
            <section
                aria-label="Форма поиска вакансий"
                className="mt-12"
            >
                <div className="mx-auto max-w-4xl rounded-2xl border border-white/20 bg-surface bg-[radial-gradient(ellipse_at_top,rgba(245,184,0,0.05),transparent_60%)] p-8 shadow-[0_1px_1px_rgba(255,255,255,0.05)_inset]">
                    <SearchForm />
                </div>
            </section>

            {/* ── Возможности сервиса ──────────────────────────────── */}
            <section
                aria-labelledby="features-heading"
                className="mt-20"
            >
                <h2
                    id="features-heading"
                    className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted"
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
