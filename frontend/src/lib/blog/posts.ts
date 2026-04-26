import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    tag: string;
    tagColor: "yellow" | "blue" | "green" | "purple" | "red";
    coverImage?: string; // путь из /public, например "/blog/slug/cover.jpg"
}

export interface BlogPostFull extends BlogPost {
    contentHtml: string;
}

const CONTENT_DIR = path.join(process.cwd(), "content/blog");

// ─── Вспомогательные ──────────────────────────────────────────────────────────

function slugFromFilename(filename: string): string {
    return filename.replace(/\.md$/, "");
}

function parseFrontmatter(slug: string): BlogPost {
    const fullPath = path.join(CONTENT_DIR, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data } = matter(fileContents);

    return {
        slug,
        title:      data.title      ?? "",
        excerpt:    data.excerpt    ?? "",
        date:       data.date       ?? "",
        tag:        data.tag        ?? "",
        tagColor:   data.tagColor   ?? "yellow",
        coverImage: data.coverImage,
    };
}

// ─── Публичное API ────────────────────────────────────────────────────────────

export function getAllSlugs(): string[] {
    if (!fs.existsSync(CONTENT_DIR)) return [];
    return fs
        .readdirSync(CONTENT_DIR)
        .filter((f) => f.endsWith(".md"))
        .map(slugFromFilename);
}

export function getAllPosts(): BlogPost[] {
    return getAllSlugs()
        .map(parseFrontmatter)
        .sort((a, b) => b.date.localeCompare(a.date));
}

export function getLatestPosts(count: number): BlogPost[] {
    return getAllPosts().slice(0, count);
}

export const POSTS_PER_PAGE = 9;

export function getPagedPosts(
    page: number,
    tag?: string,
): { posts: BlogPost[]; total: number; totalPages: number } {
    const all = tag ? getAllPosts().filter((p) => p.tag === tag) : getAllPosts();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const posts = all.slice((safePage - 1) * POSTS_PER_PAGE, safePage * POSTS_PER_PAGE);
    return { posts, total, totalPages };
}

export async function getPostBySlug(slug: string): Promise<BlogPostFull | null> {
    const fullPath = path.join(CONTENT_DIR, `${slug}.md`);
    if (!fs.existsSync(fullPath)) return null;

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    const processed = await remark().use(remarkGfm).use(remarkHtml).process(content);
    const contentHtml = processed.toString();

    return {
        slug,
        title:       data.title       ?? "",
        excerpt:     data.excerpt     ?? "",
        date:        data.date        ?? "",
        tag:         data.tag         ?? "",
        tagColor:    data.tagColor    ?? "yellow",
        coverImage:  data.coverImage,
        contentHtml,
    };
}
