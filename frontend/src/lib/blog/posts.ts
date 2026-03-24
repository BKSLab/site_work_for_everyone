import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    readingTime: number;
    tag: string;
    tagColor: "yellow" | "blue" | "green" | "purple" | "red";
    coverGradient: string;
    coverImage?: string; // путь из /public, например "/blog/cover.jpg"
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
        title:        data.title        ?? "",
        excerpt:      data.excerpt      ?? "",
        date:         data.date         ?? "",
        readingTime:  data.readingTime  ?? 5,
        tag:          data.tag          ?? "",
        tagColor:     data.tagColor     ?? "yellow",
        coverGradient: data.coverGradient ?? "from-amber-950/80 via-yellow-900/40 to-transparent",
        coverImage:    data.coverImage,
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

export async function getPostBySlug(slug: string): Promise<BlogPostFull | null> {
    const fullPath = path.join(CONTENT_DIR, `${slug}.md`);
    if (!fs.existsSync(fullPath)) return null;

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    const processed = await remark().use(remarkHtml).process(content);
    const contentHtml = processed.toString();

    return {
        slug,
        title:        data.title        ?? "",
        excerpt:      data.excerpt      ?? "",
        date:         data.date         ?? "",
        readingTime:  data.readingTime  ?? 5,
        tag:          data.tag          ?? "",
        tagColor:     data.tagColor     ?? "yellow",
        coverGradient: data.coverGradient ?? "from-amber-950/80 via-yellow-900/40 to-transparent",
        coverImage:    data.coverImage,
        contentHtml,
    };
}
