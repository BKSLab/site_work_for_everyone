import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import DOMPurify from "isomorphic-dompurify";
import { ArticleFooter } from "@/components/features/blog/ArticleFooter";
import { RelatedPosts } from "@/components/features/blog/RelatedPosts";
import { getAllSlugs, getPostBySlug, getRelatedPosts } from "@/lib/blog/posts";
import type { BlogPost } from "@/lib/blog/posts";
import { FocusHeading } from "@/components/ui/FocusHeading";
import styles from "./BlogPost.module.css";

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
        alternates: { canonical: `/blog/${slug}` },
        openGraph: {
            title: post.title,
            description: post.excerpt,
            url: `/blog/${slug}`,
            type: "article",
            publishedTime: post.date,
            ...(post.coverImage && {
                images: [{ url: post.coverImage, width: 1200, height: 630 }],
            }),
        },
    };
}

const TAG_COLORS: Record<BlogPost["tagColor"], string> = {
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
    const relatedPosts = getRelatedPosts(post);

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt,
        datePublished: post.date,
        url: `https://work-for-everyone.ru/blog/${slug}`,
        ...(post.coverImage && { image: `https://work-for-everyone.ru${post.coverImage}` }),
        author: { "@type": "Person", name: "Барабанщиков Кирилл" },
        publisher: {
            "@type": "Organization",
            name: "Работа для всех",
            url: "https://work-for-everyone.ru",
        },
    };

    return (
        <div className={styles.container}>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className={`${styles.layout} ${relatedPosts.length > 0 ? styles.withRelated : ""}`}>
                <div className={styles.articleColumn}>

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

                            {/* Тег + дата + время чтения */}
                            <div className="mb-5 flex flex-wrap items-center gap-3">
                                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TAG_COLORS[post.tagColor]}`}>
                                    {post.tag}
                                </span>
                                <time dateTime={post.date} className="text-xs text-muted">
                                    {formatDate(post.date)}
                                </time>
                            </div>

                            <FocusHeading className="text-3xl font-black leading-tight text-foreground sm:text-4xl">
                                {post.title}
                            </FocusHeading>
                            <p className="mt-4 text-lg leading-relaxed text-foreground/80">
                                {post.excerpt}
                            </p>

                            {/* Обложка — просто картинка, без контейнера и рамки */}
                            {post.coverImage && (
                                <Image
                                    src={post.coverImage}
                                    alt={`Обложка статьи: ${post.title}`}
                                    width={800}
                                    height={500}
                                    className="mt-8 w-full h-auto rounded-xl"
                                    priority
                                />
                            )}
                        </header>

                        {/* ── Тело статьи ──────────────────────────────────── */}
                        <div
                            // Контент генерируется нашим remark-парсером из .md файлов, не из пользовательского ввода
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.contentHtml) }}
                            className={[
                                "prose-blog",
                                "text-[16px] leading-[1.85] text-foreground/90",
                                // Заголовки
                                "[&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground",
                                "[&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
                                "[&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-base [&_h4]:font-medium [&_h4]:text-foreground",
                                // Параграфы
                                "[&_p]:mb-5",
                                // Списки
                                "[&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul>li]:mb-1.5",
                                "[&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol>li]:mb-1.5",
                                // Жирный и курсив
                                "[&_strong]:font-semibold [&_strong]:text-foreground",
                                "[&_em]:italic [&_em]:text-foreground/90",
                                // Ссылки
                                "[&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/40 hover:[&_a]:decoration-accent",
                                // Горизонтальная линия
                                "[&_hr]:my-8 [&_hr]:border-white/10",
                                // Цитаты
                                "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:pl-5 [&_blockquote]:text-foreground/85 [&_blockquote]:italic",
                                // Код
                                "[&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-accent/90",
                                "[&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-white/[0.05] [&_pre]:p-4",
                                // Картинки — без обрезки, оригинальные пропорции
                                "[&_img]:my-6 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl",
                            ].join(" ")}
                        />
                    </article>

                    <ArticleFooter title={post.title} excerpt={post.excerpt} />
                </div>
                <RelatedPosts posts={relatedPosts} tag={post.tag} />
            </div>
        </div>
    );
}
