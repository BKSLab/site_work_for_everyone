import Image from "next/image";
import Link from "next/link";
import type { BlogPost } from "@/lib/blog/posts";
import styles from "./RelatedPosts.module.css";

export function RelatedPosts({ posts, tag }: { posts: BlogPost[]; tag: string }) {
    if (posts.length === 0) return null;

    return (
        <aside aria-labelledby="related-posts-heading" className={styles.related}>
            <h2 id="related-posts-heading" className={styles.heading}>По этой теме</h2>
            <p className={styles.topic}>{tag}</p>
            <ul role="list" className={styles.list}>
                {posts.map((post) => {
                    const titleId = `related-post-${post.slug}`;
                    return (
                        <li key={post.slug}>
                            <Link href={`/blog/${post.slug}`} aria-labelledby={titleId} className={styles.card}>
                                <span aria-hidden="true" className={styles.thumbnail}>
                                    {post.coverImage ? (
                                        <Image src={post.coverImage} alt="" width={52} height={52} className={styles.image} />
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Z" />
                                            <path d="M12 6v14" />
                                        </svg>
                                    )}
                                </span>
                                <div className={styles.body}>
                                    <time dateTime={post.date} className={styles.date}>
                                        {new Date(post.date).toLocaleDateString("ru-RU", {
                                            day: "numeric", month: "long", year: "numeric",
                                        })}
                                    </time>
                                    <h3 id={titleId} className={styles.title}>{post.title}</h3>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <Link href={`/blog?tag=${encodeURIComponent(tag)}`} className={styles.allPosts}>
                Все материалы по теме <span aria-hidden="true">→</span>
            </Link>
        </aside>
    );
}
