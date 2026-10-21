import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Vacancy } from "@/types/vacancy";
import FavoritesPage from "@/app/favorites/page";
import { useAuthStore } from "@/stores/auth";

const mocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), detail: vi.fn(), params: new URLSearchParams(), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    return {
        useRouter: () => mocks.router,
        useSearchParams: () => useSyncExternalStore((callback) => {
            window.addEventListener("test-navigation", callback);
            return () => window.removeEventListener("test-navigation", callback);
        }, () => mocks.params),
    };
});
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/api", () => ({ favoritesApi: {
    getList: mocks.list, remove: mocks.remove, getById: mocks.detail,
} }));

function vacancy(index: number) {
    return { vacancy_id: String(index), vacancy_name: `Вакансия ${index}`, employer_name: "Компания", vacancy_source: "hh.ru" } as Vacancy;
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}><FavoritesPage /><button>Другой раздел</button></QueryClientProvider>);
}

describe("favorites removal and focus", () => {
    let serverItems: Vacancy[];

    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        mocks.params = new URLSearchParams();
        const navigate = (destination: string) => {
            mocks.params = new URL(destination, "http://localhost").searchParams;
            window.dispatchEvent(new Event("test-navigation"));
        };
        mocks.router.push.mockImplementation(navigate);
        mocks.router.replace.mockImplementation(navigate);
        useAuthStore.getState().setUser({ email: "user@example.test", first_name: "Имя", last_name: "Фамилия" });
        serverItems = Array.from({ length: 11 }, (_, index) => vacancy(index + 1));
        mocks.list.mockImplementation(async (_userId: string, page: number, pageSize: number) => ({
            total: serverItems.length, page, page_size: pageSize, items: serverItems.slice((page - 1) * pageSize, page * pageSize),
        }));
        mocks.remove.mockImplementation(async ({ vacancy_id }: { vacancy_id: string }) => {
            serverItems = serverItems.filter((item) => item.vacancy_id !== vacancy_id);
        });
        mocks.detail.mockImplementation(async (id: string) => vacancy(Number(id)));
    });

    it("reports a named deletion error and retains the focused retry button", async () => {
        const user = userEvent.setup();
        mocks.remove.mockRejectedValue(new Error("offline"));
        renderPage();
        const button = await screen.findByRole("button", { name: "Удалить из избранного : Вакансия 1" });
        await user.click(button);
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Не удалось удалить «Вакансия 1»"));
        expect(button).toHaveFocus();
        expect(button).toHaveAttribute("aria-disabled", "false");
        expect(screen.getByRole("link", { name: "Подробнее : Вакансия 1 · Компания" })).toBeInTheDocument();
    });

    it("normalizes the last page after removing item 11 and focuses an existing card", async () => {
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole("button", { name: "Страница 2" }));
        await user.click(await screen.findByRole("button", { name: "Удалить из избранного : Вакансия 11" }));
        const lastLink = await screen.findByRole("link", { name: "Подробнее : Вакансия 10 · Компания" });
        await waitFor(() => expect(document.activeElement).not.toBe(document.body));
        expect(screen.queryByText("Список избранного пуст")).not.toBeInTheDocument();
        expect(screen.getAllByRole("article")).toHaveLength(10);
        expect(mocks.params.get("page")).toBe("1");
        expect(lastLink).toBeInTheDocument();
        await waitFor(() => expect(lastLink).toHaveFocus());
    });

    it("focuses the next card, then the true empty heading after sequential removals", async () => {
        serverItems = [vacancy(1), vacancy(2)];
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole("button", { name: "Удалить из избранного : Вакансия 1" }));
        await waitFor(() => expect(screen.getByRole("link", { name: "Подробнее : Вакансия 2 · Компания" })).toHaveFocus());
        await user.click(screen.getByRole("button", { name: "Удалить из избранного : Вакансия 2" }));
        await waitFor(() => expect(screen.getByRole("heading", { name: "Список избранного пуст" })).toHaveFocus());
    });

    it("does not steal focus after a deferred removal", async () => {
        const user = userEvent.setup();
        let finish!: () => void;
        mocks.remove.mockImplementation(({ vacancy_id }: { vacancy_id: string }) => new Promise<void>((resolve) => {
            finish = () => { serverItems = serverItems.filter((item) => item.vacancy_id !== vacancy_id); resolve(); };
        }));
        renderPage();
        await user.click(await screen.findByRole("button", { name: "Удалить из избранного : Вакансия 1" }));
        const outside = screen.getByRole("button", { name: "Другой раздел" });
        await user.click(outside);
        await act(async () => finish());
        await waitFor(() => expect(screen.queryByRole("link", { name: "Подробнее : Вакансия 1 · Компания" })).not.toBeInTheDocument());
        expect(outside).toHaveFocus();
    });

    it("restores a cold page 2 URL and keeps its pending target until that page has loaded", async () => {
        const returnKey = "favoriteReturnFocus:user@example.test";
        sessionStorage.setItem(returnKey, "11");
        mocks.params = new URLSearchParams("page=2");
        let finish!: () => void;
        mocks.list.mockImplementationOnce((_userId: string, page: number, pageSize: number) => new Promise((resolve) => {
            finish = () => resolve({ total: 11, page, page_size: pageSize, items: [vacancy(11)] });
        }));
        renderPage();
        expect(sessionStorage.getItem(returnKey)).toBe("11");
        await act(async () => finish());
        await waitFor(() => expect(screen.getByRole("link", { name: "Подробнее : Вакансия 11 · Компания" })).toHaveFocus());
        expect(sessionStorage.getItem(returnKey)).toBeNull();
        expect(mocks.list).toHaveBeenCalledWith("user@example.test", 2, 10);
    });

    it("uses an existing link when the saved return vacancy was removed", async () => {
        const returnKey = "favoriteReturnFocus:user@example.test";
        sessionStorage.setItem(returnKey, "removed");
        renderPage();
        await waitFor(() => expect(screen.getByRole("link", { name: "Подробнее : Вакансия 1 · Компания" })).toHaveFocus());
        expect(sessionStorage.getItem(returnKey)).toBeNull();
    });
});
