import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { BlogCard } from "@/components/features/blog/BlogCard";
import { getAllPosts } from "@/lib/blog/posts";

export const metadata: Metadata = {
    title: "Блог — советы по трудоустройству для людей с инвалидностью",
    description:
        "Полезные статьи о поиске работы, правах сотрудников с ОВЗ, составлении резюме и подготовке к собеседованию.",
};

const ALL_TAGS = ["Все", "Трудоустройство", "Удалёнка", "Резюме", "Права", "Карьера", "Собеседование"];

export default function BlogPage() {
    const posts = getAllPosts();

    return (
        <Container className="py-12">
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section aria-label="Блог">
                <div className="relative mb-12 flex flex-col items-center text-center">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-8 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/8 blur-3xl"
                    />
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent/70">
                        Блог
                    </p>
                    <h1 className="text-4xl font-black leading-tight text-foreground sm:text-5xl">
                        Советы и&nbsp;статьи{" "}
                        <span className="text-accent">для соискателей</span>
                    </h1>
                    <p className="mt-4 max-w-lg text-lg text-muted">
                        Практические материалы о&nbsp;поиске работы, правах
                        и&nbsp;карьере для людей с&nbsp;инвалидностью
                    </p>
                </div>
            </section>

            {/* ── Теги-фильтры (визуальные, без логики пока) ───────────── */}
            <section aria-label="Фильтр по темам" className="mb-10">
                <div className="flex flex-wrap gap-2">
                    {ALL_TAGS.map((tag, i) => (
                        <span
                            key={tag}
                            className={[
                                "rounded-full border px-3.5 py-1 text-xs font-medium transition-colors",
                                i === 0
                                    ? "border-accent/50 bg-accent/10 text-accent"
                                    : "border-white/12 bg-white/[0.04] text-muted hover:border-white/25 hover:text-foreground cursor-pointer",
                            ].join(" ")}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </section>

            {/* ── Сетка статей ─────────────────────────────────────────── */}
            <section aria-label="Статьи блога">
                <ul
                    role="list"
                    className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
                >
                    {posts.map((post) => (
                        <li key={post.slug}>
                            <BlogCard post={post} />
                        </li>
                    ))}
                </ul>
            </section>
        </Container>
    );
}
