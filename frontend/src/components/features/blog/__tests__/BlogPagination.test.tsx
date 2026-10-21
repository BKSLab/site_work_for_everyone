import type { AnchorHTMLAttributes } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlogPagination } from "../BlogPagination";

vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
afterEach(cleanup);

describe("BlogPagination", () => {
    it("does not expose an actionable previous link on the first page", () => {
        render(<BlogPagination currentPage={1} totalPages={3} buildHref={(page) => `/blog?page=${page}`} />);
        expect(screen.queryByRole("link", { name: "Предыдущая страница" })).toBeNull();
        expect(screen.getByText("Предыдущая страница недоступна").parentElement).not.toHaveAttribute("href");
        expect(screen.getByRole("link", { name: "Следующая страница" })).toHaveAttribute("href", "/blog?page=2");
        expect(screen.getByRole("link", { name: "Страница 1" })).toHaveAttribute("aria-current", "page");
    });

    it("keeps ordinary URLs and disables only the last edge", () => {
        render(<BlogPagination currentPage={3} totalPages={3} buildHref={(page) => `/blog?page=${page}`} />);
        expect(screen.getByRole("link", { name: "Предыдущая страница" })).toHaveAttribute("href", "/blog?page=2");
        expect(screen.queryByRole("link", { name: "Следующая страница" })).toBeNull();
        expect(screen.getByText("Следующая страница недоступна").parentElement).not.toHaveAttribute("href");
    });
});
