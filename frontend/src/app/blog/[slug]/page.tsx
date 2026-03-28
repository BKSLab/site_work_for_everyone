import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import DOMPurify from "isomorphic-dompurify";
import { Container } from "@/components/layout/Container";
import { getAllSlugs, getPostBySlug } from "@/lib/blog/posts";

// Статическая генерация всех страниц статей при билде
export async function generateStaticParams() {
    return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const post = await getPostBySlug(slug);
    if (!post) return {};
    return {
        title: post.title,
        description: post.excerpt,
        openGraph: {
            title: post.title,
            description: post.excerpt,
            type: "article",
            publishedTime: post.date,
        },
    };
}

const TAG_COLORS = {
    yellow: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    blue:   "border-blue-400/30 bg-blue-400/10 text-blue-300",
    green:  "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    purple: "border-violet-400/30 bg-violet-400/10 text-violet-300",
    red:    "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

export default async function BlogPostPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const post = await getPostBySlug(slug);
    if (!post) notFound();

    return (
        <Container className="py-12">
            <div className="mx-auto max-w-2xl">

                {/* ── Назад ──────────────────────────────────────────── */}
                <Link
                    href="/blog"
                    className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Все статьи
                </Link>

                {/* ── Шапка статьи ───────────────────────────────────── */}
                <article>
                    <header className="mb-10">
                        {/* Обложка */}
                        <div className={`relative mb-8 h-56 overflow-hidden rounded-2xl bg-gradient-to-b ${post.coverGradient} bg-surface`}>
                            {post.coverImage ? (
                                <>
                                    <Image
                                        src={post.coverImage}
                                        alt=""
                                        aria-hidden="true"
                                        fill
                                        className="object-cover opacity-45"
                                        sizes="(max-width: 768px) 100vw, 672px"
                                        priority
                                    />
                                    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
                                    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                                </>
                            ) : (
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 opacity-[0.06]"
                                    style={{
                                        backgroundImage:
                                            "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                                        backgroundSize: "32px 32px",
                                    }}
                                />
                            )}
                            <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                            <span className={`absolute left-5 top-5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${TAG_COLORS[post.tagColor]}`}>
                                {post.tag}
                            </span>
                        </div>

                        {/* Мета */}
                        <div className="mb-4 flex items-center gap-3 text-xs text-muted/70">
                            <time dateTime={post.date}>{formatDate(post.date)}</time>
                            <span aria-hidden="true">·</span>
                            <span>{post.readingTime} мин чтения</span>
                        </div>

                        <h1 className="text-3xl font-black leading-tight text-foreground sm:text-4xl">
                            {post.title}
                        </h1>
                        <p className="mt-4 text-lg leading-relaxed text-muted">
                            {post.excerpt}
                        </p>
                    </header>

                    {/* ── Тело статьи ──────────────────────────────────── */}
                    <div
                        // Контент генерируется нашим remark-парсером из .md файлов, не из пользовательского ввода
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.contentHtml) }}
                        className={[
                            "prose-blog",
                            "text-[15px] leading-[1.85] text-muted",
                            // Заголовки
                            "[&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground",
                            "[&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
                            // Параграфы
                            "[&_p]:mb-5",
                            // Списки
                            "[&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul>li]:mb-1.5",
                            "[&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol>li]:mb-1.5",
                            // Жирный и курсив
                            "[&_strong]:font-semibold [&_strong]:text-foreground",
                            "[&_em]:italic [&_em]:text-foreground/80",
                            // Ссылки
                            "[&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/40 hover:[&_a]:decoration-accent",
                            // Горизонтальная линия
                            "[&_hr]:my-8 [&_hr]:border-white/10",
                            // Цитаты
                            "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:pl-5 [&_blockquote]:text-muted/80 [&_blockquote]:italic",
                            // Код
                            "[&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-accent/90",
                            "[&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-white/[0.05] [&_pre]:p-4",
                        ].join(" ")}
                    />
                </article>

                {/* ── Подвал статьи ──────────────────────────────────── */}
                <div className="mt-12 border-t border-white/10 pt-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted">
                            Понравилась статья? Поделитесь с теми, кому она поможет.
                        </p>
                        <Link
                            href="/blog"
                            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-muted transition-all hover:border-white/25 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            ← Все статьи
                        </Link>
                    </div>
                </div>
            </div>
        </Container>
    );
}
