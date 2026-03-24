import Link from "next/link";
import Image from "next/image";
import type { BlogPost } from "@/lib/blog/posts";

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

export function BlogCard({ post }: { post: BlogPost }) {
    return (
        <Link
            href={`/blog/${post.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
            {/* Обложка */}
            <div className={`relative h-40 overflow-hidden bg-gradient-to-b ${post.coverGradient} bg-surface`}>

                {post.coverImage ? (
                    <>
                        {/* Картинка */}
                        <Image
                            src={post.coverImage}
                            alt=""
                            aria-hidden="true"
                            fill
                            className="object-cover opacity-40 transition-opacity duration-300 group-hover:opacity-50"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                        {/* Затемнение сверху — скрывает резкий верх картинки */}
                        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
                        {/* Затемнение снизу — плавный переход в фон карточки */}
                        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
                    </>
                ) : (
                    /* Декоративная сетка — фоллбэк без картинки */
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-[0.07]"
                        style={{
                            backgroundImage:
                                "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                            backgroundSize: "32px 32px",
                        }}
                    />
                )}

                {/* Акцентная линия снизу */}
                <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                {/* Тег */}
                <span className={`absolute left-4 top-4 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TAG_COLORS[post.tagColor]}`}>
                    {post.tag}
                </span>
            </div>

            {/* Контент */}
            <div className="flex flex-1 flex-col gap-3 p-5">
                <h3 className="text-[15px] font-bold leading-snug text-foreground transition-colors group-hover:text-accent">
                    {post.title}
                </h3>
                <p className="flex-1 text-[13px] leading-relaxed text-muted line-clamp-3">
                    {post.excerpt}
                </p>

                {/* Футер карточки */}
                <div className="flex items-center justify-between border-t border-white/8 pt-3">
                    <div className="flex items-center gap-3 text-[11px] text-muted/70">
                        <span>{formatDate(post.date)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{post.readingTime} мин</span>
                    </div>
                    <span
                        aria-hidden="true"
                        className="text-xs text-accent/60 transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent"
                    >
                        Читать →
                    </span>
                </div>
            </div>
        </Link>
    );
}
