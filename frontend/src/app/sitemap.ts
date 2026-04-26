import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog/posts";

const BASE = "https://work-for-everyone.ru";

export default function sitemap(): MetadataRoute.Sitemap {
    const posts = getAllPosts();

    const staticRoutes: MetadataRoute.Sitemap = [
        { url: BASE,              lastModified: new Date(), priority: 1.0, changeFrequency: "daily"   },
        { url: `${BASE}/blog`,    lastModified: new Date(), priority: 0.9, changeFrequency: "weekly"  },
        { url: `${BASE}/vacancies`, lastModified: new Date(), priority: 0.8, changeFrequency: "daily" },
        { url: `${BASE}/contact`, lastModified: new Date(), priority: 0.5, changeFrequency: "monthly" },
        { url: `${BASE}/privacy`, lastModified: new Date(), priority: 0.3, changeFrequency: "yearly"  },
    ];

    const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
        url: `${BASE}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        priority: 0.7,
        changeFrequency: "monthly" as const,
    }));

    return [...staticRoutes, ...blogRoutes];
}
