import Image from "next/image";
import Link from "next/link";
import { getLatestPosts, type BlogPost } from "@/lib/blog/posts";
import { SectionHeading } from "@/components/ui/SectionHeading";
import styles from "./BlogPreview.module.css";

function PostMeta({ post }: { post: BlogPost }) {
    return (
        <span className={styles.meta}>
            <span className={styles.tag} data-tone={post.tagColor}>{post.tag}</span>
            <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                })}
            </time>
        </span>
    );
}

function FeaturedPost({ post }: { post: BlogPost }) {
    const titleId = `blog-featured-${post.slug}`;

    return (
        <Link href={`/blog/${post.slug}`} aria-labelledby={titleId} className={styles.featured}>
            <span className={styles.cover} aria-hidden="true">
                {post.coverImage && (
                    <Image
                        src={post.coverImage}
                        alt=""
                        fill
                        sizes="(max-width: 1023px) 100vw, 530px"
                        className={styles.image}
                    />
                )}
            </span>
            <div className={styles.featuredBody}>
                <PostMeta post={post} />
                <h3 id={titleId} className={styles.featuredTitle}>{post.title}</h3>
                <p className={styles.excerpt}>{post.excerpt}</p>
                <span className={styles.readMore} aria-hidden="true">
                    Читать статью <span>→</span>
                </span>
            </div>
        </Link>
    );
}

function CompactPost({ post }: { post: BlogPost }) {
    const titleId = `blog-preview-${post.slug}`;

    return (
        <li>
            <Link href={`/blog/${post.slug}`} aria-labelledby={titleId} className={styles.compact}>
                <span className={styles.thumbnail} aria-hidden="true">
                    {post.coverImage && (
                        <Image src={post.coverImage} alt="" fill sizes="72px" className={styles.image} />
                    )}
                </span>
                <div className={styles.compactBody}>
                    <PostMeta post={post} />
                    <h3 id={titleId} className={styles.compactTitle}>{post.title}</h3>
                </div>
            </Link>
        </li>
    );
}

export function BlogPreview() {
    const [featured, ...rest] = getLatestPosts(6);

    return (
        <div className={styles.preview}>
            <SectionHeading
                id="blog-heading"
                icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Z" />
                        <path d="M12 6v14M5 9h3M5 12h3M16 9h3M16 12h3" />
                    </svg>
                }
                action={<Link href="/blog" className={styles.allPosts}>Все материалы <span aria-hidden="true">→</span></Link>}
            >
                Полезные материалы
            </SectionHeading>
            {featured ? (
                <div className={styles.layout}>
                    <FeaturedPost post={featured} />
                    {rest.length > 0 && (
                        <ul role="list" aria-label="Другие статьи" className={styles.list}>
                            {rest.map((post) => <CompactPost key={post.slug} post={post} />)}
                        </ul>
                    )}
                </div>
            ) : (
                <p className={styles.empty}>Статьи скоро появятся.</p>
            )}
        </div>
    );
}
