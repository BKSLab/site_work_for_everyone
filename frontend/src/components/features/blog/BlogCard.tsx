import Link from "next/link";
import type { BlogPost } from "@/lib/blog/posts";

// Цвет только у маленького бейджа тега — карточка сама нейтральная
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
            className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.13] bg-gradient-to-br from-white/[0.09] to-white/[0.04] transition-all duration-300 hover:border-white/[0.24] hover:from-white/[0.12] hover:to-white/[0.07] hover:shadow-[0_8px_36px_rgba(0,0,0,0.4)]"
        >
            {/* ── Декоративная шапка ─────────────────────────────────── */}
            <div className="relative h-[72px] overflow-hidden bg-white/[0.03]">

                {/* Тонкий глянцевый блик сверху */}
                <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
                />

                {/* Фоновая сетка-текстура */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                        backgroundSize: "20px 20px",
                    }}
                />

                {/* Нейтральный орб — лёгкое свечение */}
                <div
                    aria-hidden="true"
                    className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-accent/[0.12] blur-2xl"
                />

                {/* Тег и время чтения */}
                <div className="absolute inset-x-0 bottom-3 flex items-center justify-between px-4">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TAG_COLORS[post.tagColor]}`}>
                        {post.tag}
                    </span>
                    <span className="text-[11px] text-white/35">{post.readingTime}&nbsp;мин</span>
                </div>

                {/* Разделитель */}
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
            </div>

            {/* ── Контент ────────────────────────────────────────────── */}
            <div className="flex flex-1 flex-col gap-3 p-5">
                <h2 className="text-[15px] font-bold leading-snug text-foreground transition-colors duration-200 group-hover:text-accent">
                    {post.title}
                </h2>
                <p className="flex-1 text-[13px] leading-relaxed text-muted line-clamp-3">
                    {post.excerpt}
                </p>

                {/* Футер */}
                <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
                    <time dateTime={post.date} className="text-[11px] text-white/35">
                        {formatDate(post.date)}
                    </time>
                    <span
                        aria-hidden="true"
                        className="text-xs text-accent/50 transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent"
                    >
                        Читать →
                    </span>
                </div>
            </div>
        </Link>
    );
}
