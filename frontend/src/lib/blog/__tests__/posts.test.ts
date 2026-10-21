import { beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => new Map<string, string>());
vi.mock("fs", () => ({ default: {
    existsSync: () => true,
    readdirSync: () => [...files.keys()],
    readFileSync: (filePath: string) => {
        const text = files.get(filePath.replace(/^.*[\\/]/, ""));
        if (text === undefined) throw new Error("Unknown test post");
        return text;
    },
} }));

import { getRelatedPosts } from "../posts";

function addPost(slug: string, tag: string, date: string) {
    files.set(`${slug}.md`, `---\ntitle: ${slug}\ntag: ${tag}\ndate: "${date}"\n---\nТекст статьи.`);
}

describe("getRelatedPosts", () => {
    beforeEach(() => {
        files.clear();
        addPost("current", "Технологии", "2026-10-20");
        addPost("other-topic", "Трудовые права", "2026-10-21");
        for (let day = 1; day <= 4; day++) addPost(`related-${day}`, "Технологии", `2026-10-0${day}`);
    });

    it("returns the latest posts with the same tag, excluding the current post", () => {
        expect(getRelatedPosts({ slug: "current", tag: "Технологии" }).map((post) => post.slug))
            .toEqual(["related-4", "related-3", "related-2"]);
    });

    it("respects the requested number of related posts", () => {
        expect(getRelatedPosts({ slug: "current", tag: "Технологии" }, 1).map((post) => post.slug))
            .toEqual(["related-4"]);
    });

    it("does not substitute unrelated posts when the topic has no other publications", () => {
        expect(getRelatedPosts({ slug: "other-topic", tag: "Трудовые права" })).toEqual([]);
    });

    it("returns no recommendations when the current post has no tag", () => {
        expect(getRelatedPosts({ slug: "current", tag: "" })).toEqual([]);
    });
});
