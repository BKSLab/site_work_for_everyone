import Link from "next/link";
import { getLatestPosts } from "@/lib/blog/posts";
import { BlogCard } from "./BlogCard";

export function BlogPreview() {
    const posts = getLatestPosts(3);

    return (
        <div className="flex flex-col gap-8">
            {/* Заголовок секции */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                        Блог
                    </p>
                    <h2 className="text-2xl font-black text-foreground">
                        Полезные статьи{" "}
                        <span className="text-accent">для соискателей</span>
                    </h2>
                </div>
                <Link
                    href="/blog"
                    className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-muted transition-all hover:border-white/25 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    Все статьи →
                </Link>
            </div>

            {/* Карточки */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                    <BlogCard key={post.slug} post={post} />
                ))}
            </div>
        </div>
    );
}
